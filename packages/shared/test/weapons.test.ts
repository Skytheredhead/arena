import { describe, expect, it } from 'vitest';
import {
  WEAPON_DEFINITIONS,
  WEAPON_IDS,
  completeReloadIfReady,
  createWeaponState,
  damageAtDistance,
  deterministicShotDirections,
  startReload,
  tryFireWeapon,
  weaponForSlot,
} from '../src/index.js';

describe('authoritative weapon definitions', () => {
  it('defines three distinct weapons in the existing UI slot order', () => {
    expect(WEAPON_IDS).toHaveLength(3);
    expect(weaponForSlot(1).id).toBe('pulse-rifle');
    expect(weaponForSlot(2).id).toBe('longshot-sniper');
    expect(weaponForSlot(3).id).toBe('breach-shotgun');
    expect(WEAPON_DEFINITIONS['pulse-rifle'].automatic).toBe(true);
    expect(WEAPON_DEFINITIONS['longshot-sniper'].canScope).toBe(true);
    expect(WEAPON_DEFINITIONS['breach-shotgun'].projectileCount).toBe(12);
  });

  it('consumes ammo and enforces cooldowns', () => {
    const initial = createWeaponState('pulse-rifle', 100);
    const fired = tryFireWeapon(initial, 100);
    expect(fired.accepted).toBe(true);
    expect(fired.reason).toBe('fired');
    expect(fired.state.ammoInMagazine).toBe(29);

    const early = tryFireWeapon(fired.state, 105);
    expect(early.accepted).toBe(false);
    expect(early.reason).toBe('cooldown');

    const ready = tryFireWeapon(fired.state, 106);
    expect(ready.accepted).toBe(true);
    expect(ready.state.ammoInMagazine).toBe(28);
  });

  it('never underflows an empty magazine', () => {
    const empty = {
      ...createWeaponState('longshot-sniper', 20),
      ammoInMagazine: 0,
    };
    const result = tryFireWeapon(empty, 20);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('empty');
    expect(result.state.ammoInMagazine).toBe(0);
  });

  it('reloads only the missing amount and saturates reserve ammo', () => {
    const partiallyEmpty = {
      ...createWeaponState('breach-shotgun', 50),
      ammoInMagazine: 3,
      reserveAmmo: 4,
    };
    const started = startReload(partiallyEmpty, 50);
    expect(started.accepted).toBe(true);
    expect(started.state.reloadCompleteTick).toBe(
      50 + WEAPON_DEFINITIONS['breach-shotgun'].reloadTicks
    );

    const pending = completeReloadIfReady(started.state, 100);
    expect(pending.accepted).toBe(false);
    const complete = completeReloadIfReady(
      started.state,
      started.state.reloadCompleteTick!
    );
    expect(complete.accepted).toBe(true);
    expect(complete.state.ammoInMagazine).toBe(7);
    expect(complete.state.reserveAmmo).toBe(0);
    expect(complete.state.reloadCompleteTick).toBeNull();
  });

  it('keeps firing and reload cooldowns correct across uint32 rollover', () => {
    const initial = createWeaponState('pulse-rifle', 0xffff_fffd);
    const fired = tryFireWeapon(initial, 0xffff_fffd);
    expect(fired.accepted).toBe(true);
    expect(fired.state.nextFireTick).toBe(3);
    expect(tryFireWeapon(fired.state, 2).accepted).toBe(false);
    expect(tryFireWeapon(fired.state, 3).accepted).toBe(true);

    const reloadState = {
      ...createWeaponState('pulse-rifle', 0xffff_fffc),
      ammoInMagazine: 1,
    };
    const reload = startReload(reloadState, 0xffff_fffc);
    expect(reload.state.reloadCompleteTick).toBe(101);
    expect(completeReloadIfReady(reload.state, 100).accepted).toBe(false);
    expect(completeReloadIfReady(reload.state, 101).accepted).toBe(true);
  });

  it('applies meaningful bounded damage falloff', () => {
    for (const weaponId of WEAPON_IDS) {
      const definition = WEAPON_DEFINITIONS[weaponId];
      expect(damageAtDistance(weaponId, 0)).toBe(
        definition.damagePerProjectile
      );
      expect(damageAtDistance(weaponId, definition.falloffStart)).toBe(
        definition.damagePerProjectile
      );
      expect(damageAtDistance(weaponId, definition.falloffEnd)).toBeCloseTo(
        definition.damagePerProjectile * definition.minimumDamageMultiplier
      );
      expect(damageAtDistance(weaponId, definition.range + 0.01)).toBe(0);
      expect(damageAtDistance(weaponId, -1)).toBe(0);
    }
    expect(
      damageAtDistance('breach-shotgun', 22)
    ).toBeLessThan(damageAtDistance('breach-shotgun', 5));
  });

  it('generates deterministic normalized pellet spread without Math.random', () => {
    const first = deterministicShotDirections(
      'breach-shotgun',
      [0, 0, -1],
      12345,
      false
    );
    const repeated = deterministicShotDirections(
      'breach-shotgun',
      [0, 0, -1],
      12345,
      false
    );
    const changed = deterministicShotDirections(
      'breach-shotgun',
      [0, 0, -1],
      12346,
      false
    );
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(changed);
    expect(first).toHaveLength(12);
    for (const direction of first) {
      expect(Math.hypot(...direction)).toBeCloseTo(1, 7);
      const angle = Math.acos(Math.max(-1, Math.min(1, -direction[2])));
      expect(angle).toBeLessThanOrEqual(
        WEAPON_DEFINITIONS['breach-shotgun'].hipSpreadRadians + 1e-6
      );
    }
  });
});
