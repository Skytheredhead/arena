import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWeaponModels } from '../rendering/weaponModels';

const makeTexture = (): THREE.Texture => {
  const texture = new THREE.Texture();
  texture.needsUpdate = true;
  return texture;
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
});
