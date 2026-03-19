import type { CSSProperties, ReactNode } from 'react';

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

  @keyframes cyberFadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cyberFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes cyberSlideLeft {
    from { opacity: 0; transform: translateX(-24px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes cyberSlideRight {
    from { opacity: 0; transform: translateX(24px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes cyberScaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes cyberPulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @keyframes cyberBlink {
    0%,49% { opacity: 1; }
    50%,100% { opacity: 0; }
  }
  @keyframes cyberBorderPulse {
    0%,100% { box-shadow: 0 0 0 0 transparent, inset 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 12px 1px var(--a), inset 0 0 8px 0 rgba(0,245,255,0.08); }
  }
  @keyframes cyberBorderGlow {
    0%,100% { box-shadow: 0 0 6px rgba(0,245,255,0.35); }
    50% { box-shadow: 0 0 18px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.2); }
  }
  @keyframes cyberShimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes cyberGridScroll {
    from { transform: perspective(600px) rotateX(72deg) translateY(0); }
    to { transform: perspective(600px) rotateX(72deg) translateY(60px); }
  }
  @keyframes cyberFloatY {
    0%,100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes cyberDamageFlash {
    0% { opacity: 0; }
    12% { opacity: 1; }
    100% { opacity: 0; }
  }

  .cyber-fade-up { animation: cyberFadeUp .4s cubic-bezier(.16,1,.3,1) both; }
  .cyber-fade-in { animation: cyberFadeIn .3s ease both; }
  .cyber-slide-left { animation: cyberSlideLeft .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-slide-right { animation: cyberSlideRight .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-scale-in { animation: cyberScaleIn .35s cubic-bezier(.16,1,.3,1) both; }
  .cyber-blink { animation: cyberBlink 1s step-start infinite; }
  .cyber-pulse { animation: cyberPulse 2s ease-in-out infinite; }

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
    position: absolute;
    inset: 0;
    background: var(--a);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.25s cubic-bezier(.16,1,.3,1);
    z-index: 0;
  }
  .cyber-btn:hover::before { transform: scaleX(1); }
  .cyber-btn:hover { color: #000; border-color: var(--a); box-shadow: 0 0 20px rgba(0,245,255,0.53); }
  .cyber-btn:disabled { cursor: not-allowed; opacity: 0.45; }
  .cyber-btn span { position: relative; z-index: 1; }
  .cyber-btn-primary { background: rgba(0,245,255,0.13); border-color: var(--a); box-shadow: 0 0 10px rgba(0,245,255,0.27); }
  .cyber-btn-danger { border-color: rgba(255,34,68,0.53); color: var(--danger); }
  .cyber-btn-danger::before { background: var(--danger); }
  .cyber-btn-danger:hover { color: #fff; border-color: var(--danger); box-shadow: 0 0 20px rgba(255,34,68,0.53); }
  .cyber-btn-sm { padding: 6px 14px; font-size: 10px; }
  .cyber-btn-full { width: 100%; display: block; text-align: center; }

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
    width: 12px;
    height: 12px;
    border-color: var(--a);
    border-style: solid;
  }
  .cyber-panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
  .cyber-panel::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

  .cyber-label {
    font-family: var(--font);
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--textDim);
    margin-bottom: 6px;
  }

  .cyber-scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 45;
    background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px);
  }
`;

export function CyberGlobalStyles(): React.JSX.Element {
  return <style>{CSS}</style>;
}

export function CyberScanFx(): React.JSX.Element {
  return <div className="cyber-scanlines" />;
}

export function CyberHexBg(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60%',
          backgroundImage:
            'linear-gradient(rgba(0,245,255,0.09) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.07) 1px,transparent 1px)',
          backgroundSize: '50px 50px',
          animation: 'cyberGridScroll 3s linear infinite',
          transform: 'perspective(600px) rotateX(72deg)',
          transformOrigin: 'bottom',
          opacity: 0.55
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '50%',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(0,245,255,0.06) 0%, transparent 70%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '40%',
          height: '40%',
          background: 'radial-gradient(ellipse at 0% 0%, rgba(0,245,255,0.05) 0%, transparent 60%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '30%',
          height: '30%',
          background: 'radial-gradient(ellipse at 100% 100%, rgba(255,0,144,0.05) 0%, transparent 60%)'
        }}
      />
    </div>
  );
}

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

export function CyberButton({
  children,
  onClick,
  primary,
  danger,
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
  small?: boolean;
  full?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}): React.JSX.Element {
  const classes = [
    'cyber-btn',
    primary ? 'cyber-btn-primary' : '',
    danger ? 'cyber-btn-danger' : '',
    small ? 'cyber-btn-sm' : '',
    full ? 'cyber-btn-full' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} style={style}>
      <span>{children}</span>
    </button>
  );
}

export function CyberLine({ margin = '14px 0' }: { margin?: string }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        margin,
        height: '1px',
        background: CYBER.border,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '-1px',
          left: '-10%',
          width: '20%',
          height: '3px',
          background: 'linear-gradient(90deg, transparent, var(--a), transparent)',
          animation: 'cyberShimmer 2.5s linear infinite',
          backgroundSize: '200% 100%'
        }}
      />
    </div>
  );
}

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
    <div style={{ height: `${height}px`, background: `${CYBER.textDim}55`, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`
        }}
      />
    </div>
  );
}

export function PingLabel({ ping }: { ping: number | null }): React.JSX.Element {
  const color = ping == null ? CYBER.textDim : ping < 50 ? CYBER.ok : ping < 100 ? CYBER.warn : CYBER.danger;
  return <span style={{ color, fontSize: '11px', fontFamily: CYBER.font }}>{ping == null ? '--' : `${ping}ms`}</span>;
}

export function CyberCrosshair({
  hitmarkerVisible,
  spread,
  scoped
}: {
  hitmarkerVisible: boolean;
  spread: number;
  scoped: boolean;
}): React.JSX.Element {
  const clampedSpread = Math.max(0, Math.min(16, spread));
  const armOffset = scoped ? 5 + clampedSpread * 0.45 : 7 + clampedSpread;
  const armLength = scoped ? 6 : 8;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 20,
        pointerEvents: 'none'
      }}
    >
      <div style={{ position: 'relative', width: '44px', height: '44px' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: `calc(50% - ${armOffset}px - ${armLength}px)`,
            width: '1px',
            height: `${armLength}px`,
            background: CYBER.a,
            transform: 'translateX(-50%)',
            boxShadow: `0 0 4px ${CYBER.a}`
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: `calc(50% + ${armOffset}px)`,
            width: '1px',
            height: `${armLength}px`,
            background: CYBER.a,
            transform: 'translateX(-50%)',
            boxShadow: `0 0 4px ${CYBER.a}`
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `calc(50% - ${armOffset}px - ${armLength}px)`,
            width: `${armLength}px`,
            height: '1px',
            background: CYBER.a,
            transform: 'translateY(-50%)',
            boxShadow: `0 0 4px ${CYBER.a}`
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `calc(50% + ${armOffset}px)`,
            width: `${armLength}px`,
            height: '1px',
            background: CYBER.a,
            transform: 'translateY(-50%)',
            boxShadow: `0 0 4px ${CYBER.a}`
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '3px', height: '3px', background: CYBER.a2, borderRadius: '50%', transform: 'translate(-50%,-50%)', boxShadow: `0 0 6px ${CYBER.a2}` }} />
        {hitmarkerVisible ? (
          <>
            <div style={{ position: 'absolute', left: '50%', top: '50%', height: '1px', width: '9px', background: CYBER.textBright, transform: 'translate(-11px,-9px) rotate(45deg)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', height: '1px', width: '9px', background: CYBER.textBright, transform: 'translate(2px,-9px) rotate(-45deg)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', height: '1px', width: '9px', background: CYBER.textBright, transform: 'translate(-11px,8px) rotate(-45deg)' }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', height: '1px', width: '9px', background: CYBER.textBright, transform: 'translate(2px,8px) rotate(45deg)' }} />
          </>
        ) : null}
      </div>
    </div>
  );
}
