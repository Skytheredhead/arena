import {
  addUint32,
  isAtOrAfterUint32,
  toUint32,
} from './ordering.js';
import type { Vec3 } from './mapTypes.js';

export type WeaponId = 'pulse-rifle' | 'longshot-sniper' | 'breach-shotgun';
export type WeaponSlot = 1 | 2 | 3;

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly slot: WeaponSlot;
  readonly displayName: string;
  readonly automatic: boolean;
  readonly magazineSize: number;
  readonly reserveCapacity: number;
  readonly fireIntervalTicks: number;
  readonly reloadTicks: number;
  readonly damagePerProjectile: number;
  readonly projectileCount: number;
  readonly range: number;
  readonly falloffStart: number;
  readonly falloffEnd: number;
  readonly minimumDamageMultiplier: number;
  readonly hipSpreadRadians: number;
  readonly adsSpreadRadians: number;
  readonly recoilPitch: number;
  readonly recoilYaw: number;
  readonly canScope: boolean;
}

export const WEAPON_DEFINITIONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  'pulse-rifle': {
    id: 'pulse-rifle',
    slot: 1,
    displayName: 'Pulse Rifle',
    automatic: true,
    magazineSize: 30,
    reserveCapacity: 120,
    fireIntervalTicks: 6,
    reloadTicks: 105,
    damagePerProjectile: 24,
    projectileCount: 1,
    range: 90,
    falloffStart: 35,
    falloffEnd: 75,
    minimumDamageMultiplier: 0.55,
    hipSpreadRadians: 0.018,
    adsSpreadRadians: 0.004,
    recoilPitch: 0.013,
    recoilYaw: 0.005,
    canScope: false,
  },
  'longshot-sniper': {
    id: 'longshot-sniper',
    slot: 2,
    displayName: 'Longshot Sniper',
    automatic: false,
    magazineSize: 5,
    reserveCapacity: 20,
    fireIntervalTicks: 72,
    reloadTicks: 150,
    damagePerProjectile: 95,
    projectileCount: 1,
    range: 180,
    falloffStart: 120,
    falloffEnd: 170,
    minimumDamageMultiplier: 0.8,
    hipSpreadRadians: 0.035,
    adsSpreadRadians: 0.0008,
    recoilPitch: 0.055,
    recoilYaw: 0.012,
    canScope: true,
  },
  'breach-shotgun': {
    id: 'breach-shotgun',
    slot: 3,
    displayName: 'Breach Shotgun',
    automatic: false,
    magazineSize: 8,
    reserveCapacity: 32,
    fireIntervalTicks: 54,
    reloadTicks: 132,
    damagePerProjectile: 12,
    projectileCount: 12,
    range: 32,
    falloffStart: 8,
    falloffEnd: 25,
    minimumDamageMultiplier: 0.25,
    hipSpreadRadians: 0.09,
    adsSpreadRadians: 0.065,
    recoilPitch: 0.07,
    recoilYaw: 0.018,
    canScope: false,
  },
};

export const WEAPON_IDS = Object.freeze(
  Object.keys(WEAPON_DEFINITIONS) as WeaponId[]
);

export const isWeaponSlot = (value: unknown): value is WeaponSlot =>
  value === 1 || value === 2 || value === 3;

export const weaponForSlot = (slot: WeaponSlot): WeaponDefinition =>
  slot === 1
    ? WEAPON_DEFINITIONS['pulse-rifle']
    : slot === 2
      ? WEAPON_DEFINITIONS['longshot-sniper']
      : WEAPON_DEFINITIONS['breach-shotgun'];

export interface WeaponState {
  readonly weaponId: WeaponId;
  readonly ammoInMagazine: number;
  readonly reserveAmmo: number;
  readonly nextFireTick: number;
  readonly reloadCompleteTick: number | null;
}

export const createWeaponState = (
  weaponId: WeaponId,
  currentTick = 0
): WeaponState => {
  const definition = WEAPON_DEFINITIONS[weaponId];
  return {
    weaponId,
    ammoInMagazine: definition.magazineSize,
    reserveAmmo: definition.reserveCapacity,
    nextFireTick: toUint32(currentTick),
    reloadCompleteTick: null,
  };
};

export interface WeaponActionResult {
  readonly state: WeaponState;
  readonly accepted: boolean;
  readonly reason:
    | 'fired'
    | 'reloading'
    | 'cooldown'
    | 'empty'
    | 'reload-started'
    | 'reload-not-needed'
    | 'reload-complete'
    | 'reload-pending';
}

