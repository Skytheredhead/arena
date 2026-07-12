import {
  MAX_PITCH,
  WEAPON_SLOT_RIFLE,
  WEAPON_SLOT_SHOTGUN,
  WEAPON_SLOT_SNIPER,
  type WeaponSlot,
} from './gameplay';
import { toUint32 } from './ordering';

export interface InputCommand {
  sequence: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jumpHeld: boolean;
  sprintHeld: boolean;
  crouchHeld: boolean;
  scoped: boolean;
  fireHeld: boolean;
  reloadPressed: boolean;
  weaponSlot: WeaponSlot;
}

export interface FrameInput {
  moveX: number;
  moveZ: number;
  jumping: boolean;
  sprinting: boolean;
  crouching: boolean;
  scoped: boolean;
  scoreboardHeld: boolean;
  wantsFire: boolean;
  wantsReload: boolean;
  weaponSlot: WeaponSlot;
}

/** Number of consecutive input snapshots used to carry a one-shot action. */
export const INPUT_EDGE_REDUNDANCY_COMMANDS = 4;

export interface InputEdgeRedundancyState {
  reloadCommandsRemaining: number;
}

export const makeInputEdgeRedundancyState = (): InputEdgeRedundancyState => ({
  reloadCommandsRemaining: 0,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const normalizeWeaponSlot = (slot: number): WeaponSlot => {
  if (slot === WEAPON_SLOT_SNIPER) return WEAPON_SLOT_SNIPER;
  if (slot === WEAPON_SLOT_SHOTGUN) return WEAPON_SLOT_SHOTGUN;
  return WEAPON_SLOT_RIFLE;
};

export const normalizeYaw = (yaw: number): number => {
  if (!Number.isFinite(yaw)) return 0;
  const twoPi = Math.PI * 2;
  const normalized = ((((yaw + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return normalized === -Math.PI ? Math.PI : normalized;
};

/**
 * Sanitizes an input before either prediction or transport. This prevents a
 * malformed local sample from poisoning the prediction state with NaN.
 */
export const sanitizeInputCommand = (
  command: InputCommand,
  fallbackLook: Pick<InputCommand, 'yaw' | 'pitch'> = { yaw: 0, pitch: 0 }
): InputCommand => {
  const fallbackYaw = finiteOr(fallbackLook.yaw, 0);
  const fallbackPitch = finiteOr(fallbackLook.pitch, 0);
  return {
    sequence: toUint32(command.sequence),
    moveX: clamp(finiteOr(command.moveX, 0), -1, 1),
    moveZ: clamp(finiteOr(command.moveZ, 0), -1, 1),
    yaw: normalizeYaw(finiteOr(command.yaw, fallbackYaw)),
    pitch: clamp(finiteOr(command.pitch, fallbackPitch), -MAX_PITCH, MAX_PITCH),
    jumpHeld: Boolean(command.jumpHeld),
    sprintHeld: Boolean(command.sprintHeld),
    crouchHeld: Boolean(command.crouchHeld),
    scoped: Boolean(command.scoped),
    fireHeld: Boolean(command.fireHeld),
    reloadPressed: Boolean(command.reloadPressed),
    weaponSlot: normalizeWeaponSlot(command.weaponSlot),
  };
};

/**
 * Coalesces snapshots without dropping short fire/reload intent between network
 * flushes. Continuous movement/look always comes from the freshest command.
 */
export const coalesceInputCommands = (
  previous: InputCommand | null,
  next: InputCommand
): InputCommand =>
  previous
    ? {
        ...next,
        fireHeld: previous.fireHeld || next.fireHeld,
        reloadPressed: previous.reloadPressed || next.reloadPressed,
      }
    : next;

/**
 * Repeats idempotent edge actions over several snapshots. This makes reload
 * survive isolated packet/reducer loss without waiting for a round-trip ack.
 */
export const applyInputEdgeRedundancy = (
  state: InputEdgeRedundancyState,
  command: InputCommand,
  commandCount = INPUT_EDGE_REDUNDANCY_COMMANDS
): { state: InputEdgeRedundancyState; command: InputCommand } => {
  const requestedCount = command.reloadPressed
    ? Math.max(1, Math.trunc(commandCount))
    : 0;
  const remaining = Math.max(state.reloadCommandsRemaining, requestedCount);
  return {
    state: {
      reloadCommandsRemaining: Math.max(0, remaining - 1),
    },
    command: {
      ...command,
      reloadPressed: remaining > 0,
    },
  };
};
