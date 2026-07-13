import * as THREE from 'three';
import {
  CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  SERVER_TICK_MS,
  WEAPON_SLOT_RIFLE,
  WEAPON_SLOT_SHOTGUN,
  WEAPON_SLOT_SNIPER,
  type WeaponSlot,
  WALK_SPEED,
  type AmmoPackView,
  type HealthPackView,
  type ImpactMarkView,
  type LocalPlayerState,
  type RemotePlayerState,
} from '@arena/shared';
import { createArena } from '../scene/createArena';
import type { GraphicsQuality } from '../types/settings';
import { loadPhotorealTextures, type WeaponMaterialSet } from './photorealMaterials';
import { createOperatorAvatar, type OperatorAvatar } from './operatorModels';
import { createStormEnvironment, type StormEnvironment } from './stormEnvironment';
import { createWeaponModels } from './weaponModels';

interface BloodBurstView {
  id: number;
  position: { x: number; y: number; z: number };
  createdAt: number;
  expiresAt: number;
}

interface RenderFrameState {
  localPlayer: LocalPlayerState;
  remotePlayers: RemotePlayerState[];
  ammoPacks: AmmoPackView[];
  healthPacks: HealthPackView[];
  impactMarks: ImpactMarkView[];
  bloodBursts: BloodBurstView[];
  scoped: boolean;
  weaponSlot: WeaponSlot;
  recoil: number;
  muzzleFlashVisible: boolean;
  walkPhase: number;
  walkIntensity: number;
  crouchAmount: number;
  crouched: boolean;
  reloadProgress: number;
  estimatedServerTimeMs: number;
  deltaSeconds: number;
}

type RemoteAvatar = OperatorAvatar;

interface RemoteDeathFxState {
  startedAt: number;
  position: THREE.Vector3;
  yaw: number;
}

const isFiniteVec3 = (value: { x: number; y: number; z: number }): boolean =>
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Number.isFinite(value.z);

