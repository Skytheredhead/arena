import { SERVER_TICK_RATE, type AccountStatsView } from './models';

export interface AccountStatSummary {
  kdRatio: number;
  accuracyPercent: number;
  arenaTime: string;
  lobbyTime: string;
}

export const formatStatDuration = (ticks: number): string => {
  const seconds = Math.max(0, Math.floor(ticks / SERVER_TICK_RATE));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
};

export const formatStatNumber = (value: number): string =>
  Math.max(0, Math.trunc(value)).toLocaleString('en-US');

export const summarizeAccountStats = (
  stats: AccountStatsView
): AccountStatSummary => ({
  kdRatio: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  accuracyPercent:
    stats.shotsFired === 0
      ? 0
      : Math.min(100, Math.max(0, (stats.shotsHit / stats.shotsFired) * 100)),
  arenaTime: formatStatDuration(stats.totalPlayTimeTicks),
  lobbyTime: formatStatDuration(stats.totalLobbyTimeTicks),
});
