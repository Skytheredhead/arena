import { describe, expect, it } from 'vitest';
import type { AccountStatsView } from '../netcode/authClient';
import {
  formatStatDuration,
  summarizeAccountStats,
} from '../ui/accountStatsMetrics';

const makeStats = (
  overrides: Partial<AccountStatsView> = {}
): AccountStatsView => ({
  accountId: 1,
  username: 'pilot',
  timesPlayed: 5,
  totalPlayTimeTicks: 60 * 65,
  totalLobbyTimeTicks: 60 * 3,
  kills: 12,
  deaths: 4,
  kdr: 3,
  shotsFired: 40,
  shotsHit: 10,
  damageDealt: 900,
  damageTaken: 450,
  ammoCollected: 8,
  healthCollected: 3,
  chatMessages: 2,
  roomsCreated: 1,
  roomsJoined: 5,
  matchesStarted: 1,
  respawns: 4,
  lastSeenTick: 100,
  ...overrides,
});

describe('account stats summary', () => {
  it('derives combat ratios from authoritative counters', () => {
    const summary = summarizeAccountStats(makeStats());

    expect(summary.kdRatio).toBe(3);
    expect(summary.accuracyPercent).toBe(25);
    expect(summary.arenaTime).toBe('1m 5s');
  });

  it('handles zero deaths and caps legacy pellet-inflated accuracy', () => {
    const summary = summarizeAccountStats(
      makeStats({ deaths: 0, kills: 7, shotsFired: 4, shotsHit: 10 })
    );

    expect(summary.kdRatio).toBe(7);
    expect(summary.accuracyPercent).toBe(100);
  });

  it('formats long tracked durations compactly', () => {
    expect(formatStatDuration(60 * 60 * 63)).toBe('1h 3m');
    expect(formatStatDuration(-100)).toBe('0s');
  });
});
