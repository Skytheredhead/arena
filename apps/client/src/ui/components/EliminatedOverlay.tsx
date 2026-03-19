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
        background: 'rgba(5, 8, 14, 0.72)',
        backdropFilter: 'blur(3px)'
      }}
    >
      <CyberPanel style={{ width: 'min(420px, 92vw)', padding: '24px 24px 20px', textAlign: 'center' }}>
        <div
          style={{
            color: 'rgba(255, 66, 92, 0.95)',
            fontFamily: "'Orbitron',var(--font)",
            fontSize: '30px',
            letterSpacing: '3px',
            fontWeight: 800,
            textShadow: '0 0 16px rgba(255, 66, 92, 0.4)',
            marginBottom: '10px'
          }}
        >
          ELIMINATED
        </div>
        <div
          style={{
            color: CYBER.textDim,
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '2px',
            marginBottom: '18px'
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
