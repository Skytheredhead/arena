import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Mesh,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ARENA_MAP, type ArenaMapDefinition } from '@arena/shared';
import type { PredictedPlayerState } from '../netcode/PredictionController';
import type { SnapshotSample } from '../netcode/SnapshotBuffer';
import type {
  CombatRuntimeEvent,
  PickupSnapshot,
  QualityPreset,
  Vector3Like,
  WeaponSlot,
} from '../netcode/contracts';
import { CombatEffects } from './CombatEffects';
import { MapScene } from './MapScene';
import { OperatorScene } from './OperatorScene';
import { PickupScene } from './PickupScene';
import { RainSystem } from './RainSystem';
import { visualQualityProfile } from './VisualQuality';
import {
  WeaponViewmodels,
  type ViewmodelMotion,
} from './WeaponViewmodels';

export interface GameRendererOptions {
  canvas: HTMLCanvasElement;
  map?: ArenaMapDefinition;
  quality?: QualityPreset;
  fov?: number;
}

export interface GameRenderFrame {
  deltaSeconds: number;
  elapsedSeconds: number;
  localPlayerId: string | null;
  localState: PredictedPlayerState | null;
  remotePlayers: ReadonlyMap<string, SnapshotSample>;
  motion: ViewmodelMotion;
}

export interface GameRenderMetrics {
  scoped: boolean;
  scopeAmount: number;
  crosshairSpread: number;
  indoorMix: number;
}

