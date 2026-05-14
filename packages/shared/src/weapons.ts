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
