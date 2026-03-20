import React from 'react';
import { CYBER } from '../ui/cyberTheme';

interface CrashBoundaryProps {
  children: React.ReactNode;
}

interface CrashBoundaryState {
  errorMessage: string | null;
}

export class CrashBoundary extends React.Component<CrashBoundaryProps, CrashBoundaryState> {
  override state: CrashBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): CrashBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : 'The UI crashed during startup.',
    };
  }

  override componentDidCatch(error: unknown): void {
    console.error('CrashBoundary caught an error', error);
  }

  override render(): React.ReactNode {
    if (!this.state.errorMessage) return this.props.children;

    return (
      <div
        className="cyber-root"
        style={{
          position: 'fixed', inset: 0, zIndex: 2147483647,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: CYBER.bg, padding: '24px',
          overflow: 'auto',
        }}
      >
        {/* Background grid */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage:
              `linear-gradient(${CYBER.a}08 1px,transparent 1px),linear-gradient(90deg,${CYBER.a}06 1px,transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Red vignette */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse at center,transparent 30%,${CYBER.danger}22 100%)`,
            animation: 'cyberRedFlash 2s ease-in-out infinite',
          }}
        />

        <div
          style={{
            position: 'relative', zIndex: 1,
            width: 'min(760px,96vw)',
            border: `1px solid ${CYBER.danger}66`,
            background: 'rgba(12,2,6,0.96)',
            padding: '32px',
            animation: 'cyberScaleIn .4s cubic-bezier(.16,1,.3,1) both',
            clipPath: 'polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))',
          }}
        >
          {/* Corner decorations */}
          <div style={{ position:'absolute',top:'-1px',left:'-1px',width:'16px',height:'16px',borderTop:`2px solid ${CYBER.danger}`,borderLeft:`2px solid ${CYBER.danger}` }} />
          <div style={{ position:'absolute',bottom:'-1px',right:'-1px',width:'16px',height:'16px',borderBottom:`2px solid ${CYBER.danger}`,borderRight:`2px solid ${CYBER.danger}` }} />

          {/* Tag */}
          <div style={{
            color: CYBER.danger, fontFamily: "'Orbitron',var(--font)",
            fontSize: '9px', letterSpacing: '4px', marginBottom: '12px',
            textShadow: `0 0 10px ${CYBER.danger}88`,
          }}>
            STARTUP ERROR
          </div>

          {/* Heading */}
          <div style={{
            fontFamily: "'Orbitron',var(--font)",
            fontSize: '28px', fontWeight: 900, color: CYBER.textBright,
            letterSpacing: '2px', marginBottom: '10px', lineHeight: 1.1,
            textShadow: `0 0 20px ${CYBER.danger}44`,
          }}>
            UI CRASH INTERCEPTED
          </div>

          {/* Sub-text */}
          <div style={{
            color: CYBER.text, fontFamily: CYBER.font,
            fontSize: '12px', letterSpacing: '1px', marginBottom: '20px', lineHeight: 1.6,
          }}>
            A runtime exception was captured before the page could stay mounted.
            First captured error message below.
          </div>

          {/* Separator */}
          <div style={{ height: '1px', background: `${CYBER.danger}44`, marginBottom: '16px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute',inset:0,background:`linear-gradient(90deg,transparent,${CYBER.danger}88,transparent)`,animation:'cyberShimmer 2s linear infinite',backgroundSize:'200% 100%' }} />
          </div>

          {/* Error message */}
          <pre style={{
            padding: '16px',
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${CYBER.textDim}`,
            color: CYBER.warn,
            fontFamily: CYBER.font,
            fontSize: '12px', lineHeight: 1.5,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.errorMessage}
          </pre>

          {/* Reload hint */}
          <div style={{
            marginTop: '16px', color: CYBER.textDim,
            fontFamily: CYBER.font, fontSize: '10px', letterSpacing: '2px',
          }}>
            <span className="cyber-blink">█ </span>
            Reload the page to attempt recovery.
          </div>
        </div>
      </div>
    );
  }
}
