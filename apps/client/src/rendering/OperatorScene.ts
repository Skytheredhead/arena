import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import type { SnapshotSample } from '../netcode/SnapshotBuffer';
import type { WeaponSlot } from '../netcode/contracts';

interface OperatorRig {
  root: Group;
  leftArm: Object3D;
  rightArm: Object3D;
  leftLeg: Object3D;
  rightLeg: Object3D;
  weapon: Group;
  weaponSlot: WeaponSlot;
  phase: number;
}

const torsoGeometry = new CapsuleGeometry(0.34, 0.62, 4, 8);
const headGeometry = new SphereGeometry(0.28, 12, 8);
const limbGeometry = new CapsuleGeometry(0.11, 0.46, 3, 6);
const weaponBodyGeometry = new BoxGeometry(0.16, 0.14, 0.72);
const weaponBarrelGeometry = new CylinderGeometry(0.035, 0.045, 0.72, 8);

const makeMesh = (
  geometry: CapsuleGeometry | SphereGeometry | BoxGeometry | CylinderGeometry,
  material: MeshStandardMaterial
): Mesh => {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const configureWeapon = (weapon: Group, slot: WeaponSlot): void => {
  const body = weapon.children[0];
  const barrel = weapon.children[1];
  if (!(body instanceof Mesh) || !(barrel instanceof Mesh)) return;
  if (slot === 2) {
    body.scale.set(0.82, 0.86, 1.3);
    barrel.scale.set(0.85, 1.45, 0.85);
  } else if (slot === 3) {
    body.scale.set(1.28, 1.2, 0.92);
    barrel.scale.set(1.8, 0.86, 1.8);
  } else {
    body.scale.set(1, 1, 1);
    barrel.scale.set(1, 1, 1);
  }
};

export class OperatorScene {
  readonly object = new Group();
  readonly #rigs = new Map<string, OperatorRig>();
  readonly #humanMaterial = new MeshStandardMaterial({
    color: new Color('#24485a'),
    roughness: 0.38,
    metalness: 0.62,
  });
  readonly #botMaterial = new MeshStandardMaterial({
    color: new Color('#582347'),
    roughness: 0.42,
    metalness: 0.56,
  });
  readonly #visorMaterial = new MeshStandardMaterial({
    color: new Color('#061117'),
    roughness: 0.1,
    metalness: 0.75,
    emissive: new Color('#00eaff'),
    emissiveIntensity: 1.6,
  });
  readonly #weaponMaterial = new MeshStandardMaterial({
    color: new Color('#1b252b'),
    roughness: 0.24,
    metalness: 0.9,
    emissive: new Color('#007888'),
    emissiveIntensity: 0.55,
  });

  constructor() {
    this.object.name = 'remote-operators';
  }

  update(
    players: ReadonlyMap<string, SnapshotSample>,
    localPlayerId: string | null,
    elapsedSeconds: number
  ): void {
    const present = new Set<string>();
    for (const [id, snapshot] of players) {
      if (id === localPlayerId) continue;
      present.add(id);
      let rig = this.#rigs.get(id);
      if (!rig) {
        rig = this.#createRig(snapshot.isBot, id);
        this.#rigs.set(id, rig);
        this.object.add(rig.root);
      }
      rig.root.visible = snapshot.alive;
      if (!snapshot.alive) continue;
      rig.root.position.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z
      );
      rig.root.rotation.y = snapshot.yaw;
      if (rig.weaponSlot !== snapshot.selectedWeapon) {
        rig.weaponSlot = snapshot.selectedWeapon;
        configureWeapon(rig.weapon, rig.weaponSlot);
      }
      const speed = Math.hypot(snapshot.velocity.x, snapshot.velocity.z);
      const gait = Math.sin(elapsedSeconds * (4.8 + speed * 0.55) + rig.phase);
      const amplitude = Math.min(0.72, speed * 0.085);
      rig.leftLeg.rotation.x = gait * amplitude;
      rig.rightLeg.rotation.x = -gait * amplitude;
      rig.leftArm.rotation.x = -gait * amplitude * 0.45 - 0.55;
      rig.rightArm.rotation.x = gait * amplitude * 0.28 - 0.8;
      rig.root.rotation.z = Math.sin(elapsedSeconds * 1.7 + rig.phase) * 0.012;
    }

    for (const [id, rig] of this.#rigs) {
      if (present.has(id)) continue;
      this.object.remove(rig.root);
      this.#rigs.delete(id);
    }
  }

  remove(id: string): void {
    const rig = this.#rigs.get(id);
    if (!rig) return;
    this.object.remove(rig.root);
    this.#rigs.delete(id);
  }

  clear(): void {
    for (const rig of this.#rigs.values()) this.object.remove(rig.root);
    this.#rigs.clear();
  }

  dispose(): void {
    this.clear();
    this.#humanMaterial.dispose();
    this.#botMaterial.dispose();
    this.#visorMaterial.dispose();
    this.#weaponMaterial.dispose();
  }

  #createRig(isBot: boolean, id: string): OperatorRig {
    const root = new Group();
    root.name = `operator-${id}`;
    const armor = isBot ? this.#botMaterial : this.#humanMaterial;

    const torso = makeMesh(torsoGeometry, armor);
    torso.position.y = 1.16;
    root.add(torso);

    const head = makeMesh(headGeometry, armor);
    head.position.set(0, 1.78, 0);
    root.add(head);
    const visor = makeMesh(
      new BoxGeometry(0.4, 0.13, 0.09),
      this.#visorMaterial
    );
    visor.position.set(0, 1.82, -0.245);
    root.add(visor);

    const leftArm = new Group();
    const rightArm = new Group();
    const leftLeg = new Group();
    const rightLeg = new Group();
    leftArm.position.set(-0.43, 1.43, 0);
    rightArm.position.set(0.43, 1.43, 0);
    leftLeg.position.set(-0.2, 0.73, 0);
    rightLeg.position.set(0.2, 0.73, 0);
    const leftArmMesh = makeMesh(limbGeometry, armor);
    const rightArmMesh = makeMesh(limbGeometry, armor);
    const leftLegMesh = makeMesh(limbGeometry, armor);
    const rightLegMesh = makeMesh(limbGeometry, armor);
    leftArmMesh.position.y = -0.25;
    rightArmMesh.position.y = -0.25;
    leftLegMesh.position.y = -0.32;
    rightLegMesh.position.y = -0.32;
    leftArm.add(leftArmMesh);
    rightArm.add(rightArmMesh);
    leftLeg.add(leftLegMesh);
    rightLeg.add(rightLegMesh);
    root.add(leftArm, rightArm, leftLeg, rightLeg);

    const weapon = new Group();
    const body = makeMesh(weaponBodyGeometry, this.#weaponMaterial);
    const barrel = makeMesh(weaponBarrelGeometry, this.#weaponMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.62;
    weapon.add(body, barrel);
    weapon.position.set(0.27, 1.28, -0.42);
    weapon.rotation.x = -0.08;
    root.add(weapon);
    configureWeapon(weapon, 1);

    return {
      root,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      weapon,
      weaponSlot: 1,
      phase:
        [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        31,
    };
  }
}
