import * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT,
  type AmmoPackView,
  type HealthPackView,
  type LocalPlayerState,
  type RemotePlayerState
} from '@arena/shared';
import { createArena } from '../scene/createArena';
import type { GraphicsQuality } from '../types/settings';

interface RenderFrameState {
  localPlayer: LocalPlayerState;
  remotePlayers: RemotePlayerState[];
  ammoPacks: AmmoPackView[];
  healthPacks: HealthPackView[];
  scoped: boolean;
  recoil: number;
  muzzleFlashVisible: boolean;
  deltaSeconds: number;
}

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly remotePlayers = new Map<string, THREE.Group>();
  private readonly remoteAliveState = new Map<string, boolean>();
  private readonly ammoPackMeshes = new Map<number, THREE.Group>();
  private readonly ammoPackActiveState = new Map<number, boolean>();
  private readonly ammoPackActivatedAt = new Map<number, number>();
  private readonly healthPackMeshes = new Map<number, THREE.Group>();
  private readonly healthPackActiveState = new Map<number, boolean>();
  private readonly healthPackActivatedAt = new Map<number, number>();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly weaponModel: THREE.Group;
  private readonly smoothedCameraPosition = new THREE.Vector3();
  private readonly targetCameraPosition = new THREE.Vector3();
  private graphicsQuality: GraphicsQuality = 'high';
  private baseFov = 80;
  private cameraPositionInitialized = false;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07111c');
    this.scene.fog = new THREE.Fog('#07111c', 18, 42);

    this.camera = new THREE.PerspectiveCamera(
      this.baseFov,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    );
    this.camera.rotation.order = 'YXZ';

    const ambient = new THREE.HemisphereLight('#7cc9ff', '#08111c', 1.5);
    const key = new THREE.DirectionalLight('#d0f5ff', 1.5);
    key.position.set(8, 16, -6);
    key.castShadow = false;

    this.scene.add(ambient, key, createArena());
    this.setGraphicsQuality('medium');

    this.muzzleFlash = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.35),
      new THREE.MeshBasicMaterial({ color: '#ff9f67' })
    );
    this.muzzleFlash.position.set(0.22, -0.18, -0.65);
    this.muzzleFlash.visible = false;
    this.weaponModel = this.createWeaponModel();
    this.camera.add(this.weaponModel);
    this.camera.add(this.muzzleFlash);
    this.scene.add(this.camera);

    window.addEventListener('resize', this.handleResize);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
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
    const pixelRatioCap = quality === 'low' ? 0.9 : quality === 'medium' ? 1.2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    this.scene.fog = quality === 'low'
      ? new THREE.Fog('#07111c', 16, 34)
      : quality === 'medium'
        ? new THREE.Fog('#07111c', 18, 42)
        : new THREE.Fog('#07111c', 20, 52);
    this.renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
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
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private createWeaponModel(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(0.28, -0.28, -0.55);

    const material = new THREE.MeshStandardMaterial({
      color: '#1c2d3d',
      roughness: 0.55,
      metalness: 0.38,
      emissive: '#00f5ff',
      emissiveIntensity: 0.08
    });
    const accent = new THREE.MeshStandardMaterial({
      color: '#00f5ff',
      roughness: 0.2,
      metalness: 0.7,
      emissive: '#00f5ff',
      emissiveIntensity: 0.35
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.7), material);
    body.castShadow = true;
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.65), material);
    barrel.position.set(0, 0.02, -0.58);
    group.add(barrel);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.24), material);
    stock.position.set(-0.08, -0.02, 0.36);
    stock.rotation.y = 0.18;
    group.add(stock);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.14), accent);
    sight.position.set(0, 0.12, -0.08);
    group.add(sight);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), material);
    grip.position.set(0.02, -0.18, -0.05);
    grip.rotation.z = 0.16;
    group.add(grip);

    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), accent);
    glow.position.set(0.08, 0.03, -0.1);
    group.add(glow);

    return group;
  }

  private createRemotePlayerModel(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#4cc1d7',
      roughness: 0.58,
      metalness: 0.18
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: '#00f5ff',
      roughness: 0.25,
      metalness: 0.72,
      emissive: '#00f5ff',
      emissiveIntensity: 0.12
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#172636',
      roughness: 0.7,
      metalness: 0.12
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.92, 0.42), bodyMat);
    torso.position.y = 1.08;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), accentMat);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.32), darkMat);
    pelvis.position.y = 0.52;
    pelvis.castShadow = true;
    group.add(pelvis);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), darkMat);
    leftLeg.position.set(-0.14, 0.14, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), darkMat);
    rightLeg.position.set(0.14, 0.14, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), darkMat);
    leftArm.position.set(-0.52, 1.06, 0);
    leftArm.rotation.z = 0.1;
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), darkMat);
    rightArm.position.set(0.52, 1.06, 0);
    rightArm.rotation.z = -0.14;
    rightArm.castShadow = true;
    group.add(rightArm);

    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.78), accentMat);
    rifle.position.set(0.18, 1.02, -0.34);
    rifle.rotation.x = Math.PI * 0.5;
    rifle.rotation.z = -0.12;
    rifle.castShadow = true;
    group.add(rifle);

    return group;
  }

  private createAmmoPackModel(): THREE.Group {
    const group = new THREE.Group();
    const casingMat = new THREE.MeshStandardMaterial({
      color: '#8cdcff',
      roughness: 0.22,
      metalness: 0.72,
      emissive: '#00f5ff',
      emissiveIntensity: 0.26,
      transparent: true
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: '#c6f6ff',
      roughness: 0.16,
      metalness: 0.8,
      emissive: '#7ff7ff',
      emissiveIntensity: 0.2,
      transparent: true
    });

    for (let index = 0; index < 6; index += 1) {
      const bullet = new THREE.Group();
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), casingMat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 12), tipMat);
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
      transparent: true
    });

    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), material);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), material);
    group.add(vertical, horizontal);
    return group;
  }

  private ensureRemoteMesh(identity: string): THREE.Group {
    let mesh = this.remotePlayers.get(identity);
    if (mesh) {
      return mesh;
    }

    mesh = this.createRemotePlayerModel();
    this.scene.add(mesh);
    this.remotePlayers.set(identity, mesh);
    return mesh;
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

  private setPickupOpacity(mesh: THREE.Group, opacity: number): void {
    mesh.traverse(object => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      const material = object.material as THREE.MeshStandardMaterial;
      material.opacity = opacity;
      material.transparent = opacity < 0.999;
      material.needsUpdate = true;
    });
  }

  render(frame: RenderFrameState): void {
    const now = performance.now();
    this.targetCameraPosition.set(
      frame.localPlayer.position.x,
      frame.localPlayer.position.y + PLAYER_EYE_HEIGHT,
      frame.localPlayer.position.z
    );
    if (!this.cameraPositionInitialized) {
      this.smoothedCameraPosition.copy(this.targetCameraPosition);
      this.cameraPositionInitialized = true;
    } else {
      const blend = 1 - Math.exp(-18 * frame.deltaSeconds);
      this.smoothedCameraPosition.lerp(this.targetCameraPosition, blend);
    }

    const targetFov = frame.scoped ? Math.max(30, this.baseFov * 0.78) : this.baseFov;
    const nextFov =
      this.camera.fov + (targetFov - this.camera.fov) * Math.min(1, frame.deltaSeconds * 14);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.smoothedCameraPosition);
    this.camera.rotation.y = frame.localPlayer.yaw;
    this.camera.rotation.x = frame.localPlayer.pitch + frame.recoil;
    this.muzzleFlash.visible = frame.muzzleFlashVisible;
    const sway = frame.scoped ? 0 : Math.sin(now * 0.008) * 0.004;
    this.weaponModel.rotation.x = (frame.scoped ? -0.02 : -0.08) + frame.recoil * (frame.scoped ? 0.6 : 1.4);
    this.weaponModel.rotation.y = (frame.scoped ? 0 : -0.04) - frame.recoil * 0.3;
    this.weaponModel.position.x = (frame.scoped ? 0.02 : 0.28) + sway;
    this.weaponModel.position.y = (frame.scoped ? -0.18 : -0.28) + frame.recoil * 0.08;
    this.weaponModel.position.z = frame.scoped ? -0.45 : -0.55;

    const activeIds = new Set(frame.remotePlayers.map(player => player.identity));

    for (const player of frame.remotePlayers) {
      const mesh = this.ensureRemoteMesh(player.identity);
      mesh.visible = player.alive;
      mesh.position.set(player.position.x, player.position.y, player.position.z);
      mesh.rotation.y = player.yaw;
      const previousAlive = this.remoteAliveState.get(player.identity);
      if (previousAlive !== player.alive) {
        const tint = player.alive ? '#81e6d9' : '#334155';
        mesh.traverse(object => {
          if (object instanceof THREE.Mesh) {
            const material = object.material as THREE.MeshStandardMaterial;
            material.color.set(tint);
            material.emissive?.set(player.alive ? '#00f5ff' : '#000000');
            material.emissiveIntensity = player.alive ? 0.08 : 0;
          }
        });
        this.remoteAliveState.set(player.identity, player.alive);
      }
    }

    for (const [identity, mesh] of this.remotePlayers) {
      if (!activeIds.has(identity)) {
        mesh.visible = false;
      }
    }

    const activePackIds = new Set(frame.ammoPacks.map(pack => pack.id));
    for (const pack of frame.ammoPacks) {
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
      mesh.position.set(pack.position.x, pack.position.y + 0.36 + bob, pack.position.z);
      mesh.rotation.y += frame.deltaSeconds * 0.55;
    }
    for (const [id, mesh] of this.ammoPackMeshes) {
      if (!activePackIds.has(id)) {
        mesh.visible = false;
        this.ammoPackActiveState.delete(id);
        this.ammoPackActivatedAt.delete(id);
      }
    }

    const activeHealthPackIds = new Set(frame.healthPacks.map(pack => pack.id));
    for (const pack of frame.healthPacks) {
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
      mesh.position.set(pack.position.x, pack.position.y + 0.48 + bob, pack.position.z);
      mesh.rotation.y += frame.deltaSeconds * 0.45;
    }
    for (const [id, mesh] of this.healthPackMeshes) {
      if (!activeHealthPackIds.has(id)) {
        mesh.visible = false;
        this.healthPackActiveState.delete(id);
        this.healthPackActivatedAt.delete(id);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
