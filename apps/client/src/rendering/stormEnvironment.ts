import * as THREE from 'three';
import { ARENA_BLOCKS } from '@arena/shared';
import type { GraphicsQuality } from '../types/settings';

const SKY_TEXTURE_URL = '/materials/storm-sky-equirect.jpg';
const RAIN_DROP_COUNT = 3_200;

const createRain = (): {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
} => {
  const positions = new Float32Array(RAIN_DROP_COUNT * 3);
  for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
    const radius = 4 + Math.sqrt(((index * 73) % 997) / 997) * 25;
    const angle = index * 2.399963 + ((index * 29) % 17) * 0.03;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = ((index * 47) % 997) / 997 * 20 - 2;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: 1 },
    },
    vertexShader: `
      uniform float time;
      uniform float pixelRatio;
      varying float vRainDepth;
      void main() {
        vec3 drop = position;
        drop.y = mod(drop.y - time * 15.5 + 22.0, 22.0) - 2.0;
        vec4 mvPosition = modelViewMatrix * vec4(drop, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float distanceFade = clamp(26.0 / max(3.0, -mvPosition.z), 0.35, 1.35);
        gl_PointSize = 5.5 * pixelRatio * distanceFade;
        vRainDepth = distanceFade;
      }
    `,
    fragmentShader: `
      varying float vRainDepth;
      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float horizontal = smoothstep(0.11, 0.015, abs(centered.x));
        float vertical = smoothstep(0.52, 0.05, abs(centered.y));
        float head = smoothstep(0.48, -0.4, centered.y);
        float alpha = horizontal * vertical * head * 0.38 * vRainDepth;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(0.67, 0.82, 0.9, alpha);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return { points, material };
};

const createPuddleMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      tint: { value: new THREE.Color('#6f91a5') },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 tint;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      void main() {
        vec2 centered = vUv - 0.5;
        float edge = 1.0 - smoothstep(0.35, 0.5, length(centered));
        vec2 cell = floor(vWorldPosition.xz * 0.72);
        vec2 local = fract(vWorldPosition.xz * 0.72) - 0.5;
        float phase = hash21(cell) * 6.28318;
        float ring = sin(length(local) * 48.0 - time * 7.0 + phase);
        float ripple = smoothstep(0.82, 1.0, ring) * 0.12;
        float sheen = 0.18 + ripple;
        gl_FragColor = vec4(tint + ripple * 0.2, edge * sheen);
      }
    `,
  });

const createPuddles = (material: THREE.ShaderMaterial): THREE.Group => {
  const group = new THREE.Group();
  const placements: Array<[number, number, number, number]> = [
    [-20, -22, 4.8, 2.6],
    [-8, -17, 3.1, 1.7],
    [7, -21, 4.2, 2.2],
    [19, -13, 2.8, 1.5],
    [-18, -3, 3.4, 1.9],
    [4, -7, 3.9, 2.1],
    [17, 2, 4.6, 2.4],
    [-21, 11, 4, 2.1],
    [-4, 15, 3.2, 1.8],
    [11, 19, 5.2, 2.8],
    [22, 23, 3.5, 1.9],
  ];
  for (const [x, z, width, depth] of placements) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = x * 0.31 + z * 0.17;
    puddle.position.set(x, 0.018, z);
    puddle.scale.set(width, depth, 1);
    puddle.renderOrder = 2;
    group.add(puddle);
  }
  return group;
};

const createFacilityLights = (): THREE.Group => {
  const group = new THREE.Group();
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: '#d8eef2',
    roughness: 0.24,
    metalness: 0.18,
    emissive: '#bcefff',
    emissiveIntensity: 4.2,
  });
  const housingMaterial = new THREE.MeshStandardMaterial({
    color: '#171d22',
    roughness: 0.56,
    metalness: 0.74,
  });
  const placements: Array<[number, number, number, number]> = [];
  const eligibleBlocks = ARENA_BLOCKS.filter((block) => {
    const height = block.maxY - block.minY;
    return height > 2.4 && block.halfX > 0.9;
  });
  const stride = Math.max(1, Math.floor(eligibleBlocks.length / 9));
  for (let index = 0; index < eligibleBlocks.length; index += stride) {
    const block = eligibleBlocks[index];
    if (!block) continue;
    const side = placements.length % 2 === 0 ? 1 : -1;
    const faceDistance = (block.halfZ + 0.06) * side;
    placements.push([
      block.centerX + Math.sin(block.yaw) * faceDistance,
      Math.min(block.maxY - 0.42, 3.8),
      block.centerZ + Math.cos(block.yaw) * faceDistance,
      block.yaw + (side < 0 ? Math.PI : 0),
    ]);
    if (placements.length >= 9) break;
  }

  for (let index = 0; index < placements.length; index += 1) {
    const [x, y, z, yaw] = placements[index]!;
    const fixture = new THREE.Group();
    fixture.position.set(x, y, z);
    fixture.rotation.y = yaw;
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.18, 0.32),
      housingMaterial
    );
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.1),
      panelMaterial
    );
    panel.position.set(0, -0.095, 0.08);
    panel.rotation.x = Math.PI / 2;
    fixture.add(housing, panel);
    const light = new THREE.PointLight(
      index % 3 === 0 ? '#ffd7ad' : '#c9efff',
      index % 3 === 0 ? 10 : 8,
      11,
      2
    );
    light.position.set(0, -0.26, 0.25);
    fixture.add(light);
    group.add(fixture);
  }
  return group;
};

export interface StormEnvironment {
  update: (
    timeSeconds: number,
    cameraPosition: THREE.Vector3,
    quality: GraphicsQuality,
    pixelRatio: number
  ) => void;
  dispose: () => void;
}

export const createStormEnvironment = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): StormEnvironment => {
  const loader = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let skyTexture: THREE.Texture | null = null;
  let environmentTexture: THREE.Texture | null = null;
  loader.load(SKY_TEXTURE_URL, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    skyTexture = texture;
    scene.background = texture;
    const environmentTarget = pmrem.fromEquirectangular(texture);
    environmentTexture = environmentTarget.texture;
    scene.environment = environmentTexture;
    pmrem.dispose();
  });

  const rain = createRain();
  scene.add(rain.points);
  const puddleMaterial = createPuddleMaterial();
  const puddles = createPuddles(puddleMaterial);
  const lights = createFacilityLights();
  scene.add(puddles, lights);

  return {
    update: (timeSeconds, cameraPosition, quality, pixelRatio) => {
      rain.material.uniforms.time!.value = timeSeconds;
      rain.material.uniforms.pixelRatio!.value = Math.min(pixelRatio, 1.5);
      rain.points.position.set(cameraPosition.x, 0, cameraPosition.z);
      const visibleDrops =
        quality === 'high' ? RAIN_DROP_COUNT : quality === 'medium' ? 1_850 : 760;
      rain.points.geometry.setDrawRange(0, visibleDrops);
      rain.points.visible = true;
      puddleMaterial.uniforms.time!.value = timeSeconds;
      puddles.visible = quality !== 'low';
      lights.visible = quality !== 'low';
    },
    dispose: () => {
      rain.points.geometry.dispose();
      rain.material.dispose();
      puddleMaterial.dispose();
      scene.remove(rain.points, puddles, lights);
      skyTexture?.dispose();
      environmentTexture?.dispose();
    },
  };
};
