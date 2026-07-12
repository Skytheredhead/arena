import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  AMMO_PACK_RADIUS,
  INPUT_EDGE_REDUNDANCY_COMMANDS,
  RIFLE_CLIP_SIZE,
  RIFLE_RESERVE_CAPACITY,
  applyAmmoPickup,
  applyInputEdgeRedundancy,
  canCollectAmmo,
  canFireWeaponAtTick,
  coalesceInputCommands,
  completeReloadIfReady,
  isUint32AtOrAfter,
  isUint32Newer,
  makeDefaultWeaponSnapshot,
  makeInputEdgeRedundancyState,
  nextUint32,
  sanitizeInputCommand,
  startReload,
  sweptPlayerTouchesPickup,
  uint32Elapsed,
} from '../src/index';

const input = (sequence, overrides = {}) => ({
  sequence,
  moveX: 0,
  moveZ: 1,
  yaw: 0,
  pitch: 0,
  jumpHeld: false,
  sprintHeld: false,
  crouchHeld: false,
  scoped: false,
  fireHeld: false,
  reloadPressed: false,
  weaponSlot: 1,
  ...overrides,
});

test('uint32 ordering remains monotonic through wraparound', () => {
  assert.equal(nextUint32(0xffff_fffe), 0xffff_ffff);
  assert.equal(nextUint32(0xffff_ffff), 0);
  assert.equal(isUint32Newer(0, 0xffff_ffff), true);
  assert.equal(isUint32Newer(1, 0xffff_ffff), true);
  assert.equal(isUint32Newer(0xffff_ffff, 0), false);
  assert.equal(isUint32AtOrAfter(0, 0), true);
  assert.equal(uint32Elapsed(0xffff_fffe, 1), 3);
  assert.equal(uint32Elapsed(10, 9), null);
});

test('input sanitization prevents non-finite prediction state', () => {
  const sanitized = sanitizeInputCommand(
    input(Number.MAX_SAFE_INTEGER, {
      moveX: Number.NaN,
      moveZ: 4,
      yaw: Number.POSITIVE_INFINITY,
      pitch: Number.NEGATIVE_INFINITY,
      weaponSlot: 99,
    }),
    { yaw: 0.4, pitch: -0.2 }
  );

  assert.equal(sanitized.sequence, 0xffff_ffff);
  assert.equal(sanitized.moveX, 0);
  assert.equal(sanitized.moveZ, 1);
  assert.ok(Math.abs(sanitized.yaw - 0.4) < 1e-12);
  assert.equal(sanitized.pitch, -0.2);
  assert.equal(sanitized.weaponSlot, 1);

  const noFiniteFallback = sanitizeInputCommand(
    input(1, { pitch: Number.NaN }),
    { yaw: Number.NaN, pitch: Number.NaN }
  );
  assert.equal(noFiniteFallback.yaw, 0);
  assert.equal(noFiniteFallback.pitch, 0);
});

test('coalescing keeps short action intent while using fresh movement', () => {
  const merged = coalesceInputCommands(
    input(10, { moveX: -1, fireHeld: true, reloadPressed: true }),
    input(11, { moveX: 1, fireHeld: false, reloadPressed: false })
  );
  assert.equal(merged.sequence, 11);
  assert.equal(merged.moveX, 1);
  assert.equal(merged.fireHeld, true);
  assert.equal(merged.reloadPressed, true);
});

test('reload edge redundancy survives deterministic 50 percent packet loss', () => {
  let edgeState = makeInputEdgeRedundancyState();
  const received = [];

  for (let tick = 0; tick < INPUT_EDGE_REDUNDANCY_COMMANDS; tick += 1) {
    const result = applyInputEdgeRedundancy(
      edgeState,
      input(tick + 1, { reloadPressed: tick === 0 })
    );
    edgeState = result.state;
    // Deterministic burst loss: discard the first half of the repeated edge.
    if (tick >= INPUT_EDGE_REDUNDANCY_COMMANDS / 2) {
      received.push(result.command);
    }
  }

  assert.equal(
    received.some((command) => command.reloadPressed),
    true
  );
  assert.equal(edgeState.reloadCommandsRemaining, 0);
});

test('swept pickup contact catches tunnelling and rejects wrong elevation', () => {
  const pickup = { x: 0, y: 0.6, z: 0 };
  const options = {
    pickupRadius: AMMO_PACK_RADIUS,
    horizontalGrace: 0.1,
    verticalGrace: 0.1,
  };

  assert.equal(
    sweptPlayerTouchesPickup(
      { x: -3, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      pickup,
      options
    ),
    true
  );
  assert.equal(
    sweptPlayerTouchesPickup(
      { x: -3, y: 5, z: 0 },
      { x: 3, y: 5, z: 0 },
      pickup,
      options
    ),
    false
  );
  assert.equal(
    sweptPlayerTouchesPickup(
      { x: -3, y: 0, z: 6 },
      { x: 3, y: 0, z: 6 },
      pickup,
      options
    ),
    false
  );
});

test('ammo pickups fill the magazine then reserve without overfilling', () => {
  assert.deepEqual(applyAmmoPickup({ ammoInMag: 8, reserveAmmo: 0 }), {
    ammoInMag: 10,
    reserveAmmo: 4,
  });
  assert.deepEqual(
    applyAmmoPickup({
      ammoInMag: RIFLE_CLIP_SIZE,
      reserveAmmo: RIFLE_RESERVE_CAPACITY - 1,
    }),
    { ammoInMag: RIFLE_CLIP_SIZE, reserveAmmo: RIFLE_RESERVE_CAPACITY }
  );
  assert.equal(
    canCollectAmmo({
      ammoInMag: RIFLE_CLIP_SIZE,
      reserveAmmo: RIFLE_RESERVE_CAPACITY,
    }),
    false
  );
});

test('reload and fire cooldown complete correctly across tick wraparound', () => {
  const initial = {
    ...makeDefaultWeaponSnapshot(),
    ammoInMag: 2,
    reserveAmmo: 8,
    nextReadyTick: 1,
  };
  const reloading = startReload(initial, 0xffff_ffe0);
  assert.equal(reloading.reloading, true);
  assert.equal(canFireWeaponAtTick(reloading, 0), false);

  const before = completeReloadIfReady(
    reloading,
    (reloading.reloadCompleteTick - 1) >>> 0
  );
  assert.equal(before.reloading, true);

  const complete = completeReloadIfReady(
    reloading,
    reloading.reloadCompleteTick
  );
  assert.equal(complete.reloading, false);
  assert.equal(complete.ammoInMag, RIFLE_CLIP_SIZE);
  assert.equal(complete.reserveAmmo, 0);
  assert.equal(canFireWeaponAtTick(complete, 1), true);
});
