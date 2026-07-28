import { isNewerUint32, toUint32 } from './ordering.js';

export const MATCH_RULES = Object.freeze({
  maxCombatants: 12,
  eliminationLimit: 30,
  matchDurationTicks: 10 * 60 * 60,
  intermissionTicks: 10 * 60,
  respawnDelayTicks: 3 * 60,
  spawnProtectionTicks: 3 * 60,
});

export type MatchEndReason = 'elimination-limit' | 'time-limit' | null;

export const matchEndReason = (
  highestEliminations: number,
  elapsedTicks: number
): MatchEndReason => {
  if (Math.max(0, Math.trunc(highestEliminations)) >= MATCH_RULES.eliminationLimit) {
    return 'elimination-limit';
  }
  if (Math.max(0, Math.trunc(elapsedTicks)) >= MATCH_RULES.matchDurationTicks) {
    return 'time-limit';
  }
  return null;
};

export const remainingMatchTicks = (elapsedTicks: number): number =>
  Math.max(0, MATCH_RULES.matchDurationTicks - Math.max(0, Math.trunc(elapsedTicks)));

export interface Standing {
  readonly identity: string;
  readonly nickname: string;
  readonly kills: number;
  readonly deaths: number;
  readonly connected: boolean;
  readonly isBot: boolean;
}

export const sortStandings = (
  standings: readonly Standing[]
): Standing[] =>
  [...standings].sort(
    (left, right) =>
      right.kills - left.kills ||
      left.deaths - right.deaths ||
      left.nickname.localeCompare(right.nickname) ||
      left.identity.localeCompare(right.identity)
  );

export const botSlotsRequired = (
  humanCount: number,
  maximum = MATCH_RULES.maxCombatants
): number =>
  Math.max(
    0,
    Math.trunc(maximum) - Math.max(0, Math.min(Math.trunc(maximum), Math.trunc(humanCount)))
  );

export interface BotSlot {
  readonly identity: string;
  readonly joinedTick: number;
}

export const selectBotForHumanReplacement = (
  bots: readonly BotSlot[]
): BotSlot | null => {
  if (bots.length === 0) return null;
  return [...bots].sort((left, right) => {
    const leftTick = toUint32(left.joinedTick);
    const rightTick = toUint32(right.joinedTick);
    if (leftTick === rightTick) {
      return right.identity.localeCompare(left.identity);
    }
    return isNewerUint32(leftTick, rightTick) ? -1 : 1;
  })[0]!;
};

export const saturatingDamage = (health: number, damage: number): number =>
  Math.max(
    0,
    Math.min(100, finiteNonNegative(health) - finiteNonNegative(damage))
  );

export const saturatingHeal = (health: number, healing: number): number =>
  Math.max(
    0,
    Math.min(100, finiteNonNegative(health) + finiteNonNegative(healing))
  );

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
