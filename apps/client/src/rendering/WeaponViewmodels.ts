import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three';
import { weaponForSlot } from '@arena/shared';
import type { WeaponSlot } from '../netcode/contracts';

export interface ViewmodelMotion {
  speed: number;
  grounded: boolean;
  sprinting: boolean;
  scoped: boolean;
  reloading: boolean;
  reloadProgress: number;
}

const damp = (
  current: number,
  target: number,
  lambda: number,
  deltaSeconds: number
): number =>
  target + (current - target) * Math.exp(-lambda * Math.max(0, deltaSeconds));

const mesh = (
  geometry: BoxGeometry | CylinderGeometry | SphereGeometry,
  material: MeshStandardMaterial | MeshBasicMaterial
): Mesh => {
  const result = new Mesh(geometry, material);
  result.castShadow = false;
  result.receiveShadow = false;
  return result;
};

export class WeaponViewmodels {
  readonly object = new Group();
  readonly #weapons = new Map<WeaponSlot, Group>();
  readonly #gunmetal = new MeshStandardMaterial({
    color: new Color('#263b45'),
    roughness: 0.32,
    metalness: 0.78,
    emissive: new Color('#263b45'),
    emissiveIntensity: 0.48,
  });
  readonly #dark = new MeshStandardMaterial({
    color: new Color('#0b131a'),
    roughness: 0.55,
    metalness: 0.45,
    emissive: new Color('#0b131a'),
    emissiveIntensity: 0.55,
  });
  readonly #cyan = new MeshStandardMaterial({
    color: new Color('#0c6070'),
    roughness: 0.2,
    metalness: 0.74,
    emissive: new Color('#00d9ff'),
    emissiveIntensity: 0.32,
  });
  readonly #magenta = new MeshStandardMaterial({
    color: new Color('#6e194f'),
    roughness: 0.28,
    metalness: 0.72,
    emissive: new Color('#ff1d9c'),
    emissiveIntensity: 0.38,
  });
  readonly #muzzleMaterial = new MeshBasicMaterial({
    color: new Color('#dffcff'),
    transparent: true,
    opacity: 0,
    toneMapped: false,
  });
  readonly #muzzleFlash = mesh(
    new SphereGeometry(0.07, 8, 6),
    this.#muzzleMaterial
  );
  readonly #muzzleLight = new PointLight('#a8f7ff', 0, 2.8, 2);

  #selected: WeaponSlot = 1;
  #recoil = 0;
  #recoilYaw = 0;
  #switchAmount = 1;
  #scopeAmount = 0;
  #muzzleLife = 0;
  #bobTime = 0;

  constructor() {
    this.object.name = 'first-person-weapons';
    this.#weapons.set(1, this.#createRifle());
    this.#weapons.set(2, this.#createSniper());
    this.#weapons.set(3, this.#createShotgun());
    for (const [slot, weapon] of this.#weapons) {
      weapon.visible = slot === this.#selected;
      this.object.add(weapon);
    }
    this.object.add(this.#muzzleFlash, this.#muzzleLight);
    this.#placeMuzzle();
  }

  setWeapon(slot: WeaponSlot): void {
    if (slot === this.#selected) return;
    this.#selected = slot;
    this.#switchAmount = 0;
    for (const [candidate, weapon] of this.#weapons) {
      weapon.visible = candidate === slot;
    }
    this.#placeMuzzle();
  }

  triggerFire(slot: WeaponSlot = this.#selected): void {
    if (slot !== this.#selected) this.setWeapon(slot);
    const definition = weaponForSlot(slot);
    this.#recoil = Math.min(1.35, this.#recoil + definition.recoilPitch * 13);
    this.#recoilYaw +=
      (Math.random() * 2 - 1) * definition.recoilYaw * 2.2;
    this.#muzzleLife = slot === 2 ? 0.07 : slot === 3 ? 0.055 : 0.035;
    this.#muzzleMaterial.opacity = 1;
    this.#muzzleLight.intensity = slot === 2 ? 5 : slot === 3 ? 4 : 2.4;
  }

  triggerReload(): void {
    this.#switchAmount = Math.min(this.#switchAmount, 0.75);
  }

  update(deltaSeconds: number, motion: ViewmodelMotion): void {
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    this.#bobTime += dt * (3.5 + motion.speed * 1.25);
    this.#switchAmount = damp(this.#switchAmount, 1, 10, dt);
    this.#scopeAmount = damp(
      this.#scopeAmount,
      motion.scoped && this.#selected === 2 ? 1 : 0,
      13,
      dt
    );
    this.#recoil = damp(this.#recoil, 0, this.#selected === 2 ? 7 : 12, dt);
    this.#recoilYaw = damp(this.#recoilYaw, 0, 14, dt);

    const moving = motion.grounded ? Math.min(1, motion.speed / 6) : 0.15;
    const bobX = Math.sin(this.#bobTime) * 0.014 * moving;
    const bobY = Math.abs(Math.cos(this.#bobTime)) * 0.012 * moving;
    const sprint = motion.sprinting ? 1 : 0;
    const reloadArc = motion.reloading
      ? Math.sin(Math.max(0, Math.min(1, motion.reloadProgress)) * Math.PI)
      : 0;
    const hipPosition = new Vector3(0.43, -0.4, -0.9);
    const scopePosition = new Vector3(0, -0.205, -0.48);
    this.object.position.copy(hipPosition).lerp(scopePosition, this.#scopeAmount);
    this.object.position.x += bobX + this.#recoilYaw;
    this.object.position.y += bobY - (1 - this.#switchAmount) * 0.38;
    this.object.position.z += this.#recoil * 0.12 + sprint * 0.08;
    this.object.rotation.set(
      -this.#recoil * 0.12 + reloadArc * 0.34 - sprint * 0.18,
      this.#recoilYaw - sprint * 0.12,
      reloadArc * 0.42 + sprint * 0.22
    );

    this.#muzzleLife -= dt;
    if (this.#muzzleLife <= 0) {
      this.#muzzleMaterial.opacity = 0;
      this.#muzzleLight.intensity = 0;
    } else {
      const alpha = this.#muzzleLife / 0.07;
      this.#muzzleMaterial.opacity = Math.max(0, Math.min(1, alpha));
      this.#muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.75);
      this.#muzzleFlash.rotation.z += dt * 25;
      this.#muzzleLight.intensity *= 0.72;
    }
  }

  get scopeAmount(): number {
    return this.#scopeAmount;
  }

  get selectedWeapon(): WeaponSlot {
    return this.#selected;
  }

  dispose(): void {
    for (const weapon of this.#weapons.values()) {
      weapon.traverse((child) => {
        if (child instanceof Mesh) {
          const typedChild = child as Mesh<
            BoxGeometry | CylinderGeometry | SphereGeometry,
            MeshStandardMaterial | MeshBasicMaterial
          >;
          typedChild.geometry.dispose();
        }
      });
    }
    this.#muzzleFlash.geometry.dispose();
    this.#gunmetal.dispose();
    this.#dark.dispose();
    this.#cyan.dispose();
    this.#magenta.dispose();
    this.#muzzleMaterial.dispose();
    this.object.clear();
  }

  #placeMuzzle(): void {
    const z = this.#selected === 2 ? -1.36 : this.#selected === 3 ? -0.86 : -1.08;
    this.#muzzleFlash.position.set(0.03, 0.03, z);
    this.#muzzleLight.position.copy(this.#muzzleFlash.position);
  }

  #createRifle(): Group {
    const group = new Group();
    group.name = 'pulse-rifle-viewmodel';
    const receiver = mesh(new BoxGeometry(0.22, 0.2, 0.72), this.#gunmetal);
    const stock = mesh(new BoxGeometry(0.18, 0.24, 0.38), this.#dark);
    stock.position.set(0, -0.01, 0.47);
    stock.rotation.x = -0.16;
    const barrel = mesh(new CylinderGeometry(0.035, 0.05, 0.65, 10), this.#gunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.65;
    const cell = mesh(new BoxGeometry(0.14, 0.04, 0.28), this.#cyan);
    cell.position.set(0, 0.125, -0.16);
    const grip = mesh(new BoxGeometry(0.11, 0.3, 0.14), this.#dark);
    grip.position.set(0, -0.23, 0.12);
    grip.rotation.x = -0.18;
    group.add(receiver, stock, barrel, cell, grip);
    return group;
  }

  #createSniper(): Group {
    const group = new Group();
    group.name = 'longshot-sniper-viewmodel';
    const receiver = mesh(new BoxGeometry(0.19, 0.18, 0.88), this.#gunmetal);
    const stock = mesh(new BoxGeometry(0.2, 0.26, 0.52), this.#dark);
    stock.position.z = 0.62;
    const barrel = mesh(new CylinderGeometry(0.025, 0.04, 1.05, 12), this.#gunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.92;
    const scope = mesh(new CylinderGeometry(0.09, 0.09, 0.46, 16), this.#dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.2, -0.06);
    const lens = mesh(new CylinderGeometry(0.075, 0.075, 0.015, 16), this.#cyan);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.2, -0.3);
    const rail = mesh(new BoxGeometry(0.08, 0.04, 0.9), this.#magenta);
    rail.position.y = 0.115;
    group.add(receiver, stock, barrel, scope, lens, rail);
    return group;
  }

  #createShotgun(): Group {
    const group = new Group();
    group.name = 'breach-shotgun-viewmodel';
    const receiver = mesh(new BoxGeometry(0.3, 0.25, 0.68), this.#gunmetal);
    const stock = mesh(new BoxGeometry(0.22, 0.29, 0.46), this.#dark);
    stock.position.z = 0.53;
    stock.rotation.x = -0.12;
    const barrel = mesh(new CylinderGeometry(0.085, 0.09, 0.72, 12), this.#gunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.65;
    const pump = mesh(new BoxGeometry(0.28, 0.2, 0.34), this.#dark);
    pump.position.set(0, -0.03, -0.42);
    const breach = mesh(new BoxGeometry(0.32, 0.05, 0.3), this.#magenta);
    breach.position.set(0, 0.16, 0.04);
    group.add(receiver, stock, barrel, pump, breach);
    return group;
  }
}
