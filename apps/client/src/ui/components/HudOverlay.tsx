import { RIFLE_MAGAZINE, type KillFeedEntry, type MatchView, type ScoreRow } from '@arena/shared';
import {
  CYBER,
  CyberBar,
  CyberButton,
  CyberCrosshair,
  CyberPanel,
  PingLabel
} from '../cyberTheme';

const formatTimer = (match: MatchView | null): string => {
  if (!match) {
    return '--:--';
  }

  const totalSeconds = Math.max(0, Math.floor(match.remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

interface HudOverlayProps {
  localIdentity: string | null;
  health: number;
  ammo: number;
  localKills: number;
  localDeaths: number;
  match: MatchView | null;
  killFeed: KillFeedEntry[];
  scoreboard: ScoreRow[];
  scoreboardOpen: boolean;
  connected: boolean;
  hitmarkerVisible: boolean;
  crosshairSpread: number;
  scoped: boolean;
}

export function HudOverlay({
  localIdentity,
  health,
  ammo,
  localKills,
  localDeaths,
  match,
  killFeed,
  scoreboard,
  scoreboardOpen,
  connected,
  hitmarkerVisible,
  crosshairSpread,
  scoped
}: HudOverlayProps): React.JSX.Element {
  const localKdr = localDeaths === 0 ? localKills : localKills / localDeaths;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center,transparent 40%,${CYBER.bg}cc 100%)`,
          zIndex: 2
        }}
      />

      <CyberCrosshair
        hitmarkerVisible={hitmarkerVisible}
        spread={crosshairSpread}
        scoped={scoped}
      />

      <div
        className="cyber-fade-up"
        style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
      >
        <CyberPanel
          style={{
            padding: '8px 28px',
            display: 'flex',
            gap: '28px',
            alignItems: 'center',
            backdropFilter: 'blur(12px)'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                color: CYBER.a2,
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '20px',
                fontWeight: 700,
                textShadow: `0 0 12px ${CYBER.a2}`
              }}
            >
              {localKills}
            </div>
            <div style={{ color: CYBER.textDim, fontSize: '8px', letterSpacing: '3px', fontFamily: CYBER.font }}>KILLS</div>
          </div>
          <div
            style={{
              fontFamily: "'Orbitron',var(--font)",
              fontSize: '28px',
              fontWeight: 700,
              color: CYBER.a,
              letterSpacing: '4px',
              textShadow: `0 0 20px ${CYBER.a}, 0 0 40px ${CYBER.a}44`
            }}
          >
            {formatTimer(match)}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                color: CYBER.a,
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '20px',
                fontWeight: 700,
                textShadow: `0 0 12px ${CYBER.a}`
              }}
            >
              {localKdr.toFixed(2)}
            </div>
            <div style={{ color: CYBER.textDim, fontSize: '8px', letterSpacing: '3px', fontFamily: CYBER.font }}>KDR</div>
          </div>
        </CyberPanel>
      </div>

      <div className="cyber-slide-right" style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '5px', maxWidth: '320px' }}>
        {killFeed.map((entry, index) => (
          <div
            key={entry.id}
            style={{
              background: 'rgba(0,10,20,0.88)',
              border: `1px solid ${CYBER.border}`,
              backdropFilter: 'blur(8px)',
              padding: '5px 10px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              fontFamily: CYBER.font,
              fontSize: '11px',
              animation: `cyberSlideRight .3s ${index * 0.05}s cubic-bezier(.16,1,.3,1) both`
            }}
          >
            <span style={{ color: CYBER.a, fontWeight: 'bold', textShadow: `0 0 8px ${CYBER.a}88` }}>{entry.attackerNickname}</span>
            <span style={{ color: CYBER.textDim, fontSize: '9px' }}>PULSE RIFLE</span>
            <span style={{ color: 'rgba(255,34,68,0.9)' }}>{entry.victimNickname}</span>
          </div>
        ))}
      </div>

      <div className="cyber-slide-left" style={{ position: 'absolute', bottom: '80px', left: '24px', zIndex: 10 }}>
        <CyberPanel style={{ padding: '16px 20px', backdropFilter: 'blur(12px)', minWidth: '200px' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'baseline' }}>
              <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '3px', fontFamily: CYBER.font }}>HP</div>
              <div style={{ fontFamily: "'Orbitron',var(--font)", color: CYBER.ok, fontSize: '28px', fontWeight: 700, textShadow: `0 0 12px ${CYBER.ok}88`, lineHeight: 1 }}>{health}</div>
            </div>
            <CyberBar value={health} max={100} color={CYBER.ok} />
          </div>
        </CyberPanel>
      </div>

      <div className="cyber-slide-right" style={{ position: 'absolute', bottom: '80px', right: '24px', zIndex: 10, textAlign: 'right' }}>
        <CyberPanel style={{ padding: '16px 20px', backdropFilter: 'blur(12px)' }}>
          <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '3px', fontFamily: CYBER.font, marginBottom: '6px', textAlign: 'right' }}>PULSE RIFLE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', justifyContent: 'flex-end' }}>
            <div
              style={{
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '56px',
                fontWeight: 900,
                color: CYBER.textBright,
                lineHeight: 1,
                textShadow: `0 0 20px ${CYBER.a}44`
              }}
            >
              {ammo}
            </div>
            <div style={{ fontFamily: CYBER.font, color: CYBER.textDim, fontSize: '22px', lineHeight: 1 }}>
              /{RIFLE_MAGAZINE}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap', maxWidth: '120px', marginLeft: 'auto' }}>
            {Array.from({ length: RIFLE_MAGAZINE }, (_, index) => (
              <div
                key={index}
                style={{
                  width: '5px',
                  height: '10px',
                  background: index < ammo ? CYBER.a : `${CYBER.textDim}33`,
                  boxShadow: index < ammo ? `0 0 3px ${CYBER.a}88` : undefined
                }}
              />
            ))}
          </div>
        </CyberPanel>
      </div>

      <div
        className="cyber-fade-up"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: 'rgba(2,11,20,0.85)',
          backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${CYBER.border}`,
          padding: '8px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: CYBER.font,
          fontSize: '9px',
          color: CYBER.textDim,
          letterSpacing: '2px'
        }}
      >
        <span>{connected ? 'IN MATCH' : 'OFFLINE'}</span>
        <div style={{ display: 'flex', gap: '24px' }}>
          <span style={{ color: CYBER.ok }}>{connected ? 'LAN' : '--'}</span>
          <span>{match?.roomCode ?? 'NO ROOM'}</span>
          <span>{formatTimer(match)}</span>
          <span>{scoreboard.length} PILOTS</span>
          <span>RIFLE ONLY</span>
        </div>
        <span className="cyber-blink">█</span>
      </div>

      {scoreboardOpen ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 25,
            background: 'rgba(2,11,20,0.75)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div className="cyber-scale-in" style={{ width: 'min(1080px, 96vw)', maxHeight: '86vh', overflow: 'hidden' }}>
            <CyberPanel style={{ overflow: 'hidden' }}>
              <div
                style={{
                  background: 'rgba(2,11,20,0.95)',
                  backdropFilter: 'blur(12px)',
                  borderBottom: `1px solid ${CYBER.border}`,
                  padding: '16px 28px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontFamily: "'Orbitron',var(--font)", color: CYBER.a, fontSize: '14px', fontWeight: 700, letterSpacing: '5px', textShadow: `0 0 12px ${CYBER.a}88` }}>SCOREBOARD</div>
                <div style={{ display: 'flex', gap: '36px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: CYBER.a2, fontSize: '28px', fontFamily: "'Orbitron',var(--font)", fontWeight: 700 }}>{localKills}</div>
                    <div style={{ color: CYBER.textDim, fontSize: '8px', letterSpacing: '4px', fontFamily: CYBER.font }}>KILLS</div>
                  </div>
                  <div style={{ color: CYBER.textDim, fontFamily: CYBER.font, fontSize: '18px' }}>:</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: CYBER.a, fontSize: '28px', fontFamily: "'Orbitron',var(--font)", fontWeight: 700 }}>{localDeaths}</div>
                    <div style={{ color: CYBER.textDim, fontSize: '8px', letterSpacing: '4px', fontFamily: CYBER.font }}>DEATHS</div>
                  </div>
                  <div style={{ color: CYBER.textDim, fontSize: '12px', fontFamily: CYBER.font, marginLeft: '12px', letterSpacing: '2px' }}>{formatTimer(match)} LEFT</div>
                </div>
                <CyberButton small>BACK TO GAME</CyberButton>
              </div>

              <div style={{ display: 'flex', borderBottom: `1px solid ${CYBER.a}44`, background: 'rgba(0,245,255,0.03)' }}>
                {[
                  { width: 40, label: '#' },
                  { flex: 1, label: 'PLAYER' },
                  { width: 64, label: 'K' },
                  { width: 64, label: 'D' },
                  { width: 88, label: 'SCORE' },
                  { width: 64, label: 'PING' }
                ].map(column => (
                  <div
                    key={column.label}
                    style={{
                      ...(column.flex ? { flex: 1, paddingLeft: '8px' } : { width: `${column.width}px`, textAlign: 'center' }),
                      padding: '10px 8px',
                      color: CYBER.textDim,
                      fontSize: '9px',
                      letterSpacing: '3px',
                      fontFamily: CYBER.font,
                      textTransform: 'uppercase'
                    }}
                  >
                    {column.label}
                  </div>
                ))}
              </div>

              <div style={{ maxHeight: '65vh', overflow: 'auto', paddingBottom: '24px' }}>
                {scoreboard.map((player, index) => (
                  <div
                    key={player.identity}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: `1px solid ${CYBER.border}`,
                      background: index === 0 ? `${CYBER.a}0a` : 'transparent',
                      boxShadow: index === 0 ? `inset 3px 0 0 ${CYBER.a}` : undefined
                    }}
                  >
                    <div style={{ width: '40px', padding: '13px 8px', color: CYBER.textDim, fontSize: '12px', textAlign: 'center', fontFamily: CYBER.font }}>{index + 1}</div>
                    <div style={{ flex: 1, padding: '13px 8px', color: index === 0 ? CYBER.textBright : CYBER.text, fontWeight: index === 0 ? 'bold' : 'normal', fontSize: '13px', letterSpacing: '1px', fontFamily: CYBER.font }}>
                      {player.nickname}
                      {player.identity === localIdentity ? (
                        <span
                          style={{
                            color: CYBER.a,
                            fontSize: '9px',
                            marginLeft: '8px',
                            letterSpacing: '2px'
                          }}
                        >
                          ◀ YOU
                        </span>
                      ) : null}
                    </div>
                    <div style={{ width: '64px', textAlign: 'center', padding: '13px 8px', fontFamily: "'Orbitron',var(--font)", color: CYBER.ok, fontWeight: 700, fontSize: '15px' }}>{player.kills}</div>
                    <div style={{ width: '64px', textAlign: 'center', padding: '13px 8px', fontFamily: "'Orbitron',var(--font)", color: CYBER.danger, fontWeight: 700, fontSize: '15px' }}>{player.deaths}</div>
                    <div style={{ width: '88px', textAlign: 'center', padding: '13px 8px', fontFamily: "'Orbitron',var(--font)", color: CYBER.a, fontWeight: 700, fontSize: '15px' }}>{player.kills * 100}</div>
                    <div style={{ width: '64px', textAlign: 'center', padding: '13px 8px' }}>
                      <PingLabel ping={null} />
                    </div>
                  </div>
                ))}
              </div>
            </CyberPanel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
