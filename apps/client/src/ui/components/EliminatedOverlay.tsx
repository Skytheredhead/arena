import { useEffect, useState } from 'react';
import { CYBER, CyberButton, CyberGlitchText, CyberPanel } from '../cyberTheme';

interface EliminatedOverlayProps {
  visible: boolean;
  killerNickname: string | null;
  respawnSeconds: number;
  respawnAvailable: boolean;
  onRespawn: () => void;
}

export function EliminatedOverlay({
  visible,
  killerNickname,
  respawnSeconds,
  respawnAvailable,
  onRespawn
}: EliminatedOverlayProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      // slight delay so the animation plays clean each time
      const id = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(id);
    } else {
      setMounted(false);
    }
  }, [visible]);

  if (!visible) return null;

  const circumference = 2 * Math.PI * 44;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at center,rgba(60,8,16,0.5) 0%,rgba(5,8,14,0.88) 60%,rgba(2,6,12,0.96) 100%)',
        backdropFilter: 'blur(5px)',
        animation: 'cyberFadeIn .3s ease both',
      }}
    >
      {/* Red pulsing vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at center,transparent 20%,${CYBER.danger}44 100%)`,
          animation: 'cyberRedFlash 1.4s ease-in-out infinite',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative', zIndex: 2, textAlign: 'center',
          animation: mounted ? 'cyberShake .45s ease both, cyberFadeUp .4s ease both' : undefined,
        }}
      >
        {/* ELIMINATED heading */}
        <div style={{ marginBottom: '28px' }}>
          <CyberGlitchText size={52} style={{ letterSpacing: '4px' }}>ELIMINATED</CyberGlitchText>
        </div>

        {/* Panel */}
        <div className="cyber-scale-in" style={{ animationDelay: '.15s' }}>
          <CyberPanel style={{
            width: 'min(460px,92vw)',
            padding: '28px 32px 24px',
            textAlign: 'center',
            boxShadow: `0 0 40px ${CYBER.danger}22, 0 0 80px ${CYBER.danger}0a`,
            border: `1px solid ${CYBER.danger}55`,
            background: `rgba(30,6,10,0.72)`,
          }}>
            {/* SVG ring countdown decoration */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="90" height="90" viewBox="0 0 100 100">
                  {/* Background ring */}
                  <circle cx="50" cy="50" r="44" fill="none" stroke={`${CYBER.danger}22`} strokeWidth="2" />
                  {/* Spinning dashed ring */}
                  <circle
                    cx="50" cy="50" r="44"
                    fill="none"
                    stroke={CYBER.danger}
                    strokeWidth="2"
                    strokeDasharray={`${circumference * 0.12} ${circumference * 0.88}`}
                    strokeLinecap="round"
                    style={{
                      transformOrigin: '50% 50%',
                      animation: 'cyberSpin 2s linear infinite',
                    }}
                  />
                  {/* Inner ring */}
                  <circle cx="50" cy="50" r="34" fill="none" stroke={`${CYBER.danger}18`} strokeWidth="1" />
                </svg>
                <div style={{
                  position: 'absolute',
                  fontFamily: "'Orbitron',var(--font)",
                  color: CYBER.danger,
                  fontSize: '22px', fontWeight: 900,
                  textShadow: `0 0 14px ${CYBER.danger}`,
                  lineHeight: 1,
                  animation: 'cyberPulse 1.2s ease-in-out infinite',
                }}>
                  {respawnAvailable ? '✓' : Math.max(0, Math.ceil(respawnSeconds))}
                </div>
              </div>
            </div>

            {/* Sub-text */}
            <div style={{
              color: CYBER.textDim, fontFamily: CYBER.font,
              fontSize: '10px', letterSpacing: '3px', marginBottom: '22px',
              lineHeight: 1.6,
            }}>
              {killerNickname
                ? `ELIMINATED BY ${killerNickname.toUpperCase()}`
                : 'COMBAT SYSTEMS OFFLINE'}
              <br />
              {respawnAvailable
                ? 'RE-ENTRY AUTHORIZED'
                : 'RECONSTRUCTING OPERATOR'}
            </div>

            {/* Respawn button */}
            <CyberButton
              primary full onClick={onRespawn}
              disabled={!respawnAvailable}
              style={{
                fontSize: '13px', padding: '13px 24px',
                boxShadow: `0 0 20px ${CYBER.a}44`,
                animation: 'cyberFadeUp .35s .3s ease both',
              }}
            >
              {respawnAvailable ? 'Respawn' : 'Respawn Locked'}
            </CyberButton>
          </CyberPanel>
        </div>
      </div>
    </div>
  );
}
