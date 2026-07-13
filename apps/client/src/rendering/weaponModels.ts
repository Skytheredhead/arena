import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  createWeaponMaterialSet,
  type WeaponMaterialSet,
} from './photorealMaterials';

export const RIFLE_VIEWMODEL_SCALE = 0.72;
export const RIFLE_OPTIC_AIM_POINT = [
  0,
  0.22,
  -0.22 - 0.028 * 1.34,
] as const;
// Calibrated from the reported 3598x2164 production capture. The live
// viewmodel projection lands this far from the DOM HUD center even when the
// idealized camera-space anchor is mathematically centered.
export const RIFLE_ADS_CAMERA_BIAS = [-0.1553, -0.095] as const;

export const computeCenteredOpticOffset = (
  out: THREE.Vector2,
  opticAimPoint: readonly [number, number, number],
  modelScale: number,
  rotation: THREE.Euler,
  scratch: THREE.Vector3
): THREE.Vector2 => {
  scratch
    .set(opticAimPoint[0], opticAimPoint[1], opticAimPoint[2])
    .multiplyScalar(modelScale)
    .applyEuler(rotation);
  return out.set(-scratch.x, -scratch.y);
};

const addMesh = <T extends THREE.BufferGeometry>(
  group: THREE.Group,
  geometry: T,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
): THREE.Mesh<T, THREE.Material> => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const roundedBox = (
  width: number,
  height: number,
  depth: number,
  radius = 0.014
): RoundedBoxGeometry =>
  new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, width * 0.2));

const addRail = (
  group: THREE.Group,
  materials: WeaponMaterialSet,
  length: number,
  z: number,
  y: number
): void => {
  addMesh(
    group,
    roundedBox(0.085, 0.018, length, 0.004),
    materials.machined,
    [0, y, z]
  );
  const count = Math.max(4, Math.floor(length / 0.055));
  for (let index = 0; index < count; index += 1) {
    const slotZ = z - length * 0.5 + ((index + 0.5) / count) * length;
    addMesh(
      group,
      new THREE.BoxGeometry(0.092, 0.008, 0.012),
      materials.rubber,
      [0, y + 0.012, slotZ]
    );
  }
};

const addHolographicSight = (
  group: THREE.Group,
  materials: WeaponMaterialSet,
  z: number,
  y: number,
  scale = 1
): void => {
  const width = 0.112 * scale;
  const height = 0.096 * scale;
  const rim = 0.016 * scale;
  addMesh(
    group,
    roundedBox(width, rim, 0.044 * scale, 0.006),
    materials.polymer,
    [0, y - height * 0.5, z]
  );
  addMesh(
    group,
    roundedBox(rim, height, 0.044 * scale, 0.006),
    materials.polymer,
    [-width * 0.5 + rim * 0.5, y, z]
  );
  addMesh(
    group,
    roundedBox(rim, height, 0.044 * scale, 0.006),
    materials.polymer,
    [width * 0.5 - rim * 0.5, y, z]
  );
  addMesh(
    group,
    roundedBox(width, rim, 0.044 * scale, 0.006),
    materials.polymer,
    [0, y + height * 0.5, z]
  );
  addMesh(
    group,
    new THREE.SphereGeometry(0.006 * scale, 10, 8),
    materials.accent,
    [0, y, z - 0.028 * scale]
  );
  addMesh(
    group,
    roundedBox(0.13 * scale, 0.034 * scale, 0.12 * scale, 0.008),
    materials.polymer,
    [0, y - height * 0.66, z + 0.028 * scale]
  );
};

const addCenteredHands = (
  group: THREE.Group,
  materials: WeaponMaterialSet,
  forwardZ: number
): void => {
  const forearmGeometry = new THREE.CapsuleGeometry(0.052, 0.21, 5, 10);
  addMesh(
    group,
    forearmGeometry,
    materials.glove,
    [-0.11, -0.14, forwardZ + 0.08],
    [1.18, 0.08, -0.2]
  );
  addMesh(
    group,
    forearmGeometry,
    materials.glove,
    [0.11, -0.14, 0.12],
    [1.1, -0.05, 0.22]
  );
  addMesh(
    group,
    new THREE.SphereGeometry(0.061, 12, 9),
    materials.glove,
    [-0.075, -0.035, forwardZ - 0.04],
    [0, 0, 0.1]
  );
  addMesh(
    group,
    new THREE.SphereGeometry(0.058, 12, 9),
    materials.glove,
    [0.07, -0.075, 0.02],
    [0, 0, -0.1]
  );
};

