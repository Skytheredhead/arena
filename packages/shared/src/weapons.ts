import {
  RIFLE_CLIP_SIZE,
  RIFLE_CARRY_CAPACITY,
  RIFLE_DAMAGE,
  RIFLE_FIRE_INTERVAL_TICKS,
  RIFLE_RANGE,
  SERVER_TICK_MS,
  SHOTGUN_DAMAGE,
  SHOTGUN_FIRE_INTERVAL_TICKS,
  SHOTGUN_PELLETS,
  SNIPER_DAMAGE,
  SNIPER_FIRE_INTERVAL_TICKS,
  WEAPON_SLOT_RIFLE,
  WEAPON_SLOT_SHOTGUN,
  WEAPON_SLOT_SNIPER,
  type WeaponSlot,
} from './gameplay';
import { isUint32AtOrAfter, toUint32 } from './ordering';

export const RELOAD_DURATION_MS = 980;
export const RELOAD_DURATION_TICKS = Math.ceil(
  RELOAD_DURATION_MS / SERVER_TICK_MS
);
export const RIFLE_RESERVE_CAPACITY = RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE;

export interface WeaponSpec {
  slot: WeaponSlot;
  damage: number;
  pellets: number;
  range: number;
  fireIntervalTicks: number;
}

export const WEAPON_SPECS: Record<WeaponSlot, WeaponSpec> = {
  1: {
    slot: WEAPON_SLOT_RIFLE,
    damage: RIFLE_DAMAGE,
    pellets: 1,
    range: RIFLE_RANGE,
    fireIntervalTicks: RIFLE_FIRE_INTERVAL_TICKS,
  },
  2: {
    slot: WEAPON_SLOT_SNIPER,
    damage: SNIPER_DAMAGE,
    pellets: 1,
    range: 140,
    fireIntervalTicks: SNIPER_FIRE_INTERVAL_TICKS,
  },
  3: {
    slot: WEAPON_SLOT_SHOTGUN,
    damage: SHOTGUN_DAMAGE,
    pellets: SHOTGUN_PELLETS,
    range: 36,
    fireIntervalTicks: SHOTGUN_FIRE_INTERVAL_TICKS,
  },
};

export interface WeaponSnapshot {
  selectedWeaponSlot: WeaponSlot;
  ammoInMag: number;
  reserveAmmo: number;
  reloading: boolean;
  reloadStartedTick: number;
  reloadCompleteTick: number;
  nextReadyTick: number;
}

export const makeDefaultWeaponSnapshot = (): WeaponSnapshot => ({
  selectedWeaponSlot: WEAPON_SLOT_RIFLE,
  ammoInMag: RIFLE_CLIP_SIZE,
  reserveAmmo: RIFLE_RESERVE_CAPACITY,
  reloading: false,
  reloadStartedTick: 0,
  reloadCompleteTick: 0,
  nextReadyTick: 0,
});

export interface WeaponAmmoInput {
  ammoInMag: number;
  reserveAmmo: number;
}

export const clampWeaponAmmo = (
  ammo: WeaponAmmoInput
): WeaponAmmoInput & { magCapacity: number } => {
  const safeMag = Number.isFinite(ammo.ammoInMag)
    ? Math.trunc(ammo.ammoInMag)
    : 0;
  const safeReserve = Number.isFinite(ammo.reserveAmmo)
    ? Math.trunc(ammo.reserveAmmo)
    : 0;
  return {
    ammoInMag: Math.min(RIFLE_CLIP_SIZE, Math.max(0, safeMag)),
    reserveAmmo: Math.min(RIFLE_RESERVE_CAPACITY, Math.max(0, safeReserve)),
    magCapacity: RIFLE_CLIP_SIZE,
  };
};

export const reloadTransferAmount = (ammo: WeaponAmmoInput): number => {
  const safe = clampWeaponAmmo(ammo);
  return Math.min(safe.magCapacity - safe.ammoInMag, safe.reserveAmmo);
};

export const canStartReload = (weapon: WeaponSnapshot): boolean =>
  !weapon.reloading && reloadTransferAmount(weapon) > 0;

export const startReload = (
  weapon: WeaponSnapshot,
  currentTick: number
): WeaponSnapshot => {
  if (!canStartReload(weapon)) return weapon;
  const started = toUint32(currentTick);
  return {
    ...weapon,
    reloading: true,
    reloadStartedTick: started,
    reloadCompleteTick: (started + RELOAD_DURATION_TICKS) >>> 0,
  };
};

export const completeReloadIfReady = (
  weapon: WeaponSnapshot,
  currentTick: number
): WeaponSnapshot => {
  if (
    !weapon.reloading ||
    !isUint32AtOrAfter(currentTick, weapon.reloadCompleteTick)
  ) {
    return weapon;
  }
  const safe = clampWeaponAmmo(weapon);
  const transferred = reloadTransferAmount(safe);
  return {
    ...weapon,
    ammoInMag: safe.ammoInMag + transferred,
    reserveAmmo: safe.reserveAmmo - transferred,
    reloading: false,
    reloadStartedTick: 0,
    reloadCompleteTick: 0,
  };
};

export const canFireWeaponAtTick = (
  weapon: WeaponSnapshot,
  currentTick: number
): boolean =>
  !weapon.reloading &&
  weapon.ammoInMag > 0 &&
  isUint32AtOrAfter(currentTick, weapon.nextReadyTick);