export const completeReloadIfReady = (
  state: WeaponState,
  currentTick: number
): WeaponActionResult => {
  if (state.reloadCompleteTick == null) {
    return { state, accepted: false, reason: 'reload-pending' };
  }
  if (!isAtOrAfterUint32(currentTick, state.reloadCompleteTick)) {
    return { state, accepted: false, reason: 'reload-pending' };
  }
  const definition = WEAPON_DEFINITIONS[state.weaponId];
  const needed = Math.max(0, definition.magazineSize - state.ammoInMagazine);
  const transferred = Math.min(needed, state.reserveAmmo);
  return {
    state: {
      ...state,
      ammoInMagazine: state.ammoInMagazine + transferred,
      reserveAmmo: state.reserveAmmo - transferred,
      reloadCompleteTick: null,
    },
    accepted: true,
    reason: 'reload-complete',
  };
};

export const startReload = (
  state: WeaponState,
  currentTick: number
): WeaponActionResult => {
  const definition = WEAPON_DEFINITIONS[state.weaponId];
  if (
    state.reloadCompleteTick != null ||
    state.ammoInMagazine >= definition.magazineSize ||
    state.reserveAmmo <= 0
  ) {
    return { state, accepted: false, reason: 'reload-not-needed' };
  }
  return {
    state: {
      ...state,
      reloadCompleteTick: addUint32(currentTick, definition.reloadTicks),
    },
    accepted: true,
    reason: 'reload-started',
  };
};

export const tryFireWeapon = (
  originalState: WeaponState,
  currentTick: number
): WeaponActionResult => {
  const reloadResult = completeReloadIfReady(originalState, currentTick);
  const state =
    reloadResult.accepted && reloadResult.reason === 'reload-complete'
      ? reloadResult.state
      : originalState;
  if (state.reloadCompleteTick != null) {
    return { state, accepted: false, reason: 'reloading' };
  }
  if (!isAtOrAfterUint32(currentTick, state.nextFireTick)) {
    return { state, accepted: false, reason: 'cooldown' };
  }
  if (state.ammoInMagazine <= 0) {
    return { state, accepted: false, reason: 'empty' };
  }
  const definition = WEAPON_DEFINITIONS[state.weaponId];
  return {
    state: {
      ...state,
      ammoInMagazine: state.ammoInMagazine - 1,
      nextFireTick: addUint32(currentTick, definition.fireIntervalTicks),
    },
    accepted: true,
    reason: 'fired',
  };
};

export const damageAtDistance = (
  weaponId: WeaponId,
  distance: number
): number => {
  const definition = WEAPON_DEFINITIONS[weaponId];
  if (!Number.isFinite(distance) || distance < 0 || distance > definition.range) {
    return 0;
  }
  if (distance <= definition.falloffStart) {
    return definition.damagePerProjectile;
  }
  if (distance >= definition.falloffEnd) {
    return (
      definition.damagePerProjectile * definition.minimumDamageMultiplier
    );
  }
  const progress =
    (distance - definition.falloffStart) /
    (definition.falloffEnd - definition.falloffStart);
  const multiplier =
    1 - progress * (1 - definition.minimumDamageMultiplier);
  return definition.damagePerProjectile * multiplier;
};

const normalizeVec3 = (value: Vec3): Vec3 => {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) return [0, 0, -1];
  return [value[0] / length, value[1] / length, value[2] / length];
};

const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const makeRandom = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
};

export const deterministicShotDirections = (
  weaponId: WeaponId,
  forward: Vec3,
  shotSeed: number,
  aimingDownSights: boolean
): readonly Vec3[] => {
  const definition = WEAPON_DEFINITIONS[weaponId];
  const spread = aimingDownSights
    ? definition.adsSpreadRadians
    : definition.hipSpreadRadians;
  const normalizedForward = normalizeVec3(forward);
  const referenceUp: Vec3 =
    Math.abs(normalizedForward[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
  const right = normalizeVec3(cross(normalizedForward, referenceUp));
  const up = normalizeVec3(cross(right, normalizedForward));
  const random = makeRandom(shotSeed);
  const directions: Vec3[] = [];

  for (let index = 0; index < definition.projectileCount; index += 1) {
    const radius = Math.sqrt(random()) * Math.tan(spread);
    const angle = random() * Math.PI * 2;
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;
    directions.push(
      normalizeVec3([
        normalizedForward[0] + right[0] * offsetX + up[0] * offsetY,
        normalizedForward[1] + right[1] * offsetX + up[1] * offsetY,
        normalizedForward[2] + right[2] * offsetX + up[2] * offsetY,
      ])
    );
  }
  return directions;
};
