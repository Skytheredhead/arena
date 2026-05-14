import {
  MAX_HEALTH,
  RIFLE_MAGAZINE,
  type LocalPlayerState,
  type Vec3,
} from '@arena/shared';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizeScalar = (
  value: unknown,
  fallback: number,
  {
    min,
    max,
    round = false,
  }: {
    min?: number;
    max?: number;
    round?: boolean;
  } = {}
): number => {
  const candidate = isFiniteNumber(value) ? value : fallback;
  const normalized = round ? Math.round(candidate) : candidate;
  const withMin = min == null ? normalized : Math.max(min, normalized);
  return max == null ? withMin : Math.min(max, withMin);
};

const sanitizeVec3 = (value: unknown, fallback: Vec3): Vec3 => {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }

  const candidate = value as Partial<Vec3>;
  return {
    x: sanitizeScalar(candidate.x, fallback.x),
    y: sanitizeScalar(candidate.y, fallback.y),
    z: sanitizeScalar(candidate.z, fallback.z),
  };
};

export const sanitizeLocalPlayerPatch = (
  patch: Partial<LocalPlayerState>,
  fallback: LocalPlayerState
): Partial<LocalPlayerState> => {
  const next: Partial<LocalPlayerState> = {};

  if (typeof patch.identity === 'string') {
    next.identity = patch.identity;
  }
  if ('position' in patch) {
    next.position = sanitizeVec3(patch.position, fallback.position);
  }
  if ('velocity' in patch) {
    next.velocity = sanitizeVec3(patch.velocity, fallback.velocity);
  }
  if ('serverTick' in patch) {
    next.serverTick = sanitizeScalar(patch.serverTick, fallback.serverTick, {
      min: 0,
      round: true,
    });
  }
  if ('serverTimeMs' in patch) {
    next.serverTimeMs = sanitizeScalar(
      patch.serverTimeMs,
      fallback.serverTimeMs,
      {
        min: 0,
      }
    );
  }
  if ('inputPipelineMs' in patch) {
    next.inputPipelineMs = sanitizeScalar(
      patch.inputPipelineMs,
      fallback.inputPipelineMs,
      {
        min: 0,
        round: true,
      }
    );
  }
  if ('yaw' in patch) {
    next.yaw = sanitizeScalar(patch.yaw, fallback.yaw);
  }
  if ('pitch' in patch) {
    next.pitch = sanitizeScalar(patch.pitch, fallback.pitch);
  }
  if (typeof patch.onGround === 'boolean') {
    next.onGround = patch.onGround;
  }
  if (typeof patch.sprinting === 'boolean') {
    next.sprinting = patch.sprinting;
  }
  if (typeof patch.crouching === 'boolean') {
    next.crouching = patch.crouching;
  }
  if (typeof patch.alive === 'boolean') {
    next.alive = patch.alive;
  }
  if ('health' in patch) {
    next.health = sanitizeScalar(patch.health, fallback.health, {
      min: 0,
      max: MAX_HEALTH,
      round: true,
    });
  }
  if ('ammo' in patch) {
    next.ammo = sanitizeScalar(patch.ammo, fallback.ammo, {
      min: 0,
      max: RIFLE_MAGAZINE,
      round: true,
    });
  }
  if ('lastProcessedInput' in patch) {
    next.lastProcessedInput = sanitizeScalar(
      patch.lastProcessedInput,
      fallback.lastProcessedInput,
      { min: 0, round: true }
    );
  }
  if ('respawnTick' in patch) {
    next.respawnTick = sanitizeScalar(patch.respawnTick, fallback.respawnTick, {
      min: 0,
      round: true,
    });
  }

  return next;
};
