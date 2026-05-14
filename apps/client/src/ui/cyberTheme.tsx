import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  getRuntimeHudFrame,
  subscribeRuntimeHudFrame,
  type RuntimeHudFrame,
} from './runtimeHudFrame';

export const CYBER = {
  bg: '#020b14',
  panel: 'rgba(0,245,255,0.04)',
  border: 'rgba(0,245,255,0.22)',
  borderHi: '#00f5ff',
  a: '#00f5ff',
  a2: '#ff0090',
  a3: '#7000ff',
  warn: '#ffcc00',
  danger: '#ff2244',
  ok: '#00ff88',
  text: '#7ab8d0',
  textBright: '#d0f4ff',
  textDim: '#1e4860',
  font: "'Courier New', Courier, monospace"
} as const;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

  .cyber-root {
    --a: ${CYBER.a};
    --a2: ${CYBER.a2};
    --a3: ${CYBER.a3};
    --ok: ${CYBER.ok};
    --warn: ${CYBER.warn};
    --danger: ${CYBER.danger};
    --bg: ${CYBER.bg};
    --panel: ${CYBER.panel};
    --border: ${CYBER.border};
    --borderHi: ${CYBER.borderHi};
    --text: ${CYBER.text};
    --textBright: ${CYBER.textBright};
    --textDim: ${CYBER.textDim};
    --font: ${CYBER.font};
    --fontDisplay: 'Orbitron', ${CYBER.font};
    color: var(--text);
    font-family: var(--font);
  }

  .cyber-root *, .cyber-root *::before, .cyber-root *::after { box-sizing: border-box; }

  /* ── ENTRANCE ── */
  @keyframes cyberFadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cyberFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes cyberSlideLeft {
    from { opacity: 0; transform: translateX(-24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes cyberSlideRight {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes cyberScaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* ── AMBIENT ── */
  @keyframes cyberPulse {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.35; }
  }
  @keyframes cyberBlink {
    0%,49%  { opacity: 1; }
    50%,100%{ opacity: 0; }
  }
  @keyframes cyberBorderPulse {
    0%,100% { box-shadow: 0 0 0 0 transparent, inset 0 0 0 0 transparent; }
    50%     { box-shadow: 0 0 12px 1px rgba(0,245,255,0.27), inset 0 0 8px 0 rgba(0,245,255,0.07); }
  }
  @keyframes cyberBorderGlow {
    0%,100% { box-shadow: 0 0 6px rgba(0,245,255,0.35); }
    50%     { box-shadow: 0 0 18px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.2); }
  }
  @keyframes cyberShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes cyberGridScroll {
    from { transform: perspective(600px) rotateX(72deg) translateY(0); }
    to   { transform: perspective(600px) rotateX(72deg) translateY(60px); }
  }
  @keyframes cyberFloatY {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-6px); }
  }
  @keyframes cyberSpin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes cyberRadarSweep {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes cyberHexRotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── DAMAGE / COMBAT ── */
  @keyframes cyberDamageFlash {
    0%   { opacity: 0; }
    12%  { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes cyberRedFlash {
    0%,100% { opacity: 0.28; }
    50%     { opacity: 0.72; }
  }
  @keyframes cyberShake {
    0%,100% { transform: translate(0,0); }
    20%     { transform: translate(-4px, 2px); }
    40%     { transform: translate(4px, -2px); }
    60%     { transform: translate(-3px, 3px); }
    80%     { transform: translate(3px, -1px); }
  }

  /* ── GLITCH ── */
  @keyframes cyberGlitch1 {
    0%,93%  { clip-path: inset(0 0 100% 0); transform: translate(0); }
    94%     { clip-path: inset(28% 0 52% 0); transform: translate(-3px, 1px); }
    95.5%   { clip-path: inset(62% 0 18% 0); transform: translate(3px, -1px); }
    97%     { clip-path: inset(8% 0 82% 0);  transform: translate(-2px, 2px); }
    100%    { clip-path: inset(0 0 100% 0); transform: translate(0); }
  }
  @keyframes cyberGlitch2 {
    0%,93%  { clip-path: inset(100% 0 0 0); transform: translate(0); opacity: 0; }
    94%     { clip-path: inset(52% 0 8%  0); transform: translate(3px,-1px); opacity: 0.8; color: ${CYBER.a3}; }
    95.5%   { clip-path: inset(18% 0 62% 0); transform: translate(-3px,1px); opacity: 0.8; }
    97%     { clip-path: inset(72% 0 4%  0); transform: translate(2px,-2px); opacity: 0.8; }
    100%    { clip-path: inset(100% 0 0 0); transform: translate(0); opacity: 0; }
  }

  /* ── DATA / PARTICLES ── */
  @keyframes cyberParticleDrift {
    0%   { transform: translateY(0) translateX(0); opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    100% { transform: translateY(-110px) translateX(var(--pdx, 12px)); opacity: 0; }
  }
  @keyframes cyberDataStream {
    0%   { transform: translateY(-100%); opacity: 0; }
    5%   { opacity: 0.55; }
    92%  { opacity: 0.55; }
    100% { transform: translateY(110vh); opacity: 0; }
  }

  /* ── BARS / PROGRESS ── */
  @keyframes cyberFillBar {
    from { width: 0; }
  }
  @keyframes cyberXpFill {
    from { width: 0%; }
    to   { width: 68%; }
  }
  @keyframes cyberProgressShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }

  /* ── NUMBERS ── */
  @keyframes cyberNumberTick {
    from { opacity: 0; transform: translateY(40%); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── SCAN ── */
  @keyframes cyberScanSweep {
    0%   { top: -4px; opacity: 0; }
    4%   { opacity: 0.55; }
    96%  { opacity: 0.55; }
    100% { top: 100%; opacity: 0; }
  }

  /* ── UTILITY CLASSES ── */
  .cyber-fade-up   { animation: cyberFadeUp   .4s cubic-bezier(.16,1,.3,1) both; }
  .cyber-fade-in   { animation: cyberFadeIn   .3s ease both; }
  .cyber-slide-left  { animation: cyberSlideLeft  .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-slide-right { animation: cyberSlideRight .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-scale-in  { animation: cyberScaleIn  .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-blink     { animation: cyberBlink    1s step-start infinite; }
  .cyber-pulse     { animation: cyberPulse    2s ease-in-out infinite; }
  .cyber-shake     { animation: cyberShake    .45s ease both; }
  .cyber-spin      { animation: cyberSpin     1.4s linear infinite; }
  .cyber-float-y   { animation: cyberFloatY   3s ease-in-out infinite; }

  /* ── BUTTON ── */
  .cyber-btn {
    font-family: var(--fontDisplay);
    cursor: pointer;
    border: 1px solid rgba(0,245,255,0.53);
    background: transparent;
    color: var(--a);
    padding: 10px 24px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    position: relative;
    overflow: hidden;
    transition: color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }
  .cyber-btn::before {
    content: '';
    position: absolute; inset: 0;
    background: var(--a);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.25s cubic-bezier(.16,1,.3,1);
    z-index: 0;
  }
  .cyber-btn:hover::before { transform: scaleX(1); }
  .cyber-btn:hover { color: #000; border-color: var(--a); box-shadow: 0 0 20px rgba(0,245,255,0.53); }
  .cyber-btn:active { transform: scale(0.97); }
  .cyber-btn:disabled { cursor: not-allowed; opacity: 0.4; pointer-events: none; }
  .cyber-btn span { position: relative; z-index: 1; }
  .cyber-btn-primary { background: rgba(0,245,255,0.13); border-color: var(--a); box-shadow: 0 0 10px rgba(0,245,255,0.27); }
  .cyber-btn-danger  { border-color: rgba(255,34,68,0.53); color: var(--danger); }
  .cyber-btn-danger::before { background: var(--danger); }
  .cyber-btn-danger:hover { color: #fff; border-color: var(--danger); box-shadow: 0 0 20px rgba(255,34,68,0.53); }
  .cyber-btn-warn   { border-color: rgba(255,204,0,0.53); color: var(--warn); }
  .cyber-btn-warn::before { background: var(--warn); }
  .cyber-btn-warn:hover { color: #000; border-color: var(--warn); box-shadow: 0 0 20px rgba(255,204,0,0.53); }
  .cyber-btn-sm   { padding: 6px 14px; font-size: 10px; }
  .cyber-btn-full { width: 100%; display: block; text-align: center; }

  /* ── INPUT ── */
  .cyber-input {
    font-family: var(--font);
    background: rgba(0,245,255,0.04);
    border: 1px solid var(--border);
    color: var(--textBright);
    padding: 10px 14px;
    font-size: 13px;
    letter-spacing: 1px;
    width: 100%;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }
  .cyber-input:focus {
    border-color: var(--a);
    background: rgba(0,245,255,0.08);
    box-shadow: 0 0 16px rgba(0,245,255,0.27), inset 0 0 8px rgba(0,245,255,0.07);
  }
  .cyber-input::placeholder { color: var(--textDim); }

  /* ── PANEL ── */
  .cyber-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    position: relative;
    animation: cyberBorderPulse 4s ease-in-out infinite;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  }
  .cyber-panel::before,
  .cyber-panel::after {
    content: '';
    position: absolute;
    width: 12px; height: 12px;
    border-color: var(--a); border-style: solid;
  }
  .cyber-panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
  .cyber-panel::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

  /* ── LABEL ── */
  .cyber-label {
    font-family: var(--font);
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--textDim);
    margin-bottom: 6px;
  }

  /* ── GLOBAL FX ── */
  .cyber-scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 45;
    background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px);
  }
  .cyber-scan-sweep {
    position: fixed; left: 0; right: 0; height: 3px;
    pointer-events: none; z-index: 44;
    background: linear-gradient(90deg, transparent, rgba(0,245,255,0.38), transparent);
    animation: cyberScanSweep 7s linear infinite;
  }
`;

/* ─────────────────────────────────────────────────────────── */

export function CyberGlobalStyles(): React.JSX.Element {
  return <style>{CSS}</style>;
}

export function CyberScanFx({ showSweep = true }: { showSweep?: boolean }): React.JSX.Element {
  return (
    <>
      <div className="cyber-scanlines" />
      {showSweep ? <div className="cyber-scan-sweep" /> : null}
    </>
  );
}

/* Enhanced HexBg with particles + data streams */
export function CyberHexBg(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}
    >
      {/* Perspective grid */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
          backgroundImage:
            'linear-gradient(rgba(0,245,255,0.09) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.07) 1px,transparent 1px)',
          backgroundSize: '50px 50px',
          animation: 'cyberGridScroll 3s linear infinite',
          transform: 'perspective(600px) rotateX(72deg)',
          transformOrigin: 'bottom',
          opacity: 0.55
        }}
      />
      {/* Top glow */}
      <div style={{ position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:'80%',height:'50%',
        background:'radial-gradient(ellipse at 50% 0%,rgba(0,245,255,0.06) 0%,transparent 70%)' }} />
      <div style={{ position:'absolute',top:0,left:0,width:'40%',height:'40%',
        background:'radial-gradient(ellipse at 0% 0%,rgba(0,245,255,0.05) 0%,transparent 60%)' }} />
      <div style={{ position:'absolute',bottom:0,right:0,width:'30%',height:'30%',
        background:'radial-gradient(ellipse at 100% 100%,rgba(255,0,144,0.05) 0%,transparent 60%)' }} />

      {/* Floating particles */}
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${5 + i * 5.8}%`,
          bottom: `${10 + ((i * 37) % 60)}%`,
          width: '2px', height: '2px',
          borderRadius: '50%',
          background: i % 3 === 0 ? CYBER.a : i % 3 === 1 ? CYBER.a2 : CYBER.a3,
          opacity: 0,
          animationName: 'cyberParticleDrift',
          animationDuration: `${4 + i * 0.65}s`,
          animationDelay: `${i * 0.38}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          ['--pdx' as string]: `${(i % 5 - 2) * 14}px`,
        }} />
      ))}

      {/* Vertical data streams */}
      {[8, 22, 39, 55, 70, 86].map((left, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${left}%`, top: 0,
          width: '1px', height: '150px',
          background: `linear-gradient(transparent,${i % 2 === 0 ? CYBER.a : CYBER.a2}55,transparent)`,
          animationName: 'cyberDataStream',
          animationDuration: `${4.5 + i * 1.1}s`,
          animationDelay: `${i * 0.7}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          opacity: 0,
        }} />
      ))}
    </div>
  );
}

/* Glitch text — ARENA-style dual-layer clip-path glitch */
export function CyberGlitchText({
  children,
  size = 48,
  style = {}
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
}): React.JSX.Element {
  const baseStyle: CSSProperties = {
    fontFamily: "'Orbitron',var(--font)",
    fontSize: `${size}px`,
    fontWeight: 900,
    color: CYBER.a,
    letterSpacing: `${Math.max(2, size / 24)}px`,
    lineHeight: 1,
    textShadow: `0 0 30px ${CYBER.a}, 0 0 60px ${CYBER.a}44`,
  };
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <div style={baseStyle}>{children}</div>
      <div aria-hidden style={{ position:'absolute',inset:0,...baseStyle,color:CYBER.a2,textShadow:`2px 0 ${CYBER.a2}`,animation:'cyberGlitch1 5s step-start infinite' }}>{children}</div>
      <div aria-hidden style={{ position:'absolute',inset:0,...baseStyle,color:CYBER.a3,textShadow:`-2px 0 ${CYBER.a3}`,animation:'cyberGlitch2 5s step-start infinite' }}>{children}</div>
    </div>
  );
}

/* Counting animated number */
export function CyberAnimNumber({
  target,
  duration = 1100,
  color = CYBER.a,
  size = 28,
  decimals = 0,
  style = {}
}: {
  target: number;
  duration?: number;
  color?: string;
  size?: number;
  decimals?: number;
  style?: CSSProperties;
}): React.JSX.Element {
  const [val, setVal] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const start = Date.now();
    const tick = (): void => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(target * ease);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return (
    <span style={{
      fontFamily: "'Orbitron',var(--font)",
      color,
      fontSize: `${size}px`,
      fontWeight: 700,
      textShadow: `0 0 12px ${color}88`,
      ...style
    }}>
      {decimals > 0 ? val.toFixed(decimals) : Math.round(val)}
    </span>
  );
}

/* Segmented HP/shield bar with per-segment fill animation */
export function CyberSegBar({
  value,
  max = 100,
  color,
  height = 6,
  segments = 4
}: {
  value: number;
  max?: number;
  color: string;
  height?: number;
  segments?: number;
}): React.JSX.Element {
  const perSeg = max / segments;
  return (
    <div style={{ display: 'flex', gap: '2px', height: `${height}px` }}>
      {Array.from({ length: segments }, (_, i) => {
        const segStart = i * perSeg;
        const segEnd = (i + 1) * perSeg;
        const pct = value >= segEnd ? 100 : value > segStart ? ((value - segStart) / perSeg) * 100 : 0;
        return (
          <div key={i} style={{ flex: 1, background: `${CYBER.textDim}33`, position: 'relative', overflow: 'hidden' }}>
            {pct > 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                width: `${pct}%`,
                background: color,
                boxShadow: `0 0 6px ${color}`,
                animationName: 'cyberFillBar',
                animationDuration: '.65s',
                animationTimingFunction: 'cubic-bezier(.16,1,.3,1)',
                animationDelay: `${i * 0.07}s`,
                animationFillMode: 'both',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Simple continuous bar (for sliders / progress) */
export function CyberBar({
  value,
  max = 100,
  color,
  height = 6
}: {
  value: number;
  max?: number;
  color: string;
  height?: number;
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ height: `${height}px`, background: `${CYBER.textDim}55`, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        width: `${pct}%`,
        background: color,
        boxShadow: `0 0 8px ${color}`,
        transition: 'width 0.4s cubic-bezier(.16,1,.3,1)',
      }} />
    </div>
  );
}

/* Loading hex spinner */
export function CyberLoadingSpinner({ size = 64, label }: { size?: number; label?: string }): React.JSX.Element {
  const r = size * 0.42;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${size / 2 + r * Math.cos(a)},${size / 2 + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="cyber-spin">
        <polygon points={pts} fill="none" stroke={`${CYBER.a}33`} strokeWidth="1" />
        <polygon points={pts} fill="none" stroke={CYBER.a} strokeWidth="2" strokeDasharray="6 6" />
      </svg>
      {label != null && (
        <div style={{ fontFamily: "'Orbitron',var(--font)", color: CYBER.a, fontSize: '10px', fontWeight: 700, letterSpacing: '3px', textShadow: `0 0 10px ${CYBER.a}88` }}>
          {label}
        </div>
      )}
    </div>
  );
}

/* CyberLine with moving shimmer dot */
export function CyberLine({ margin = '14px 0' }: { margin?: string }): React.JSX.Element {
  return (
    <div style={{ position: 'relative', margin, height: '1px', background: CYBER.border, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: '-1px', left: '-10%',
        width: '20%', height: '3px',
        background: 'linear-gradient(90deg,transparent,var(--a),transparent)',
        animation: 'cyberShimmer 2.5s linear infinite',
        backgroundSize: '200% 100%',
      }} />
    </div>
  );
}

/* CyberPanel */
export function CyberPanel({
  children,
  className,
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}): React.JSX.Element {
  return (
    <div className={`cyber-panel ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

/* CyberButton */
export function CyberButton({
  children,
  onClick,
  primary,
  danger,
  warn,
  small,
  full,
  disabled,
  style,
  type = 'button'
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  warn?: boolean;
  small?: boolean;
  full?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}): React.JSX.Element {
  const classes = [
    'cyber-btn',
    primary ? 'cyber-btn-primary' : '',
    danger  ? 'cyber-btn-danger'  : '',
    warn    ? 'cyber-btn-warn'    : '',
    small   ? 'cyber-btn-sm'      : '',
    full    ? 'cyber-btn-full'    : '',
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} style={style}>
      <span>{children}</span>
    </button>
  );
}

/* Ping label with signal bars */
const pingColor = (ping: number | null, jitter: number | null): string => {
  if (jitter != null) {
    if (jitter > 40) return CYBER.danger;
    if (jitter > 24) return CYBER.warn;
    return CYBER.ok;
  }
  if (ping == null) return CYBER.textDim;
  if (ping < 70)  return CYBER.ok;
  if (ping < 140) return CYBER.warn;
  return CYBER.danger;
};

export function PingLabel({
  ping,
  jitter,
  showNerd,
  pingLowMs,
  serverPipelineMs,
  serverPipelineLowMs
}: {
  ping: number | null;
  jitter?: number | null;
  showNerd?: boolean;
  pingLowMs?: number | null;
  serverPipelineMs?: number | null;
  serverPipelineLowMs?: number | null;
}): React.JSX.Element {
  const color = pingColor(ping, jitter ?? null);
  const formatMs = (value: number | null | undefined): string =>
    value == null ? 'N/A' : `${Math.round(value)}ms`;
  return (
    <span style={{ color, fontSize: '11px', fontFamily: CYBER.font, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '1px', height: '9px' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} style={{
            width: '2px',
            height: `${3 + i * 2}px`,
            background: color,
            opacity: ping == null ? 0.25
              : i <= Math.max(0, Math.min(3, Math.round(4 - Math.min(400, ping) / 100)))
                ? 0.95 : 0.22,
            transition: 'opacity 0.3s',
          }} />
        ))}
      </span>
      {showNerd ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', letterSpacing: '0.8px' }}>
          <span>{formatMs(ping)}</span>
          <span>{formatMs(pingLowMs ?? null)}</span>
          <span>{formatMs(serverPipelineMs ?? null)}</span>
          <span>{formatMs(serverPipelineLowMs ?? null)}</span>
        </span>
      ) : (
        <span>{formatMs(ping)}</span>
      )}
    </span>
  );
}

/* Crosshair — dynamic spread, hitmarker */
export function CyberCrosshair({
  hitmarkerVisible,
  scoped
}: {
  hitmarkerVisible: boolean;
  scoped: boolean;
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () =>
      subscribeRuntimeHudFrame((frame: RuntimeHudFrame) => {
        const root = rootRef.current;
        if (!root) return;
        const clamped = Math.max(0, Math.min(16, frame.crosshairSpread));
        const offset = scoped ? 5 + clamped * 0.45 : 7 + clamped;
        const armLen = scoped ? 6 : 8;
        root.style.setProperty('--crosshair-offset', `${offset}px`);
        root.style.setProperty('--crosshair-arm-len', `${armLen}px`);
      }),
    [scoped]
  );
  const initialFrame = getRuntimeHudFrame();
  const initialClamped = Math.max(
    0,
    Math.min(16, initialFrame.crosshairSpread)
  );
  const initialOffset = scoped ? 5 + initialClamped * 0.45 : 7 + initialClamped;
  const initialArmLen = scoped ? 6 : 8;
  const arm = (style: CSSProperties): React.JSX.Element => (
    <div style={{ position:'absolute', background: CYBER.a, boxShadow: `0 0 4px ${CYBER.a}`, ...style }} />
  );
  return (
    <div
      ref={rootRef}
      style={{
        position:'absolute',
        left:'50%',
        top:'50%',
        transform:'translate(-50%,-50%)',
        zIndex:20,
        pointerEvents:'none',
        '--crosshair-offset': `${initialOffset}px`,
        '--crosshair-arm-len': `${initialArmLen}px`,
      } as CSSProperties}
    >
      <div style={{ position:'relative',width:'44px',height:'44px' }}>
        {arm({ left:'50%', top:'calc(50% - var(--crosshair-offset) - var(--crosshair-arm-len))', width:'1px', height:'var(--crosshair-arm-len)', transform:'translateX(-50%)' })}
        {arm({ left:'50%', top:'calc(50% + var(--crosshair-offset))',               width:'1px', height:'var(--crosshair-arm-len)', transform:'translateX(-50%)' })}
        {arm({ top:'50%',  left:'calc(50% - var(--crosshair-offset) - var(--crosshair-arm-len))', width:'var(--crosshair-arm-len)', height:'1px', transform:'translateY(-50%)' })}
        {arm({ top:'50%',  left:'calc(50% + var(--crosshair-offset))',               width:'var(--crosshair-arm-len)', height:'1px', transform:'translateY(-50%)' })}
        <div style={{ position:'absolute',left:'50%',top:'50%',width:'3px',height:'3px',background:CYBER.a2,borderRadius:'50%',transform:'translate(-50%,-50%)',boxShadow:`0 0 6px ${CYBER.a2}`,animation:'cyberPulse 1.5s ease-in-out infinite' }} />
        {hitmarkerVisible && (
          <>
            <div style={{ position:'absolute',left:'50%',top:'50%',height:'1px',width:'9px',background:CYBER.textBright,transform:'translate(-11px,-9px) rotate(45deg)' }} />
            <div style={{ position:'absolute',left:'50%',top:'50%',height:'1px',width:'9px',background:CYBER.textBright,transform:'translate(2px,-9px) rotate(-45deg)' }} />
            <div style={{ position:'absolute',left:'50%',top:'50%',height:'1px',width:'9px',background:CYBER.textBright,transform:'translate(-11px,8px) rotate(-45deg)' }} />
            <div style={{ position:'absolute',left:'50%',top:'50%',height:'1px',width:'9px',background:CYBER.textBright,transform:'translate(2px,8px) rotate(45deg)' }} />
          </>
        )}
      </div>
    </div>
  );
}