const createBullpupRifle = (materials: WeaponMaterialSet): THREE.Group => {
  const group = new THREE.Group();
  addMesh(group, roundedBox(0.175, 0.125, 0.54), materials.receiver, [0, -0.025, -0.11]);
  // Keep the shoulder stock on the same longitudinal axis as the receiver,
  // barrel, and optic. An offset here is magnified by the viewmodel camera and
  // makes the rifle appear bent when aiming down sights.
  addMesh(group, roundedBox(0.17, 0.105, 0.27), materials.polymer, [0, -0.025, 0.22]);
  addMesh(group, roundedBox(0.17, 0.13, 0.34), materials.polymer, [0, 0.006, -0.5]);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.019, 0.019, 0.52, 18),
    materials.machined,
    [0, 0.045, -0.78],
    [Math.PI / 2, 0, 0]
  );
  addMesh(
    group,
    new THREE.CylinderGeometry(0.03, 0.025, 0.09, 18),
    materials.receiver,
    [0, 0.045, -1.075],
    [Math.PI / 2, 0, 0]
  );
  addMesh(group, roundedBox(0.09, 0.18, 0.095), materials.polymer, [0.07, -0.145, 0.08], [0.18, 0, 0]);
  addMesh(group, roundedBox(0.08, 0.19, 0.105), materials.receiver, [0.1, -0.13, 0.24], [-0.08, 0, 0]);
  addMesh(group, roundedBox(0.15, 0.065, 0.19), materials.rubber, [0, -0.025, 0.42]);
  addRail(group, materials, 0.66, -0.26, 0.12);
  addHolographicSight(group, materials, -0.22, 0.22, 1.34);
  addMesh(group, roundedBox(0.038, 0.055, 0.16), materials.machined, [0.107, 0.015, -0.31]);
  addMesh(group, new THREE.CylinderGeometry(0.024, 0.024, 0.1, 14), materials.machined, [-0.112, -0.005, -0.3], [0, 0, Math.PI / 2]);
  addCenteredHands(group, materials, -0.42);
  return group;
};

const createSniper = (materials: WeaponMaterialSet): THREE.Group => {
  const group = new THREE.Group();
  addMesh(group, roundedBox(0.175, 0.14, 0.62), materials.receiver, [0, 0.015, -0.15]);
  addMesh(group, roundedBox(0.19, 0.145, 0.34), materials.polymer, [0, 0.005, 0.31]);
  addMesh(group, roundedBox(0.14, 0.105, 0.45), materials.polymer, [0, 0.018, -0.57]);
  addMesh(group, new THREE.CylinderGeometry(0.014, 0.014, 0.96, 18), materials.machined, [0, 0.05, -1.02], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.03, 0.024, 0.16, 18), materials.receiver, [0, 0.05, -1.58], [Math.PI / 2, 0, 0]);
  addMesh(group, roundedBox(0.082, 0.18, 0.092), materials.polymer, [0, -0.145, 0.09], [0.18, 0, 0]);
  addRail(group, materials, 0.58, -0.25, 0.115);
  addMesh(group, new THREE.CylinderGeometry(0.046, 0.046, 0.58, 20), materials.receiver, [0, 0.19, -0.3], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.06, 0.05, 0.07, 20), materials.receiver, [0, 0.19, -0.62], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.CircleGeometry(0.043, 20), materials.glass, [0, 0.19, -0.662], [0, Math.PI, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.018, 0.018, 0.11, 14), materials.machined, [0.075, 0.185, -0.16], [0, 0, Math.PI / 2]);
  addCenteredHands(group, materials, -0.48);
  return group;
};

const createShotgun = (materials: WeaponMaterialSet): THREE.Group => {
  const group = new THREE.Group();
  addMesh(group, roundedBox(0.19, 0.155, 0.48), materials.receiver, [0, 0.005, -0.04]);
  addMesh(group, roundedBox(0.2, 0.15, 0.28), materials.polymer, [0, -0.002, 0.32]);
  addMesh(group, roundedBox(0.18, 0.14, 0.32), materials.polymer, [0, -0.01, -0.42]);
  addMesh(group, new THREE.CylinderGeometry(0.023, 0.023, 0.72, 18), materials.machined, [0, 0.05, -0.82], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.019, 0.019, 0.6, 18), materials.receiver, [0, -0.005, -0.72], [Math.PI / 2, 0, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.034, 0.03, 0.08, 18), materials.receiver, [0, 0.05, -1.21], [Math.PI / 2, 0, 0]);
  addMesh(group, roundedBox(0.08, 0.18, 0.1), materials.rubber, [0, -0.15, 0.1], [0.2, 0, 0]);
  addRail(group, materials, 0.34, -0.08, 0.12);
  addHolographicSight(group, materials, -0.04, 0.2, 0.94);
  addCenteredHands(group, materials, -0.36);
  return group;
};

export interface WeaponModels {
  rifle: THREE.Group;
  sniper: THREE.Group;
  shotgun: THREE.Group;
  materials: WeaponMaterialSet;
}

export const createWeaponModels = (texture: THREE.Texture): WeaponModels => {
  const materials = createWeaponMaterialSet(texture);
  const rifle = createBullpupRifle(materials);
  const sniper = createSniper(materials);
  const shotgun = createShotgun(materials);
  rifle.scale.setScalar(RIFLE_VIEWMODEL_SCALE);
  sniper.scale.setScalar(0.68);
  shotgun.scale.setScalar(0.72);
  return {
    rifle,
    sniper,
    shotgun,
    materials,
  };
};

export const createRemoteWeaponModel = (
  materials: WeaponMaterialSet
): THREE.Group => {
  const group = new THREE.Group();
  addMesh(group, roundedBox(0.11, 0.09, 0.42), materials.receiver, [0, 0, -0.08]);
  addMesh(group, roundedBox(0.12, 0.1, 0.2), materials.polymer, [0, -0.005, 0.19]);
  addMesh(group, roundedBox(0.095, 0.075, 0.24), materials.polymer, [0, 0, -0.39]);
  addMesh(group, new THREE.CylinderGeometry(0.012, 0.012, 0.36, 12), materials.machined, [0, 0.02, -0.66], [Math.PI / 2, 0, 0]);
  addHolographicSight(group, materials, -0.15, 0.095, 0.58);
  return group;
};
