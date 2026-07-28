import { describe, expect, it } from 'vitest';
import { WeaponViewmodels } from '../rendering/WeaponViewmodels';

const idleMotion = {
  speed: 0,
  grounded: true,
  sprinting: false,
  scoped: false,
  reloading: false,
  reloadProgress: 0,
};

describe('weapon viewmodels', () => {
  it('keeps the hip-fire weapon low and right of the aiming lane', () => {
    const weapons = new WeaponViewmodels();

    weapons.update(1 / 60, idleMotion);

    expect(weapons.object.position.x).toBeGreaterThanOrEqual(0.4);
    expect(weapons.object.position.y).toBeLessThanOrEqual(-0.38);
    expect(weapons.object.position.z).toBeLessThanOrEqual(-0.85);
    weapons.dispose();
  });

  it('centers the sniper viewmodel only while aiming down sights', () => {
    const weapons = new WeaponViewmodels();
    weapons.setWeapon(2);

    for (let frame = 0; frame < 12; frame += 1) {
      weapons.update(0.05, { ...idleMotion, scoped: true });
    }

    expect(weapons.scopeAmount).toBeGreaterThan(0.99);
    expect(weapons.object.position.x).toBeCloseTo(0, 2);
    expect(weapons.object.position.y).toBeCloseTo(-0.205, 2);
    expect(weapons.object.position.z).toBeCloseTo(-0.48, 2);
    weapons.dispose();
  });
});
