import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { WeaponMaterialSet } from './photorealMaterials';
import { createRemoteWeaponModel } from './weaponModels';

export interface OperatorAvatar {
  root: THREE.Group;
  head: THREE.Group;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  baseColors: number[];
}

const prepareMesh = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export const createOperatorAvatar = (
  weaponMaterials: WeaponMaterialSet
): OperatorAvatar => {
  const root = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({
    color: '#26353d',
    roughness: 0.88,
    metalness: 0.03,
  });
  const armor = new THREE.MeshStandardMaterial({
    color: '#315462',
    roughness: 0.5,
    metalness: 0.34,
  });
  const darkArmor = new THREE.MeshStandardMaterial({
    color: '#151d22',
    roughness: 0.58,
    metalness: 0.28,
  });
  const visor = new THREE.MeshPhysicalMaterial({
    color: '#5ca3b2',
    roughness: 0.08,
    metalness: 0.64,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.4,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: '#0d1215',
    roughness: 0.92,
    metalness: 0.01,
  });

  const torso = prepareMesh(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.44, 8, 14), fabric)
  );
  torso.position.set(0, 1.2, 0);
  root.add(torso);

  const vest = prepareMesh(
    new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.6, 0.32, 4, 0.05), armor)
  );
  vest.position.set(0, 1.23, -0.025);
  root.add(vest);
  const chestPlate = prepareMesh(
    new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.33, 0.055, 3, 0.025), darkArmor)
  );
  chestPlate.position.set(0, 1.3, -0.19);
  chestPlate.rotation.x = -0.04;
  root.add(chestPlate);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.56, 0);
  const helmet = prepareMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.235, 22, 16), darkArmor)
  );
  helmet.position.set(0, 0.22, 0);
  helmet.scale.set(1, 0.9, 1.08);
  const faceGuard = prepareMesh(
    new THREE.Mesh(new RoundedBoxGeometry(0.31, 0.15, 0.055, 3, 0.025), visor)
  );
  faceGuard.position.set(0, 0.21, -0.225);
  const respirator = prepareMesh(
    new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.105, 0.09, 3, 0.025), rubber)
  );
  respirator.position.set(0, 0.09, -0.21);
  headPivot.add(helmet, faceGuard, respirator);
  root.add(headPivot);

  const createArm = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.37, 1.48, 0);
    const sleeve = prepareMesh(
      new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.42, 7, 12), fabric)
    );
    sleeve.position.set(0, -0.29, 0);
    const shoulder = prepareMesh(
      new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), armor)
    );
    shoulder.position.set(0, -0.03, -0.01);
    shoulder.scale.set(1.05, 0.8, 1.05);
    const glove = prepareMesh(
      new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), rubber)
    );
    glove.position.set(0, -0.57, -0.015);
    glove.scale.set(0.88, 1.15, 0.9);
    pivot.add(sleeve, shoulder, glove);
    return pivot;
  };

  const leftArmPivot = createArm(-1);
  const rightArmPivot = createArm(1);
  const heldGun = createRemoteWeaponModel(weaponMaterials);
  heldGun.position.set(-0.34, -0.36, -0.42);
  heldGun.rotation.set(-0.2, -0.05, 0.04);
  heldGun.scale.setScalar(1.25);
  rightArmPivot.add(heldGun);
  root.add(leftArmPivot, rightArmPivot);

  const createLeg = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.83, 0);
    const leg = prepareMesh(
      new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.48, 7, 12), fabric)
    );
    leg.position.set(0, -0.38, 0);
    const knee = prepareMesh(
      new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.18, 0.075, 3, 0.025), armor)
    );
    knee.position.set(0, -0.39, -0.13);
    const boot = prepareMesh(
      new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.16, 0.34, 3, 0.035), rubber)
    );
    boot.position.set(0, -0.77, -0.05);
    pivot.add(leg, knee, boot);
    return pivot;
  };

  const leftLegPivot = createLeg(-1);
  const rightLegPivot = createLeg(1);
  root.add(leftLegPivot, rightLegPivot);

  const belt = prepareMesh(
    new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.1, 0.3, 3, 0.024), darkArmor)
  );
  belt.position.set(0, 0.91, 0);
  root.add(belt);

  const materials: THREE.MeshStandardMaterial[] = [];
  const baseColors: number[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) return;
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
};
