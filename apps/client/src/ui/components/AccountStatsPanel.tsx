import type { AccountStatsView } from '../models';
import {
  formatStatNumber,
  summarizeAccountStats,
} from '../accountStatsMetrics';
import { CYBER, CyberLine } from '../cyberTheme';

interface AccountStatsPanelProps {
  stats: AccountStatsView | null;
}

function StatCard({
  label,
  value,
  accent = CYBER.a,
}: {
  label: string;
  value: string;
  accent?: string;
}): React.JSX.Element {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '10px 9px',
        border: `1px solid ${accent}44`,
        borderTop: `2px solid ${accent}`,
        background: `${accent}0b`,
      }}
    >
      <div
        style={{
          color: CYBER.textDim,
          fontFamily: CYBER.font,
          fontSize: '8px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: accent,
          fontFamily: "'Orbitron',var(--font)",
          fontSize: '17px',
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatRows({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}): React.JSX.Element {
  return (
    <section>
      <div
        style={{
          color: CYBER.a,
          fontFamily: CYBER.font,
          fontSize: '8px',
          letterSpacing: '3px',
          marginBottom: '7px',
        }}
      >
        // {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 14px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <div style={{ color: CYBER.textDim, fontFamily: CYBER.font, fontSize: '10px' }}>
              {label}
            </div>
            <div
              style={{
                color: CYBER.textBright,
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '10px',
                textAlign: 'right',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AccountStatsPanel({ stats }: AccountStatsPanelProps): React.JSX.Element {
  if (!stats) {
    return (
      <div style={{ color: CYBER.textDim, fontFamily: CYBER.font, fontSize: '11px' }}>
        No account stats recorded yet. Enter an arena to begin tracking.
      </div>
    );
  }

  const summary = summarizeAccountStats(stats);
  return (
    <div style={{ maxHeight: 'min(58vh,520px)', overflowY: 'auto', paddingRight: '3px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
          gap: '7px',
        }}
      >
        <StatCard label="K / D" value={summary.kdRatio.toFixed(2)} />
        <StatCard label="Accuracy" value={`${summary.accuracyPercent.toFixed(1)}%`} accent={CYBER.ok} />
        <StatCard label="Eliminations" value={formatStatNumber(stats.kills)} accent={CYBER.ok} />
        <StatCard label="Arena Time" value={summary.arenaTime} />
      </div>

      <CyberLine margin="12px 0" />
      <StatRows
        title="COMBAT RECORD"
        rows={[
          ['Deaths', formatStatNumber(stats.deaths)],
          ['Shots hit / fired', `${formatStatNumber(stats.shotsHit)} / ${formatStatNumber(stats.shotsFired)}`],
          ['Damage dealt', formatStatNumber(stats.damageDealt)],
          ['Damage taken', formatStatNumber(stats.damageTaken)],
        ]}
      />

      <CyberLine margin="12px 0" />
      <StatRows
        title="FIELD ACTIVITY"
        rows={[
          ['Arena entries', formatStatNumber(stats.timesPlayed)],
          ['Matches launched', formatStatNumber(stats.matchesStarted)],
          ['Ammo / health pickups', `${formatStatNumber(stats.ammoCollected)} / ${formatStatNumber(stats.healthCollected)}`],
          ['Respawns', formatStatNumber(stats.respawns)],
          ['Lobby time', summary.lobbyTime],
        ]}
      />
    </div>
  );
}
