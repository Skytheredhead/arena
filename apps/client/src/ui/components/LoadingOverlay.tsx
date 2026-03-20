import { useEffect, useRef, useState } from 'react';
import {
  CYBER,
  CyberButton,
  CyberGlitchText,
  CyberHexBg,
  CyberLoadingSpinner
} from '../cyberTheme';

interface LoadingOverlayProps {
  visible: boolean;
  roomCode: string;
  connectionError: string | null;
  onCancel: () => void;
}

const PHASES = [
  'INITIALIZING CONNECTION',
  'AUTHENTICATING OPERATOR',
  'LOCATING ROOM',
  'JOINING ARENA',
  'SYNCHRONIZING STATE',
  'ENTERING MATCH',
] as const;

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.:';

function useScrambleText(target: string, active: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) { setDisplay(target); return; }
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      if (frame > target.length + 8) {
        setDisplay(target);
        clearInterval(id);
        return;
      }
      setDisplay(
        target
          .split('')
          .map((ch, i) => {
            if (i < frame - 8) return ch;
            if (i <= frame) return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            return '\u00A0';
          })
          .join('')
      );
    }, 38);
    return () => clearInterval(id);
  }, [target, active]);

  return display;
}

export function LoadingOverlay({
  visible,
  roomCode,
  connectionError,
  onCancel,
}: LoadingOverlayProps): React.JSX.Element | null {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Advance phases on a timer while visible
  useEffect(() => {
    if (!visible) {
      setPhase(0);
      setElapsed(0);
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const iv = setInterval(() => {
      const t = Date.now() - (startRef.current ?? Date.now());
      setElapsed(t);
      // Phase thresholds (ms)
      const thresholds = [0, 600, 1400, 2300, 3400, 4800] as const;
      let p = 0;
      for (let i = thresholds.length - 1; i >= 0; i--) {
        const threshold = thresholds[i] ?? Number.POSITIVE_INFINITY;
        if (t >= threshold) { p = i; break; }
      }
      setPhase(Math.min(p, PHASES.length - 1));
    }, 120);
    return () => clearInterval(iv);
  }, [visible]);

  const currentLabel = PHASES[phase] ?? PHASES[0];
  const scrambled = useScrambleText(currentLabel, visible);
  const progress = Math.min(100, Math.round((phase / (PHASES.length - 1)) * 100));

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: CYBER.bg, overflow: 'hidden',
        animation: 'cyberFadeIn .3s ease both',
      }}
    >
      <CyberHexBg />

      {/* Extra dense data streams for loading */}
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            left: `${(i + 0.5) * 10}%`,
            top: 0,
            width: '1px',
            height: '180px',
            background: `linear-gradient(transparent,${i % 2 === 0 ? CYBER.a : CYBER.a2}55,transparent)`,
            animationName: 'cyberDataStream',
            animationDuration: `${3.5 + i * 0.8}s`,
            animationDelay: `${i * 0.28}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            opacity: 0,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ))}

      <div
        style={{
          position: 'relative', zIndex: 2,
          textAlign: 'center', width: 'min(520px,92vw)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '44px', animation: 'cyberFadeUp .5s ease both' }}>
          <CyberGlitchText size={72}>ARENA</CyberGlitchText>
        </div>

        {/* Spinner */}
        <div style={{ marginBottom: '32px', animation: 'cyberFadeIn .4s .2s ease both' }}>
          <CyberLoadingSpinner size={72} />
        </div>

        {/* Scrambling status text */}
        <div style={{
          fontFamily: "'Orbitron',var(--font)",
          color: CYBER.textBright,
          fontSize: '13px', letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '28px',
          minHeight: '22px',
          textShadow: `0 0 14px ${CYBER.a}66`,
          animation: 'cyberFadeIn .4s .3s ease both',
        }}>
          {connectionError ? (
            <span style={{ color: CYBER.danger, textShadow: `0 0 12px ${CYBER.danger}88` }}>
              ⚠ {connectionError}
            </span>
          ) : (
            <>
              {scrambled}
              <span
                className="cyber-blink"
                style={{ color: CYBER.a, marginLeft: '4px' }}
              >
                █
              </span>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', marginBottom: '12px',
          animation: 'cyberFadeIn .4s .35s ease both',
        }}>
          <div style={{ height: '3px', background: `${CYBER.textDim}22`, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: connectionError ? '0%' : `${progress}%`,
              background: connectionError
                ? CYBER.danger
                : `linear-gradient(90deg,${CYBER.a3},${CYBER.a})`,
              boxShadow: `0 0 10px ${connectionError ? CYBER.danger : CYBER.a}`,
              transition: 'width .7s cubic-bezier(.16,1,.3,1)',
            }} />
            {/* Shimmer */}
            {!connectionError && (
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `linear-gradient(90deg,transparent,${CYBER.textBright}44,transparent)`,
                backgroundSize: '200% 100%',
                animation: 'cyberShimmer 1.4s linear infinite',
              }} />
            )}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontFamily: CYBER.font, fontSize: '9px', letterSpacing: '2px',
            color: CYBER.textDim, marginTop: '6px',
          }}>
            <span>ROOM {roomCode || '—'}</span>
            <span style={{ color: CYBER.a, fontFamily: "'Orbitron',var(--font)" }}>
              {connectionError ? 'FAILED' : `${progress}%`}
            </span>
          </div>
        </div>

        {/* Phase step list */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '6px',
          alignItems: 'flex-start', width: '100%',
          padding: '0 48px',
          marginBottom: '28px',
          animation: 'cyberFadeIn .4s .4s ease both',
        }}>
          {PHASES.map((ph, i) => (
            <div
              key={ph}
              style={{
                display: 'flex', gap: '12px', alignItems: 'center',
                fontFamily: CYBER.font, fontSize: '11px',
                opacity: i <= phase ? 1 : 0.22,
                transition: 'opacity .4s ease',
              }}
            >
              <span style={{
                fontSize: '13px',
                color: i < phase ? CYBER.ok : i === phase ? CYBER.a : CYBER.textDim,
                textShadow: i === phase ? `0 0 8px ${CYBER.a}` : i < phase ? `0 0 6px ${CYBER.ok}` : 'none',
                animation: i === phase ? 'cyberPulse 1s infinite' : undefined,
                transition: 'color .3s',
              }}>
                {i < phase ? '✓' : i === phase ? '▶' : '○'}
              </span>
              <span style={{
                color: i === phase ? CYBER.textBright : i < phase ? CYBER.ok : CYBER.textDim,
                letterSpacing: '2px',
                transition: 'color .3s',
              }}>
                {ph}
              </span>
            </div>
          ))}
        </div>

        {/* Cancel */}
        <div style={{ animation: 'cyberFadeIn .4s .5s ease both' }}>
          <CyberButton small onClick={onCancel}>
            Cancel
          </CyberButton>
        </div>

        {/* Elapsed time */}
        {!connectionError && (
          <div style={{
            marginTop: '16px',
            fontFamily: CYBER.font, fontSize: '9px',
            color: CYBER.textDim, letterSpacing: '2px',
            animation: 'cyberFadeIn .4s .6s ease both',
          }}>
            {(elapsed / 1000).toFixed(1)}s elapsed
          </div>
        )}
      </div>
    </div>
  );
}
