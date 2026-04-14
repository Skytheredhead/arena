import { useEffect, useRef, useState } from 'react';
import {
  CYBER,
  CyberButton,
  CyberGlitchText,
  CyberHexBg,
  CyberLoadingSpinner
} from '../cyberTheme';
import {
  CONNECTION_STAGE_DETAIL,
  CONNECTION_STAGE_LABEL,
  CONNECTION_STAGE_SEQUENCE,
  getConnectionStageIndex,
  type ConnectionStage
} from '../../netcode/connectionProgress';

interface LoadingOverlayProps {
  visible: boolean;
  stage: ConnectionStage;
  roomCode: string;
  connectionError: string | null;
  onCancel: () => void;
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.:';

function useScrambleText(target: string, active: boolean): string {
  const [display, setDisplay] = useState(target);

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
  stage,
  roomCode,
  connectionError,
  onCancel,
}: LoadingOverlayProps): React.JSX.Element | null {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setPhase(0);
      setElapsed(0);
      startRef.current = null;
      if (advanceTimerRef.current != null) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      return;
    }
    if (startRef.current == null) {
      startRef.current = Date.now();
    }
    const iv = setInterval(() => {
      const t = Date.now() - (startRef.current ?? Date.now());
      setElapsed(t);
    }, 120);
    return () => clearInterval(iv);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const targetPhase = Math.max(0, getConnectionStageIndex(stage));
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (phase >= targetPhase) {
      if (phase !== targetPhase) {
        setPhase(targetPhase);
      }
      return;
    }
    advanceTimerRef.current = window.setTimeout(() => {
      setPhase(current => Math.min(targetPhase, current + 1));
      advanceTimerRef.current = null;
    }, 220);
    return () => {
      if (advanceTimerRef.current != null) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [phase, stage, visible]);

  const fallbackStage = CONNECTION_STAGE_SEQUENCE[0] ?? 'preparing';
  const currentStage = CONNECTION_STAGE_SEQUENCE[phase] ?? fallbackStage;
  const currentLabel = CONNECTION_STAGE_LABEL[currentStage];
  const scrambled = useScrambleText(currentLabel, visible);
  const progress = connectionError
    ? 0
    : Math.min(
        100,
        Math.round(
          (getConnectionStageIndex(stage) / (CONNECTION_STAGE_SEQUENCE.length - 1)) * 100
        )
      );

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

        <div
          style={{
            color: CYBER.textDim,
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '1.6px',
            marginBottom: '20px',
            minHeight: '16px',
            opacity: 0.88,
            animation: 'cyberFadeIn .4s .32s ease both'
          }}
        >
          {connectionError ? 'Connection interrupted. Cancel to retry.' : CONNECTION_STAGE_DETAIL[currentStage]}
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
          {CONNECTION_STAGE_SEQUENCE.map((phaseStage, i) => {
            const safePhaseStage = phaseStage ?? fallbackStage;
            return (
            <div
              key={safePhaseStage}
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
                {CONNECTION_STAGE_LABEL[safePhaseStage]}
              </span>
            </div>
            );
          })}
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
