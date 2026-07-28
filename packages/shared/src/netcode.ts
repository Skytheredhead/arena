import {
  isNewerUint32,
  subtractUint32,
  toUint32,
} from './ordering.js';
import { isWeaponSlot, type WeaponSlot } from './weapons.js';

export const MAX_INPUT_HISTORY = 256;
export const MAX_INPUT_BATCH = 24;
export const MAX_LAG_COMPENSATION_TICKS = 12;
export const MAX_PITCH_RADIANS = Math.PI / 2 - 0.02;

export interface PlayerInputFrame {
  readonly sequence: number;
  readonly clientTick: number;
  readonly moveX: number;
  readonly moveZ: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly jumpHeld: boolean;
  readonly firePressed: boolean;
  readonly reloadPressed: boolean;
  readonly scopeHeld: boolean;
  readonly weaponSlot: WeaponSlot;
}

export type UntrustedInputFrame = {
  readonly [Key in keyof PlayerInputFrame]?: unknown;
};

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export const normalizeYaw = (value: number): number => {
  const twoPi = Math.PI * 2;
  const normalized = ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return normalized === -Math.PI ? Math.PI : normalized;
};

export const sanitizePlayerInput = (
  value: UntrustedInputFrame
): PlayerInputFrame => {
  let moveX = clamp(finiteNumber(value.moveX), -1, 1);
  let moveZ = clamp(finiteNumber(value.moveZ), -1, 1);
  const length = Math.hypot(moveX, moveZ);
  if (length > 1) {
    moveX /= length;
    moveZ /= length;
  }
  return {
    sequence: toUint32(finiteNumber(value.sequence)),
    clientTick: toUint32(finiteNumber(value.clientTick)),
    moveX,
    moveZ,
    yaw: normalizeYaw(finiteNumber(value.yaw)),
    pitch: clamp(
      finiteNumber(value.pitch),
      -MAX_PITCH_RADIANS,
      MAX_PITCH_RADIANS
    ),
    jumpHeld: value.jumpHeld === true,
    firePressed: value.firePressed === true,
    reloadPressed: value.reloadPressed === true,
    scopeHeld: value.scopeHeld === true,
    weaponSlot: isWeaponSlot(value.weaponSlot) ? value.weaponSlot : 1,
  };
};

export const coalesceInputFrames = (
  older: PlayerInputFrame,
  newer: PlayerInputFrame
): PlayerInputFrame => ({
  ...newer,
  firePressed: older.firePressed || newer.firePressed,
  reloadPressed: older.reloadPressed || newer.reloadPressed,
});

export const appendInputBounded = (
  history: readonly PlayerInputFrame[],
  frame: PlayerInputFrame,
  maximum = MAX_INPUT_HISTORY
): PlayerInputFrame[] => {
  if (maximum < 1) return [];
  const next = [...history, frame];
  while (next.length > maximum) {
    const oldest = next.shift();
    const following = next.shift();
    if (oldest && following) {
      next.unshift(coalesceInputFrames(oldest, following));
    }
  }
  return next;
};

export const acknowledgeInputHistory = (
  history: readonly PlayerInputFrame[],
  acknowledgedSequence: number
): PlayerInputFrame[] =>
  history.filter((frame) =>
    isNewerUint32(frame.sequence, acknowledgedSequence)
  );

export interface ReliableInputEntry {
  readonly frame: PlayerInputFrame;
  readonly attempts: number;
  readonly lastSentAtMs: number | null;
}

export const createReliableInputEntry = (
  frame: PlayerInputFrame
): ReliableInputEntry => ({
  frame,
  attempts: 0,
  lastSentAtMs: null,
});

export const markInputSent = (
  entry: ReliableInputEntry,
  nowMs: number
): ReliableInputEntry => ({
  ...entry,
  attempts: entry.attempts + 1,
  lastSentAtMs: Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0,
});

export const retryDelayMs = (
  attempts: number,
  baseDelayMs = 40,
  maximumDelayMs = 400
): number =>
  Math.min(
    Math.max(baseDelayMs, maximumDelayMs),
    Math.max(1, baseDelayMs) * 2 ** Math.min(8, Math.max(0, attempts - 1))
  );

export const selectInputRetryBatch = (
  entries: readonly ReliableInputEntry[],
  nowMs: number,
  maximum = MAX_INPUT_BATCH
): ReliableInputEntry[] => {
  const normalizedNow = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  return entries
    .filter(
      (entry) =>
        entry.lastSentAtMs == null ||
        normalizedNow - entry.lastSentAtMs >= retryDelayMs(entry.attempts)
    )
    .slice(0, Math.max(0, maximum));
};

export const clampLagCompensatedTick = (
  serverTick: number,
  requestedTick: number,
  maximumRewindTicks = MAX_LAG_COMPENSATION_TICKS
): number => {
  const normalizedServer = toUint32(serverTick);
  const normalizedRequested = toUint32(requestedTick);
  if (isNewerUint32(normalizedRequested, normalizedServer)) {
    return normalizedServer;
  }
  const age = (normalizedServer - normalizedRequested) >>> 0;
  const maximum = Math.max(0, Math.trunc(maximumRewindTicks));
  return age <= maximum
    ? normalizedRequested
    : subtractUint32(normalizedServer, maximum);
};

export const sanitizeNickname = (value: string, fallback = 'OPERATOR'): string => {
  const sanitized = value
    .normalize('NFKC')
    .replace(/<[^>]*>/gu, '')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127 && character !== '<' && character !== '>';
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 16);
  return sanitized || fallback;
};

export const sanitizeChatMessage = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/<[^>]*>/gu, '')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        (code === 9 || code === 10 || code === 13 || code > 31) &&
        code !== 127 &&
        character !== '<' &&
        character !== '>'
      );
    })
    .join('')
    .replace(/[ \t]+/gu, ' ')
    .trim()
    .slice(0, 160);
