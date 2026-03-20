import { CYBER, CyberButton, CyberPanel } from '../cyberTheme';

interface EliminatedOverlayProps {
  visible: boolean;
  onRespawn: () => void;
}

export function EliminatedOverlay({
  visible,
  onRespawn
}: EliminatedOverlayProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, rgba(64,8,16,0.45) 0%, rgba(5,8,14,0.84) 58%, rgba(2,6,12,0.92) 100%)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <CyberPanel style={{ width: 'min(460px, 92vw)', padding: '26px 24px 22px', textAlign: 'center', boxShadow: '0 0 40px rgba(255,66,92,0.2)' }}>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <div
            style={{
              color: 'rgba(255, 66, 92, 0.95)',
              fontFamily: "'Orbitron',var(--font)",
              fontSize: '36px',
              letterSpacing: '4px',
              fontWeight: 900,
              textShadow: '0 0 18px rgba(255, 66, 92, 0.42)'
            }}
          >
            ELIMINATED
          </div>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              transform: 'translate(1px, -1px)',
              color: 'rgba(60,224,255,0.45)',
              fontFamily: "'Orbitron',var(--font)",
              fontSize: '36px',
              letterSpacing: '4px',
              fontWeight: 900,
              pointerEvents: 'none'
            }}
          >
            ELIMINATED
          </div>
        </div>
        <div
          style={{
            color: CYBER.textDim,
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '2px',
            marginBottom: '20px'
          }}
        >
          Re-enter the arena whenever you are ready.
        </div>
        <CyberButton primary full onClick={onRespawn}>
          Respawn
        </CyberButton>
      </CyberPanel>
    </div>
  );
}