// The hip pose keeps the weapon in a natural right-handed low-ready position.
// ADS compensates for the viewmodel's perspective projection so the optic lands
// on the exact HUD centerline instead of merely looking close to centered.
const WEAPON_HIP_X = -0.17;
const WEAPON_ADS_X = -0.2;
const WEAPON_WALK_SWAY_X = 0.025;
const WEAPON_WALK_SWAY_Y = 0.014;
const WEAPON_WALK_SWAY_YAW = 0.012;
const WEAPON_WALK_SWAY_ROLL = 0.024;
const WEAPON_HIP_Y = -0.25;
const WEAPON_ADS_Y = -0.17;
const WEAPON_HIP_Z = -0.68;
const WEAPON_ADS_Z = -0.58;
const WEAPON_HIP_YAW = -0.018;
const WEAPON_ADS_YAW = 0;
const WEAPON_HIP_ROLL = -0.025;
const WEAPON_ADS_ROLL = 0;
const WEAPON_POSE_RESPONSE = 15;

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly resizeObserver: ResizeObserver | null;
  private static readonly IMPACT_MARK_LIFETIME_MS = 20_000;
  private static readonly IMPACT_MARK_FADE_WINDOW_MS = 2_000;
  private static readonly REMOTE_DEATH_DURATION_MS = 540;
  private static readonly REMOTE_DEATH_FALL_MS = 220;
  private static readonly REMOTE_DEATH_FADE_START_MS = 170;
  private static readonly REMOTE_TELEPORT_HIDE_MS = 160;
  private static readonly REMOTE_TELEPORT_DISTANCE = 7.5;
  private readonly remotePlayers = new Map<string, RemoteAvatar>();
  private readonly remoteDeathFx = new Map<string, RemoteDeathFxState>();
  private readonly remoteTeleportHideUntil = new Map<string, number>();
  private readonly ammoPackMeshes = new Map<number, THREE.Group>();
  private readonly ammoPackActiveState = new Map<number, boolean>();
  private readonly ammoPackActivatedAt = new Map<number, number>();
  private readonly healthPackMeshes = new Map<number, THREE.Group>();
  private readonly healthPackActiveState = new Map<number, boolean>();
  private readonly healthPackActivatedAt = new Map<number, number>();
  private readonly impactMarkMeshes = new Map<number, THREE.Mesh>();
  private readonly bloodBurstMeshes = new Map<number, THREE.Group>();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly weaponRig: THREE.Group;
  private readonly rifleWeaponModel: THREE.Group;
  private readonly sniperWeaponModel: THREE.Group;
  private readonly shotgunWeaponModel: THREE.Group;
  private readonly weaponMaterials: WeaponMaterialSet;
  private readonly stormEnvironment: StormEnvironment;
  private readonly smoothedCameraPosition = new THREE.Vector3();
  private readonly targetCameraPosition = new THREE.Vector3();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly decalUp = new THREE.Vector3(0, 0, 1);
  private readonly scratchNormal = new THREE.Vector3();
  private readonly deathTintColor = new THREE.Color('#ff2e3f');
  private readonly scratchColor = new THREE.Color();
  private readonly activeRemoteIds = new Set<string>();
  private readonly activeAmmoPackIds = new Set<number>();
  private readonly activeHealthPackIds = new Set<number>();
  private readonly activeImpactIds = new Set<number>();
  private readonly activeBloodIds = new Set<number>();
  private graphicsQuality: GraphicsQuality = 'high';
  private baseFov = 80;
  private cameraPositionInitialized = false;
  private weaponPresentationX = WEAPON_HIP_X;
  private weaponPresentationY = WEAPON_HIP_Y;
  private weaponPresentationZ = WEAPON_HIP_Z;
  private weaponPresentationYaw = WEAPON_HIP_YAW;
  private weaponPresentationRoll = WEAPON_HIP_ROLL;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#09131b');
    this.scene.fog = new THREE.FogExp2('#0b1821', 0.024);

    this.camera = new THREE.PerspectiveCamera(
      this.baseFov,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    );
    this.camera.rotation.order = 'YXZ';

    const textures = loadPhotorealTextures();
    const ambient = new THREE.HemisphereLight('#9ab9c8', '#17232a', 1.36);
    const key = new THREE.DirectionalLight('#d7e7ef', 3.15);
    key.position.set(-12, 19, -9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 90;
    key.shadow.camera.left = -35;
    key.shadow.camera.right = 35;
    key.shadow.camera.top = 35;
    key.shadow.camera.bottom = -35;
    const coldFill = new THREE.DirectionalLight('#6fa6be', 1.18);
    coldFill.position.set(14, 8, 12);

    this.scene.add(ambient, key, coldFill, createArena(textures));
    this.stormEnvironment = createStormEnvironment(this.renderer, this.scene);
    this.setGraphicsQuality('medium');

    this.muzzleFlash = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.38, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffb15f',
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.muzzleFlash.rotation.x = -Math.PI / 2;
    this.muzzleFlash.position.set(0, 0.02, -0.84);
    this.muzzleFlash.visible = false;
    this.weaponRig = new THREE.Group();
    this.weaponRig.position.set(WEAPON_HIP_X, WEAPON_HIP_Y, WEAPON_HIP_Z);
    const weaponModels = createWeaponModels(textures.gunmetal);
    this.weaponMaterials = weaponModels.materials;
    this.rifleWeaponModel = weaponModels.rifle;
    this.sniperWeaponModel = weaponModels.sniper;
    this.shotgunWeaponModel = weaponModels.shotgun;
    this.weaponRig.add(
      this.rifleWeaponModel,
      this.sniperWeaponModel,
      this.shotgunWeaponModel
    );
    this.weaponRig.add(this.muzzleFlash);
    this.camera.add(this.weaponRig);
    const weaponFill = new THREE.PointLight('#c9e8f0', 1.15, 4.5, 1.7);
    weaponFill.position.set(0, 0.85, 0.45);
    this.camera.add(weaponFill);
    this.scene.add(this.camera);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.mount);
    } else {
      this.resizeObserver = null;
    }

    window.addEventListener('resize', this.handleResize);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
    this.stormEnvironment.dispose();
    if (this.mount.contains(this.renderer.domElement)) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }

  getInputElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    if (quality === this.graphicsQuality) {
      return;
    }

    this.graphicsQuality = quality;
    const pixelRatioCap =
      quality === 'low' ? 0.9 : quality === 'medium' ? 1.2 : 1.5;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, pixelRatioCap)
    );
    this.renderer.shadowMap.enabled = quality === 'high';
    this.scene.fog = new THREE.FogExp2(
      '#0b1821',
      quality === 'low' ? 0.032 : quality === 'medium' ? 0.026 : 0.021
    );
    this.renderer.setSize(
      this.mount.clientWidth,
      this.mount.clientHeight,
      false
    );
  }

  setFov(fov: number): void {
    if (Math.abs(this.baseFov - fov) < 0.01) {
      return;
    }

    this.baseFov = fov;
  }

  private readonly handleResize = (): void => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private createRifleWeaponModel(): THREE.Group {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color: '#202730',
      roughness: 0.48,
      metalness: 0.42,
    });
    const matte = new THREE.MeshStandardMaterial({
      color: '#12171d',
      roughness: 0.72,
      metalness: 0.18,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: '#7f8ea4',
      roughness: 0.35,
      metalness: 0.52,
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.1, 0.58),
      material
    );
    body.position.set(0, 0.015, -0.08);
    body.castShadow = true;
    group.add(body);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.08, 0.54),
      matte
    );
    upper.position.set(0, 0.065, -0.1);
    group.add(upper);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.5, 10),
      matte
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.055, -0.54);
    group.add(barrel);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.05, 10),
      accent
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.055, -0.8);
    group.add(muzzle);

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.11, 0.2),
      material
    );
    stock.position.set(-0.02, 0.005, 0.23);
    stock.rotation.y = 0.12;
    group.add(stock);

    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.09),
      accent
    );
    sight.position.set(0, 0.115, -0.18);
    group.add(sight);

    const rearSight = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.024, 0.042),
      accent
    );
    rearSight.position.set(0, 0.108, 0.04);
    group.add(rearSight);

    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.17, 0.074),
      matte
    );
    magazine.position.set(0.0, -0.13, -0.02);
    magazine.rotation.z = 0.08;
    group.add(magazine);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.15, 0.07),
      material
    );
    grip.position.set(0.012, -0.13, 0.09);
    grip.rotation.z = 0.24;
    group.add(grip);

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.014, 0.42),
      accent
    );
    rail.position.set(0, 0.108, -0.26);
    group.add(rail);

    return group;
  }

  private createSniperWeaponModel(): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.MeshStandardMaterial({
      color: '#242c35',
      roughness: 0.42,
      metalness: 0.5,
    });
    const matte = new THREE.MeshStandardMaterial({
      color: '#11161b',
      roughness: 0.72,
      metalness: 0.2,
    });
    const scopeMetal = new THREE.MeshStandardMaterial({
      color: '#8ea4bb',
      roughness: 0.3,
      metalness: 0.62,
    });

    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.09, 0.74),
      body
    );
    receiver.position.set(0, 0.02, -0.12);
    group.add(receiver);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.92, 12),
      matte
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.86);
    group.add(barrel);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12),
      scopeMetal
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.05, -1.33);
    group.add(muzzle);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.28), body);
    stock.position.set(-0.03, -0.01, 0.35);
    stock.rotation.y = 0.08;
    group.add(stock);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.15, 0.075),
      matte
    );
    grip.position.set(0.015, -0.13, 0.08);
    grip.rotation.z = 0.2;
    group.add(grip);

    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.5, 14),
      scopeMetal
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.12, -0.28);
    group.add(scope);

    const scopeFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.03, 14),
      scopeMetal
    );
    scopeFront.rotation.x = Math.PI / 2;
    scopeFront.position.set(0, 0.12, -0.52);
    group.add(scopeFront);

    const scopeBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.03, 14),
      scopeMetal
    );
    scopeBack.rotation.x = Math.PI / 2;
    scopeBack.position.set(0, 0.12, -0.04);
    group.add(scopeBack);

    return group;
  }

  private createShotgunWeaponModel(): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.MeshStandardMaterial({
      color: '#2a3138',
      roughness: 0.58,
      metalness: 0.34,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: '#13181f',
      roughness: 0.76,
      metalness: 0.16,
    });
    const wood = new THREE.MeshStandardMaterial({
      color: '#5f4430',
      roughness: 0.7,
      metalness: 0.04,
    });

    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.11, 0.42),
      body
    );
    receiver.position.set(0, 0.02, -0.02);
    group.add(receiver);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.74, 12),
      dark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.61);
    group.add(barrel);

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.62, 12),
      dark
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.01, -0.54);
    group.add(tube);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.055, 12),
      body
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.05, -1.0);
    group.add(muzzle);

    const foregrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.08, 0.18),
      wood
    );
    foregrip.position.set(0, -0.005, -0.41);
    group.add(foregrip);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.26), wood);
    stock.position.set(-0.03, -0.005, 0.29);
    stock.rotation.y = 0.1;
    group.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), dark);
    grip.position.set(0.014, -0.14, 0.11);
    grip.rotation.z = 0.24;
    group.add(grip);

    return group;
  }

  private createRemoteGunModel(): THREE.Group {
    const gun = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#272f38',
      roughness: 0.56,
      metalness: 0.35,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#12151b',
      roughness: 0.72,
      metalness: 0.16,
    });
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.38),
      darkMaterial
    );
    barrel.position.set(0, 0.015, -0.21);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.06, 0.24),
      bodyMaterial
    );
    body.position.set(0, 0, 0.02);
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.07, 0.12),
      bodyMaterial
    );
    stock.position.set(-0.012, -0.004, 0.15);
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.08, 0.04),
      darkMaterial
    );
    mag.position.set(0.0, -0.07, 0.03);
    gun.add(barrel, body, stock, mag);
    return gun;
  }

  private createRemotePlayerModel(): RemoteAvatar {
    const root = new THREE.Group();

    const shirt = new THREE.MeshStandardMaterial({
      color: '#3f7fa3',
      roughness: 0.68,
      metalness: 0.08,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: '#d1ad86',
      roughness: 0.82,
      metalness: 0.02,
    });
    const pants = new THREE.MeshStandardMaterial({
      color: '#324462',
      roughness: 0.74,
      metalness: 0.04,
    });
    const boots = new THREE.MeshStandardMaterial({
      color: '#2a313b',
      roughness: 0.8,
      metalness: 0.05,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.3), shirt);
    torso.position.set(0, 1.18, 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.55, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
    head.position.set(0, 0.19, 0);
    head.castShadow = true;
    head.receiveShadow = true;
    headPivot.add(head);
    root.add(headPivot);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.39, 1.44, 0);
    const leftArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.62, 0.18),
      skin
    );
    leftArm.position.set(0, -0.31, 0);
    leftArm.castShadow = true;
    leftArm.receiveShadow = true;
    leftArmPivot.add(leftArm);
    root.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.37, 1.43, -0.02);
    const rightArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.62, 0.18),
      skin
    );
    rightArm.position.set(0, -0.31, 0);
    rightArm.castShadow = true;
    rightArm.receiveShadow = true;
    rightArmPivot.add(rightArm);
    const heldGun = this.createRemoteGunModel();
    heldGun.position.set(-0.1, -0.36, -0.3);
    heldGun.rotation.set(-0.22, -0.03, 0.02);
    rightArmPivot.add(heldGun);
    root.add(rightArmPivot);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.16, 0.8, 0);
    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.78, 0.22),
      pants
    );
    leftLeg.position.set(0, -0.39, 0);
    leftLeg.castShadow = true;
    leftLeg.receiveShadow = true;
    const leftBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.14, 0.26),
      boots
    );
    leftBoot.position.set(0, -0.78, 0.02);
    leftLegPivot.add(leftLeg, leftBoot);
    root.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.16, 0.8, 0);
    const rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.78, 0.22),
      pants
    );
    rightLeg.position.set(0, -0.39, 0);
    rightLeg.castShadow = true;
    rightLeg.receiveShadow = true;
    const rightBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.14, 0.26),
      boots
    );
    rightBoot.position.set(0, -0.78, 0.02);
    rightLegPivot.add(rightLeg, rightBoot);
    root.add(rightLegPivot);

    const materials: THREE.MeshStandardMaterial[] = [];
    const baseColors: number[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      if (!(object.material instanceof THREE.MeshStandardMaterial)) {
        return;
      }
      object.material.transparent = false;
      object.material.opacity = 1;
      object.material.emissive.setRGB(0, 0, 0);
      materials.push(object.material);
      baseColors.push(object.material.color.getHex());
    });

    return {
      root,
      head: headPivot,
      torso,
      leftArm: leftArmPivot,
      rightArm: rightArmPivot,
      leftLeg: leftLegPivot,
      rightLeg: rightLegPivot,
      materials,
      baseColors,
    };
  }

  private resetRemoteAvatarAppearance(avatar: RemoteAvatar): void {
    for (let index = 0; index < avatar.materials.length; index += 1) {
      const material = avatar.materials[index]!;
      material.color.setHex(avatar.baseColors[index] ?? 0xffffff);
      material.emissive.setRGB(0, 0, 0);
      material.opacity = 1;
      material.transparent = false;
      material.needsUpdate = true;
    }
  }

  private applyRemoteDeathAppearance(
    avatar: RemoteAvatar,
    tintProgress: number,
    alpha: number
  ): void {
    const safeTint = Math.max(0, Math.min(1, tintProgress));
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    for (let index = 0; index < avatar.materials.length; index += 1) {
      const material = avatar.materials[index]!;
      const baseHex = avatar.baseColors[index] ?? 0xffffff;
      this.scratchColor.setHex(baseHex).lerp(this.deathTintColor, safeTint);
      material.color.copy(this.scratchColor);
      material.emissive.setRGB(0.3 * safeTint, 0, 0);
      material.opacity = safeAlpha;
      material.transparent = safeAlpha < 0.999;
      material.needsUpdate = true;
    }
  }

  private createAmmoPackModel(): THREE.Group {
    const group = new THREE.Group();
    const casingMat = new THREE.MeshStandardMaterial({
      color: '#8cdcff',
      roughness: 0.22,
      metalness: 0.72,
      emissive: '#00f5ff',
      emissiveIntensity: 0.26,
      transparent: true,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: '#c6f6ff',
      roughness: 0.16,
      metalness: 0.8,
      emissive: '#7ff7ff',
      emissiveIntensity: 0.2,
      transparent: true,
    });

    for (let index = 0; index < 6; index += 1) {
      const bullet = new THREE.Group();
      const casing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12),
        casingMat
      );
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.026, 0.08, 12),
        tipMat
      );
      tip.position.y = 0.16;
      bullet.add(casing, tip);
      const row = Math.floor(index / 3);
      const col = index % 3;
      bullet.position.set((col - 1) * 0.15, 0.15, (row - 0.5) * 0.16);
      group.add(bullet);
    }

    return group;
  }

  private createHealthPackModel(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: '#89f8b1',
      roughness: 0.32,
      metalness: 0.28,
      emissive: '#52ffa2',
      emissiveIntensity: 0.2,
      transparent: true,
    });

    const vertical = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.34, 0.1),
      material
    );
    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.1),
      material
    );
    group.add(vertical, horizontal);
    return group;
  }

  private ensureRemoteMesh(identity: string): RemoteAvatar {
    let avatar = this.remotePlayers.get(identity);
    if (avatar) {
      return avatar;
    }

    avatar = createOperatorAvatar(this.weaponMaterials);
    this.scene.add(avatar.root);
    this.remotePlayers.set(identity, avatar);
    return avatar;
  }

  private ensureAmmoPackMesh(id: number): THREE.Group {
    let mesh = this.ammoPackMeshes.get(id);
    if (mesh) {
      return mesh;
    }

    mesh = this.createAmmoPackModel();
    this.scene.add(mesh);
    this.ammoPackMeshes.set(id, mesh);
    return mesh;
  }

  private ensureHealthPackMesh(id: number): THREE.Group {
    let mesh = this.healthPackMeshes.get(id);
    if (mesh) {
      return mesh;
    }

    mesh = this.createHealthPackModel();
    this.scene.add(mesh);
    this.healthPackMeshes.set(id, mesh);
    return mesh;
  }

  private ensureImpactMarkMesh(id: number): THREE.Mesh {
    let mesh = this.impactMarkMeshes.get(id);
    if (mesh) {
      return mesh;
    }

    mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 12),
      new THREE.MeshBasicMaterial({
        color: '#0b1117',
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.scene.add(mesh);
    this.impactMarkMeshes.set(id, mesh);
    return mesh;
  }

  private ensureBloodBurstMesh(id: number): THREE.Group {
    let mesh = this.bloodBurstMeshes.get(id);
    if (mesh) {
      return mesh;
    }

    mesh = new THREE.Group();
    const seedBase = (id % 997) + 1;
    for (let index = 0; index < 7; index += 1) {
      const seed = seedBase * (index + 3);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + (seed % 3) * 0.01, 8, 8),
        new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? '#a01212' : '#d81f1f',
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        })
      );
      sphere.position.set(
        (((seed * 17) % 100) / 100 - 0.5) * 0.45,
        (((seed * 29) % 100) / 100 - 0.5) * 0.38,
        (((seed * 37) % 100) / 100 - 0.5) * 0.18
      );
      mesh.add(sphere);
    }

    this.scene.add(mesh);
    this.bloodBurstMeshes.set(id, mesh);
    return mesh;
  }

  private setPickupOpacity(mesh: THREE.Group, opacity: number): void {
    const previousOpacity =
      typeof mesh.userData.opacity === 'number'
        ? mesh.userData.opacity
        : Number.NaN;
    if (Math.abs(previousOpacity - opacity) < 0.01) {
      return;
    }
    mesh.userData.opacity = opacity;
    const transparent = opacity < 0.999;
    mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      const material = object.material as THREE.MeshStandardMaterial;
      const wasTransparent = material.transparent;
      material.opacity = opacity;
      material.transparent = transparent;
      if (wasTransparent !== transparent) {
        material.needsUpdate = true;
      }
    });
  }

  render(frame: RenderFrameState): void {
    const now = performance.now();
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const fullWidth = this.drawingBufferSize.x;
    const fullHeight = this.drawingBufferSize.y;
    if (fullWidth > 0 && fullHeight > 0) {
      const renderAspect = fullWidth / fullHeight;
      if (Math.abs(this.camera.aspect - renderAspect) > 0.0001) {
        this.camera.aspect = renderAspect;
        this.camera.updateProjectionMatrix();
      }
    }
    const walkBob = Math.sin(frame.walkPhase) * frame.walkIntensity * 0.032;
    const crouchEyeOffset = frame.crouched
      ? PLAYER_EYE_HEIGHT - CROUCH_EYE_HEIGHT
      : 0;
    this.targetCameraPosition.set(
      frame.localPlayer.position.x,
      frame.localPlayer.position.y + PLAYER_EYE_HEIGHT - crouchEyeOffset,
      frame.localPlayer.position.z
    );
    if (!this.cameraPositionInitialized) {
      this.smoothedCameraPosition.copy(this.targetCameraPosition);
      this.cameraPositionInitialized = true;
    } else {
      const blend = 1 - Math.exp(-18 * frame.deltaSeconds);
      this.smoothedCameraPosition.lerp(this.targetCameraPosition, blend);
      // Keep horizontal aim fully locked to gameplay coordinates so shots and scope stay centered.
      this.smoothedCameraPosition.x = this.targetCameraPosition.x;
      this.smoothedCameraPosition.z = this.targetCameraPosition.z;
    }

    const targetFov =
      frame.scoped && frame.weaponSlot !== WEAPON_SLOT_SNIPER
        ? Math.max(30, this.baseFov * 0.78)
        : this.baseFov;
    const nextFov =
      this.camera.fov +
      (targetFov - this.camera.fov) * Math.min(1, frame.deltaSeconds * 14);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.smoothedCameraPosition);
    this.camera.rotation.y = frame.localPlayer.yaw;
    this.camera.rotation.x = frame.localPlayer.pitch;
    this.stormEnvironment.update(
      now / 1000,
      this.camera.position,
      this.graphicsQuality,
      this.renderer.getPixelRatio()
    );
    this.muzzleFlash.visible = frame.muzzleFlashVisible;
    this.rifleWeaponModel.visible = frame.weaponSlot === WEAPON_SLOT_RIFLE;
    this.sniperWeaponModel.visible = frame.weaponSlot === WEAPON_SLOT_SNIPER;
    this.shotgunWeaponModel.visible = frame.weaponSlot === WEAPON_SLOT_SHOTGUN;
    const poseBlend = 1 - Math.exp(-WEAPON_POSE_RESPONSE * frame.deltaSeconds);
    const targetWeaponX = frame.scoped ? WEAPON_ADS_X : WEAPON_HIP_X;
    const targetWeaponY = frame.scoped ? WEAPON_ADS_Y : WEAPON_HIP_Y;
    const targetWeaponZ = frame.scoped ? WEAPON_ADS_Z : WEAPON_HIP_Z;
    const targetWeaponYaw = frame.scoped ? WEAPON_ADS_YAW : WEAPON_HIP_YAW;
    const targetWeaponRoll = frame.scoped ? WEAPON_ADS_ROLL : WEAPON_HIP_ROLL;
    this.weaponPresentationX = THREE.MathUtils.lerp(
      this.weaponPresentationX,
      targetWeaponX,
      poseBlend
    );
    this.weaponPresentationY = THREE.MathUtils.lerp(
      this.weaponPresentationY,
      targetWeaponY,
      poseBlend
    );
    this.weaponPresentationZ = THREE.MathUtils.lerp(
      this.weaponPresentationZ,
      targetWeaponZ,
      poseBlend
    );
    this.weaponPresentationYaw = THREE.MathUtils.lerp(
      this.weaponPresentationYaw,
      targetWeaponYaw,
      poseBlend
    );
    this.weaponPresentationRoll = THREE.MathUtils.lerp(
      this.weaponPresentationRoll,
      targetWeaponRoll,
      poseBlend
    );
    const adsAmount = THREE.MathUtils.clamp(
      (WEAPON_HIP_X - this.weaponPresentationX) / (WEAPON_HIP_X - WEAPON_ADS_X),
      0,
      1
    );
    const hipAmount = 1 - adsAmount;
    this.muzzleFlash.position.set(
      0,
      0.02,
      frame.weaponSlot === WEAPON_SLOT_SNIPER
        ? -1.11
        : frame.weaponSlot === WEAPON_SLOT_SHOTGUN
          ? -0.91
          : -0.84
    );
    const walkSwayX =
      Math.sin(frame.walkPhase) *
      frame.walkIntensity *
      WEAPON_WALK_SWAY_X *
      hipAmount;
    const walkSwayY =
      Math.cos(frame.walkPhase * 2) * frame.walkIntensity * WEAPON_WALK_SWAY_Y;
    const walkSwayYaw =
      Math.cos(frame.walkPhase) *
      frame.walkIntensity *
      WEAPON_WALK_SWAY_YAW *
      hipAmount;
    const walkSwayRoll =
      Math.sin(frame.walkPhase) *
      frame.walkIntensity *
      WEAPON_WALK_SWAY_ROLL *
      hipAmount;
    const reloadTilt = frame.reloadProgress * 0.22;
    const reloadDrop = frame.reloadProgress * 0.08;
    this.weaponRig.rotation.x =
      (frame.scoped ? -0.015 : -0.035) +
      frame.recoil * (frame.scoped ? 0.6 : 1.4) +
      walkSwayY +
      reloadTilt * 0.35;
    this.weaponRig.rotation.y = this.weaponPresentationYaw + walkSwayYaw;
    this.weaponRig.rotation.z = this.weaponPresentationRoll + walkSwayRoll;
    this.weaponRig.position.x = this.weaponPresentationX + walkSwayX;
    this.weaponRig.position.y =
      this.weaponPresentationY +
      frame.recoil * 0.08 +
      walkBob * 0.45 -
      reloadDrop -
      frame.crouchAmount * 0.08;
    this.weaponRig.position.z = this.weaponPresentationZ;

    const activeIds = this.activeRemoteIds;
    activeIds.clear();
    for (const player of frame.remotePlayers) {
      activeIds.add(player.identity);
    }

    for (const player of frame.remotePlayers) {
      const avatar = this.ensureRemoteMesh(player.identity);
      const mesh = avatar.root;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const moveRatio = Math.max(0, Math.min(1, speed / WALK_SPEED));
      const stridePhase = now * 0.008 + player.identity.length * 0.47;
      const strideSwing = player.alive
        ? Math.sin(stridePhase) * 0.78 * moveRatio
        : 0;
      const armSwing = player.alive
        ? Math.sin(stridePhase + Math.PI) * 0.56 * moveRatio
        : 0;

      if (player.alive) {
        const hadDeathFx = this.remoteDeathFx.has(player.identity);
        if (hadDeathFx) {
          this.remoteDeathFx.delete(player.identity);
          this.remoteTeleportHideUntil.set(
            player.identity,
            now + GameRenderer.REMOTE_TELEPORT_HIDE_MS
          );
        }
        const teleportDx = mesh.position.x - player.position.x;
        const teleportDy = mesh.position.y - player.position.y;
        const teleportDz = mesh.position.z - player.position.z;
        const teleportDistance =
          teleportDx * teleportDx +
          teleportDy * teleportDy +
          teleportDz * teleportDz;
        if (
          mesh.visible &&
          teleportDistance >
            GameRenderer.REMOTE_TELEPORT_DISTANCE *
              GameRenderer.REMOTE_TELEPORT_DISTANCE
        ) {
          this.remoteTeleportHideUntil.set(
            player.identity,
            now + GameRenderer.REMOTE_TELEPORT_HIDE_MS
          );
        }
        const hiddenUntil =
          this.remoteTeleportHideUntil.get(player.identity) ?? 0;
        this.resetRemoteAvatarAppearance(avatar);
        mesh.position.set(
          player.position.x,
          player.position.y,
          player.position.z
        );
        mesh.rotation.set(0, player.yaw, 0);
        avatar.head.rotation.x = player.pitch * 0.35;
        avatar.leftLeg.rotation.x = strideSwing;
        avatar.rightLeg.rotation.x = -strideSwing;
        avatar.leftArm.rotation.x = armSwing * 0.45 - 0.22;
        avatar.leftArm.rotation.y = 0.12;
        avatar.leftArm.rotation.z = -0.06;
        avatar.rightArm.rotation.x = -0.86 - armSwing * 0.26;
        avatar.rightArm.rotation.y = -0.16;
        avatar.rightArm.rotation.z = 0.1;
        mesh.visible = now >= hiddenUntil;
        continue;
      }

      let deathFx = this.remoteDeathFx.get(player.identity);
      if (!deathFx) {
        deathFx = {
          startedAt: now,
          position: new THREE.Vector3(
            player.position.x,
            player.position.y,
            player.position.z
          ),
          yaw: player.yaw,
        };
        this.remoteDeathFx.set(player.identity, deathFx);
      }

      const deathAgeMs = now - deathFx.startedAt;
      if (deathAgeMs >= GameRenderer.REMOTE_DEATH_DURATION_MS) {
        mesh.visible = false;
        continue;
      }

      const fallProgress = Math.max(
        0,
        Math.min(1, deathAgeMs / GameRenderer.REMOTE_DEATH_FALL_MS)
      );
      const easedFall = 1 - Math.pow(1 - fallProgress, 3);
      const tintProgress =
        deathAgeMs <= 220
          ? 0.65 + Math.abs(Math.sin(deathAgeMs * 0.11)) * 0.35
          : 0.55;
      const alpha =
        deathAgeMs <= GameRenderer.REMOTE_DEATH_FADE_START_MS
          ? 1
          : Math.max(
              0,
              1 -
                (deathAgeMs - GameRenderer.REMOTE_DEATH_FADE_START_MS) /
                  (GameRenderer.REMOTE_DEATH_DURATION_MS -
                    GameRenderer.REMOTE_DEATH_FADE_START_MS)
            );
      this.applyRemoteDeathAppearance(avatar, tintProgress, alpha);

      mesh.visible = true;
      mesh.position.copy(deathFx.position);
      mesh.position.y = deathFx.position.y - easedFall * 0.48;
      mesh.rotation.set(0, deathFx.yaw, -easedFall * 1.28);
      avatar.head.rotation.x = 0;
      avatar.leftLeg.rotation.x = 0.14 + easedFall * 0.22;
      avatar.rightLeg.rotation.x = -0.04 + easedFall * 0.2;
      avatar.leftArm.rotation.x = -0.48;
      avatar.leftArm.rotation.y = 0.08;
      avatar.leftArm.rotation.z = -0.28;
      avatar.rightArm.rotation.x = -1.15;
      avatar.rightArm.rotation.y = -0.12;
      avatar.rightArm.rotation.z = 0.02;
    }

    for (const [identity, avatar] of this.remotePlayers) {
      if (!activeIds.has(identity)) {
        this.remoteDeathFx.delete(identity);
        this.remoteTeleportHideUntil.delete(identity);
        this.resetRemoteAvatarAppearance(avatar);
        avatar.root.visible = false;
      }
    }

    const activePackIds = this.activeAmmoPackIds;
    activePackIds.clear();
    for (const pack of frame.ammoPacks) {
      activePackIds.add(pack.id);
      const mesh = this.ensureAmmoPackMesh(pack.id);
      const wasActive = this.ammoPackActiveState.get(pack.id) ?? false;
      if (pack.active && !wasActive) {
        this.ammoPackActivatedAt.set(pack.id, now);
      }
      this.ammoPackActiveState.set(pack.id, pack.active);

      mesh.visible = pack.active;
      if (!pack.active) {
        this.setPickupOpacity(mesh, 0);
        continue;
      }

      const activatedAt = this.ammoPackActivatedAt.get(pack.id) ?? now;
      const fadeAlpha = Math.min(1, Math.max(0, (now - activatedAt) / 280));
      this.setPickupOpacity(mesh, fadeAlpha);
      const bob = Math.sin((now + pack.id * 137) * 0.0018) * 0.06;
      mesh.position.set(
        pack.position.x,
        pack.position.y + 0.36 + bob,
        pack.position.z
      );
      mesh.rotation.y += frame.deltaSeconds * 0.55;
    }
    for (const [id, mesh] of this.ammoPackMeshes) {
      if (!activePackIds.has(id)) {
        mesh.visible = false;
        this.ammoPackActiveState.delete(id);
        this.ammoPackActivatedAt.delete(id);
      }
    }

    const activeHealthPackIds = this.activeHealthPackIds;
    activeHealthPackIds.clear();
    for (const pack of frame.healthPacks) {
      activeHealthPackIds.add(pack.id);
      const mesh = this.ensureHealthPackMesh(pack.id);
      const wasActive = this.healthPackActiveState.get(pack.id) ?? false;
      if (pack.active && !wasActive) {
        this.healthPackActivatedAt.set(pack.id, now);
      }
      this.healthPackActiveState.set(pack.id, pack.active);

      mesh.visible = pack.active;
      if (!pack.active) {
        this.setPickupOpacity(mesh, 0);
        continue;
      }

      const activatedAt = this.healthPackActivatedAt.get(pack.id) ?? now;
      const fadeAlpha = Math.min(1, Math.max(0, (now - activatedAt) / 280));
      this.setPickupOpacity(mesh, fadeAlpha);
      const bob = Math.sin((now + pack.id * 211) * 0.0017) * 0.05;
      mesh.position.set(
        pack.position.x,
        pack.position.y + 0.48 + bob,
        pack.position.z
      );
      mesh.rotation.y += frame.deltaSeconds * 0.45;
    }
    for (const [id, mesh] of this.healthPackMeshes) {
      if (!activeHealthPackIds.has(id)) {
        mesh.visible = false;
        this.healthPackActiveState.delete(id);
        this.healthPackActivatedAt.delete(id);
      }
    }

    const activeImpactIds = this.activeImpactIds;
    activeImpactIds.clear();
    for (const mark of frame.impactMarks) {
      if (!isFiniteVec3(mark.position) || !isFiniteVec3(mark.normal)) {
        continue;
      }
      const markAgeMs = Math.max(
        0,
        frame.estimatedServerTimeMs - mark.tick * SERVER_TICK_MS
      );
      if (markAgeMs >= GameRenderer.IMPACT_MARK_LIFETIME_MS) {
        continue;
      }
      const mesh = this.ensureImpactMarkMesh(mark.id);
      mesh.visible = true;
      mesh.position.set(
        mark.position.x + mark.normal.x * 0.02,
        mark.position.y + mark.normal.y * 0.02,
        mark.position.z + mark.normal.z * 0.02
      );
      const normal = this.scratchNormal
        .set(mark.normal.x, mark.normal.y, mark.normal.z)
        .normalize();
      mesh.quaternion.setFromUnitVectors(this.decalUp, normal);
      mesh.rotateZ(mark.id * 0.371);
      const markMaterial = mesh.material as THREE.MeshBasicMaterial;
      const fadeStart =
        GameRenderer.IMPACT_MARK_LIFETIME_MS -
        GameRenderer.IMPACT_MARK_FADE_WINDOW_MS;
      const fadeAlpha =
        markAgeMs <= fadeStart
          ? 1
          : Math.max(
              0,
              1 -
                (markAgeMs - fadeStart) /
                  GameRenderer.IMPACT_MARK_FADE_WINDOW_MS
            );
      markMaterial.opacity = 0.92 * fadeAlpha;
      activeImpactIds.add(mark.id);
    }
    for (const [id, mesh] of this.impactMarkMeshes) {
      if (!activeImpactIds.has(id)) {
        mesh.visible = false;
      }
    }

    const activeBloodIds = this.activeBloodIds;
    activeBloodIds.clear();
    for (const burst of frame.bloodBursts) {
      if (!isFiniteVec3(burst.position)) {
        continue;
      }
      activeBloodIds.add(burst.id);
      const mesh = this.ensureBloodBurstMesh(burst.id);
      const life = Math.max(
        0,
        Math.min(
          1,
          (now - burst.createdAt) / (burst.expiresAt - burst.createdAt)
        )
      );
      mesh.visible = true;
      mesh.position.set(
        burst.position.x,
        burst.position.y + life * 0.12,
        burst.position.z
      );
      mesh.scale.setScalar(1 + life * 0.35);
      mesh.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        const material = object.material as THREE.MeshBasicMaterial;
        material.opacity = 0.95 - life * 0.95;
      });
    }
    for (const [id, mesh] of this.bloodBurstMeshes) {
      if (!activeBloodIds.has(id)) {
        mesh.visible = false;
      }
    }

    if (frame.scoped && frame.weaponSlot === WEAPON_SLOT_SNIPER) {
      const canvasRect = this.renderer.domElement.getBoundingClientRect();
      const cssWidth = Math.max(1, canvasRect.width);
      const cssHeight = Math.max(1, canvasRect.height);
      const viewportWidth =
        typeof window === 'undefined' ? cssWidth : window.innerWidth;
      const viewportHeight =
        typeof window === 'undefined' ? cssHeight : window.innerHeight;
      const scopeSizeCss = Math.round(
        Math.min(viewportWidth, viewportHeight) * 0.62
      );
      const desiredCenterX = viewportWidth * 0.5 - canvasRect.left;
      const desiredCenterY = viewportHeight * 0.5 - canvasRect.top;
      const unclampedLeftCss = Math.round(desiredCenterX - scopeSizeCss * 0.5);
      const unclampedTopCss = Math.round(desiredCenterY - scopeSizeCss * 0.5);
      const scopeLeftCss = Math.max(
        0,
        Math.min(cssWidth - scopeSizeCss, unclampedLeftCss)
      );
      const scopeTopCss = Math.max(
        0,
        Math.min(cssHeight - scopeSizeCss, unclampedTopCss)
      );
      const bufferScaleX = fullWidth / cssWidth;
      const bufferScaleY = fullHeight / cssHeight;
      const scopeWidth = Math.max(1, Math.round(scopeSizeCss * bufferScaleX));
      const scopeHeight = Math.max(1, Math.round(scopeSizeCss * bufferScaleY));
      const scopeLeft = Math.round(scopeLeftCss * bufferScaleX);
      const scopeTop = Math.round(scopeTopCss * bufferScaleY);
      const scopeBottom = fullHeight - (scopeTop + scopeHeight);
      const basePassFov = this.camera.fov;
      const basePassAspect = this.camera.aspect;
      const zoomedFov = Math.max(10, this.baseFov * 0.25);

      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, fullWidth, fullHeight);
      this.renderer.render(this.scene, this.camera);

      this.camera.fov = zoomedFov;
      this.camera.aspect = scopeWidth / scopeHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.clearDepth();
      this.renderer.setViewport(
        scopeLeft,
        scopeBottom,
        scopeWidth,
        scopeHeight
      );
      this.renderer.setScissor(scopeLeft, scopeBottom, scopeWidth, scopeHeight);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, fullWidth, fullHeight);
      this.camera.fov = basePassFov;
      this.camera.aspect = basePassAspect;
      this.camera.updateProjectionMatrix();
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, fullWidth, fullHeight);
      this.renderer.render(this.scene, this.camera);
    }
  }
}
