import { MAX_HEALTH, PLAYER_HEIGHT, PLAYER_RADIUS } from './gameplay';
import type { Vec3 } from './netcode';
import { RIFLE_RESERVE_CAPACITY, clampWeaponAmmo } from './weapons';

export const AMMO_PACK_AMOUNT = 6;
export const AMMO_PACK_RADIUS = 1.35;
export const HEALTH_PACK_AMOUNT = 50;
export const HEALTH_PACK_RADIUS = 0.5;

export interface PickupContactOptions {
  pickupRadius: number;
  playerRadius?: number;
  playerHeight?: number;
  horizontalGrace?: number;
  verticalGrace?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const segmentPointDistanceSquared2D = (
  start: Vec3,
  end: Vec3,
  point: Vec3
): number => {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared <= Number.EPSILON) {
    return (point.x - end.x) ** 2 + (point.z - end.z) ** 2;
  }
  const amount = clamp01(
    ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) /
      lengthSquared
  );
  const closestX = start.x + deltaX * amount;
  const closestZ = start.z + deltaZ * amount;
  return (point.x - closestX) ** 2 + (point.z - closestZ) ** 2;
};

/**
 * Tests a player's authoritative movement segment, not just its final point.
 * This prevents fast players and correction steps from tunnelling through a
 * pickup between simulation ticks.
 */
export const sweptPlayerTouchesPickup = (
  previousFeet: Vec3,
  currentFeet: Vec3,
  pickup: Vec3,
  options: PickupContactOptions
): boolean => {
  if (
    ![
      previousFeet.x,
      previousFeet.y,
      previousFeet.z,
      currentFeet.x,
      currentFeet.y,
      currentFeet.z,
      pickup.x,
      pickup.y,
      pickup.z,
      options.pickupRadius,
    ].every(Number.isFinite)
  ) {
    return false;
  }

  const playerRadius = Math.max(0, options.playerRadius ?? PLAYER_RADIUS);
  const playerHeight = Math.max(0, options.playerHeight ?? PLAYER_HEIGHT);
  const pickupRadius = Math.max(0, options.pickupRadius);
  const horizontalGrace = Math.max(0, options.horizontalGrace ?? 0);
  const verticalGrace = Math.max(0, options.verticalGrace ?? 0);
  const horizontalReach = playerRadius + pickupRadius + horizontalGrace;
  if (
    segmentPointDistanceSquared2D(previousFeet, currentFeet, pickup) >
    horizontalReach * horizontalReach
  ) {
    return false;
  }

  const sweptFeetMin = Math.min(previousFeet.y, currentFeet.y) - verticalGrace;
  const sweptHeadMax =
    Math.max(previousFeet.y, currentFeet.y) + playerHeight + verticalGrace;
  return (
    pickup.y + pickupRadius >= sweptFeetMin &&
    pickup.y - pickupRadius <= sweptHeadMax
  );
};

export interface AmmoInventory {
  ammoInMag: number;
  reserveAmmo: number;
}

export const canCollectAmmo = (inventory: AmmoInventory): boolean => {
  const safe = clampWeaponAmmo(inventory);
  return (
    safe.ammoInMag < safe.magCapacity ||
    safe.reserveAmmo < RIFLE_RESERVE_CAPACITY
  );
};

export const applyAmmoPickup = (
  inventory: AmmoInventory,
  amount = AMMO_PACK_AMOUNT
): AmmoInventory => {
  const safe = clampWeaponAmmo(inventory);
  let remaining = Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0));
  const magazineGain = Math.min(remaining, safe.magCapacity - safe.ammoInMag);
  remaining -= magazineGain;
  const reserveGain = Math.min(
    remaining,
    RIFLE_RESERVE_CAPACITY - safe.reserveAmmo
  );
  return {
    ammoInMag: safe.ammoInMag + magazineGain,
    reserveAmmo: safe.reserveAmmo + reserveGain,
  };
};

export const applyHealthPickup = (
  health: number,
  amount = HEALTH_PACK_AMOUNT
): number =>
  Math.min(
    MAX_HEALTH,
    Math.max(0, Math.trunc(Number.isFinite(health) ? health : 0)) +
      Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0))
  );