const createSky = (map: ArenaMapDefinition): Mesh => {
  const geometry = new SphereGeometry(150, 24, 12);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      upperColor: { value: new Color(map.atmosphere.skyColor).multiplyScalar(0.42) },
      horizonColor: { value: new Color('#17405a') },
      neonColor: { value: new Color('#6d0b69') },
    },
    vertexShader: `
      varying vec3 arenaWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        arenaWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 upperColor;
      uniform vec3 horizonColor;
      uniform vec3 neonColor;
      varying vec3 arenaWorldDirection;
      void main() {
        float h = clamp(arenaWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(horizonColor, upperColor, smoothstep(0.28, 0.88, h));
        float stormBand = exp(-pow((arenaWorldDirection.y + 0.06) * 7.5, 2.0));
        float neonStorm = 0.5 + 0.5 * sin(arenaWorldDirection.x * 8.0 + arenaWorldDirection.z * 5.0);
        color += neonColor * stormBand * neonStorm * 0.12;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new Mesh(geometry, material);
  sky.name = 'procedural-storm-sky';
  sky.frustumCulled = false;
  return sky;
};

export class GameRenderer {
  readonly map: ArenaMapDefinition;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly mapScene: MapScene;
  readonly rain: RainSystem;
  readonly operators = new OperatorScene();
  readonly pickups: PickupScene;
  readonly effects = new CombatEffects();
  readonly weapons = new WeaponViewmodels();

  readonly #composer: EffectComposer;
  readonly #bloom: UnrealBloomPass;
  readonly #sky: Mesh;
  readonly #sun: DirectionalLight;
  #quality: QualityPreset;
  #baseFov: number;
  #disposed = false;
  #lastWidth = 0;
  #lastHeight = 0;

  constructor(options: GameRendererOptions) {
    this.map = options.map ?? ARENA_MAP;
    this.#quality = options.quality ?? 'high';
    this.#baseFov = Math.max(55, Math.min(110, options.fov ?? 80));
    this.camera = new PerspectiveCamera(this.#baseFov, 1, 0.045, 240);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new WebGLRenderer({
      canvas: options.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene.background = new Color(this.map.atmosphere.skyColor);
    this.scene.fog = new Fog(
      this.map.atmosphere.fogColor,
      this.map.atmosphere.fogNear,
      this.map.atmosphere.fogFar
    );
    const ambientFill = new AmbientLight('#6f8fa2', 0.55);
    const hemisphere = new HemisphereLight(
      this.map.atmosphere.ambientColor,
      '#111b24',
      this.map.atmosphere.ambientIntensity * 1.55
    );
    this.#sun = new DirectionalLight('#8bbcd4', 1.35);
    this.#sun.position.set(-26, 34, 18);
    this.#sun.castShadow = true;
    this.#sun.shadow.camera.left = -48;
    this.#sun.shadow.camera.right = 48;
    this.#sun.shadow.camera.top = 45;
    this.#sun.shadow.camera.bottom = -45;
    this.#sun.shadow.camera.near = 1;
    this.#sun.shadow.camera.far = 100;
    this.#sun.shadow.bias = -0.00018;
    this.scene.add(ambientFill, hemisphere, this.#sun);

    this.#sky = createSky(this.map);
    this.scene.add(this.#sky);
    this.mapScene = new MapScene(this.map, this.#quality);
    this.rain = new RainSystem(this.map, this.#quality);
    this.pickups = new PickupScene(this.map);
    this.scene.add(
      this.mapScene.object,
      this.rain.object,
      this.operators.object,
      this.pickups.object,
      this.effects.object
    );
    this.camera.add(this.weapons.object);

    this.#composer = new EffectComposer(this.renderer);
    this.#composer.addPass(new RenderPass(this.scene, this.camera));
    this.#bloom = new UnrealBloomPass(new Vector2(1, 1), 0.4, 0.42, 0.9);
    this.#composer.addPass(this.#bloom);
    this.#composer.addPass(new OutputPass());
    this.setQuality(this.#quality);
    this.resize();
  }

  render(frame: GameRenderFrame): GameRenderMetrics {
    if (this.#disposed) {
      return {
        scoped: false,
        scopeAmount: 0,
        crosshairSpread: 0,
        indoorMix: 0,
      };
    }
    this.resize();
    const local = frame.localState;
    if (local) {
      this.camera.position.set(
        local.position.x,
        local.position.y + 1.62,
        local.position.z
      );
      this.camera.rotation.y = local.yaw;
      this.camera.rotation.x = local.pitch;
    }
    this.weapons.update(frame.deltaSeconds, frame.motion);
    const scoped = frame.motion.scoped && this.weapons.selectedWeapon === 2;
    const targetFov = MathUtils.lerp(
      this.#baseFov,
      30,
      this.weapons.scopeAmount
    );
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.operators.update(
      frame.remotePlayers,
      frame.localPlayerId,
      frame.elapsedSeconds
    );
    this.pickups.update(frame.elapsedSeconds);
    this.effects.update(frame.deltaSeconds);

    const indoorMix =
      local && this.mapScene.isIndoors(local.position) ? 1 : 0;
    this.rain.object.visible = indoorMix < 0.95;
    if (this.rain.object.visible) {
      this.rain.update(frame.deltaSeconds);
    }
    if (this.#quality === 'low') {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.#composer.render();
    }

    const weaponSpread =
      this.weapons.selectedWeapon === 2
        ? scoped
          ? 1.5
          : 13
        : this.weapons.selectedWeapon === 3
          ? 11
          : 5;
    return {
      scoped,
      scopeAmount: this.weapons.scopeAmount,
      crosshairSpread:
        weaponSpread +
        Math.min(14, frame.motion.speed * 0.8) +
        (frame.motion.sprinting ? 7 : 0),
      indoorMix,
    };
  }

  setQuality(quality: QualityPreset): void {
    this.#quality = quality;
    const profile = visualQualityProfile(quality);
    const devicePixelRatio =
      typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    const ratio = Math.min(profile.maxPixelRatio, devicePixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = quality !== 'low';
    const shadowSize = quality === 'high' ? 2048 : 1024;
    this.#sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.#bloom.strength = profile.bloomStrength;
    this.#bloom.radius = profile.bloomRadius;
    this.#bloom.threshold = profile.bloomThreshold;
    this.mapScene.setQuality(quality);
    this.rain.setQuality(quality);
    this.resize(true);
  }

  setFov(fov: number): void {
    if (!Number.isFinite(fov)) return;
    this.#baseFov = Math.max(55, Math.min(110, fov));
  }

  setWeapon(slot: WeaponSlot): void {
    this.weapons.setWeapon(slot);
  }

  triggerFire(slot: WeaponSlot): void {
    this.weapons.triggerFire(slot);
  }

  triggerReload(): void {
    this.weapons.triggerReload();
  }

  applyPickup(snapshot: PickupSnapshot): void {
    this.pickups.apply(snapshot);
  }

  applyCombatEvent(event: CombatRuntimeEvent): void {
    if (event.kind === 'impact' && event.position) {
      this.effects.spawnImpact(
        event.position,
        event.normal,
        event.targetId ? 'body' : 'concrete'
      );
    }
  }

  spawnTracer(
    from: Readonly<Vector3Like>,
    to: Readonly<Vector3Like>,
    weapon: WeaponSlot
  ): void {
    this.effects.spawnTracer(from, to, weapon);
  }

  removeRemotePlayer(id: string): void {
    this.operators.remove(id);
  }

  clearRuntimeEntities(): void {
    this.operators.clear();
  }

  resize(force = false): void {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth));
    const height = Math.max(
      1,
      Math.floor(canvas.clientHeight || window.innerHeight)
    );
    if (!force && width === this.#lastWidth && height === this.#lastHeight) return;
    this.#lastWidth = width;
    this.#lastHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.#composer.setSize(width, height);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.mapScene.dispose();
    this.rain.dispose();
    this.operators.dispose();
    this.pickups.dispose();
    this.effects.dispose();
    this.weapons.dispose();
    this.#sky.geometry.dispose();
    if (this.#sky.material instanceof ShaderMaterial) {
      this.#sky.material.dispose();
    }
    this.#composer.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
