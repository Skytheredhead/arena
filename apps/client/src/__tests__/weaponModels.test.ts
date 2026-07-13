import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWeaponModels } from '../rendering/weaponModels';

const makeTexture = (): THREE.Texture => {
  const texture = new THREE.Texture();
  texture.needsUpdate = true;
  return texture;
};

const rendererSource = readFileSync(
  resolve(process.cwd(), 'src/rendering/GameRenderer.ts'),
  'utf8'
);

const readRendererConstant = (name: string): number => {
  const match = rendererSource.match(
    new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?);`)
  );
  if (!match?.[1]) throw new Error(`missing numeric renderer constant ${name}`);
  return Number(match[1]);
};

describe('weapon model alignment', () => {
  it('keeps the rifle body, barrel, sight, and buttpad on one centerline', () => {
    const { rifle } = createWeaponModels(makeTexture());

    // These are the rifle's structural pieces, in construction order. Grips,
    // controls, and hands are intentionally excluded because they are allowed
    // to sit to either side of the weapon's longitudinal axis.
    const structuralChildIndexes = [0, 1, 2, 3, 4, 7, 8, 21, 24, 25, 26];

    for (const index of structuralChildIndexes) {
      const part = rifle.children[index];
      if (!part) {
        throw new Error(`missing structural rifle part at child ${index}`);
      }
      expect(part.position.x, `rifle child ${index} is off the centerline`).toBeCloseTo(
        0,
        6
      );
    }
  });

  it('keeps ADS-critical rifle parts free of local yaw and roll', () => {
    const { rifle } = createWeaponModels(makeTexture());
    const adsCriticalChildIndexes = [0, 2, 3, 4, 8, 21, 22, 23, 24, 25, 26];

    for (const index of adsCriticalChildIndexes) {
      const part = rifle.children[index];
      if (!part) {
        throw new Error(`missing ADS-critical rifle part at child ${index}`);
      }
      expect(part.rotation.y, `rifle child ${index} has local yaw`).toBeCloseTo(0, 6);
      expect(part.rotation.z, `rifle child ${index} has local roll`).toBeCloseTo(0, 6);
    }
  });

  it('projects the rifle optic reticle onto the exact ADS center at every aspect ratio', () => {
    const { rifle, materials } = createWeaponModels(makeTexture());
    const opticReticles: THREE.Object3D[] = [];
    rifle.traverse(object => {
      if (object instanceof THREE.Mesh && object.material === materials.accent) {
        opticReticles.push(object);
      }
    });
    expect(opticReticles).toHaveLength(1);
    const opticReticle = opticReticles[0];
    if (!opticReticle) throw new Error('missing rifle optic reticle');

    for (const aspect of [16 / 9, 21 / 9, 9 / 16]) {
      const camera = new THREE.PerspectiveCamera(80 * 0.78, aspect, 0.1, 200);
      const weaponRig = new THREE.Group();
      weaponRig.position.set(
        readRendererConstant('WEAPON_ADS_X'),
        readRendererConstant('WEAPON_ADS_Y'),
        readRendererConstant('WEAPON_ADS_Z')
      );
      weaponRig.rotation.set(
        0,
        readRendererConstant('WEAPON_ADS_YAW'),
        readRendererConstant('WEAPON_ADS_ROLL')
      );
      weaponRig.add(rifle);
      camera.add(weaponRig);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      const projectedReticle = opticReticle
        .getWorldPosition(new THREE.Vector3())
        .project(camera);

      expect(projectedReticle.x).toBeCloseTo(0, 6);
      expect(projectedReticle.y).toBeCloseTo(0, 6);
      weaponRig.remove(rifle);
    }
  });
});
