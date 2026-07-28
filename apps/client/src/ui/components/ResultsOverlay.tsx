import type { ScoreRow } from '../models';
import {
  CYBER,
  CyberGlitchText,
  CyberPanel,
  CyberSegBar,
} from '../cyberTheme';

interface ResultsOverlayProps {
  visible: boolean;
  winnerNickname: string | null;
  standings: Array<ScoreRow & { kdr: number; pingMs: number | null }>;
  localIdentity: string | null;
  nextMatchSeconds: number;
}

export function ResultsOverlay({
  visible,
  winnerNickname,
  standings,
  localIdentity,
  nextMatchSeconds,
}: ResultsOverlayProps): React.JSX.Element | null {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background:
          'radial-gradient(circle at center,rgba(0,245,255,.12),rgba(2,8,15,.94) 62%)',
        backdropFilter: 'blur(8px)',
        animation: 'cyberFadeIn .3s ease both',
      }}
    >
      <CyberPanel
        style={{
          width: 'min(760px,96vw)',
          maxHeight: '90vh',
          overflow: 'hidden',
          padding: '26px',
          boxShadow: `0 0 60px ${CYBER.a}22`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div
            style={{
              color: CYBER.textDim,
              fontFamily: CYBER.font,
              fontSize: '9px',
              letterSpacing: '5px',
              marginBottom: '8px',
            }}
          >
            // MATCH COMPLETE //
          </div>
          <CyberGlitchText size={44}>
            {winnerNickname?.toUpperCase() ?? 'NO WINNER'}
          </CyberGlitchText>
          <div
            style={{
              color: CYBER.ok,
              fontFamily: CYBER.font,
              fontSize: '10px',
              letterSpacing: '4px',
              marginTop: '8px',
            }}
          >
            ARENA VICTOR
          </div>
        </div>

        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {standings.map((row, index) => {
            const isLocal = row.identity === localIdentity;
            return (
              <div
                key={row.identity}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '38px minmax(0,1fr) 74px 74px 86px',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderBottom: `1px solid ${CYBER.border}`,
                  background: isLocal ? `${CYBER.a}10` : 'transparent',
                  boxShadow: isLocal ? `inset 3px 0 0 ${CYBER.a}` : undefined,
                  fontFamily: CYBER.font,
                }}
              >
                <span style={{ color: CYBER.textDim }}>{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: isLocal ? CYBER.textBright : CYBER.text,
                      letterSpacing: '1px',
                    }}
                  >
                    {row.nickname}
                    {row.isBot ? ' · BOT' : ''}
                  </div>
                  <CyberSegBar
                    value={row.kills}
                    max={30}
                    color={index === 0 ? CYBER.ok : CYBER.a}
                    height={2}
                    segments={10}
                  />
                </div>
                <span style={{ color: CYBER.ok, textAlign: 'center' }}>
                  {row.kills} K
                </span>
                <span style={{ color: CYBER.danger, textAlign: 'center' }}>
                  {row.deaths} D
                </span>
                <span style={{ color: CYBER.a, textAlign: 'right' }}>
                  {row.kdr.toFixed(2)} KDR
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: '18px',
            color: CYBER.textBright,
            textAlign: 'center',
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '3px',
          }}
        >
          NEXT MATCH IN {Math.max(0, Math.ceil(nextMatchSeconds))}S
        </div>
      </CyberPanel>
    </div>
  );
}
