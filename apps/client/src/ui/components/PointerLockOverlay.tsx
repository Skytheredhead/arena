import { CYBER, CyberButton, CyberPanel } from '../cyberTheme';

interface PointerLockOverlayProps {
  visible: boolean;
  reconnecting: boolean;
  onResume: () => void;
}

export function PointerLockOverlay({
  visible,
  reconnecting,
  onResume,
}: PointerLockOverlayProps): React.JSX.Element | null {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 34,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <CyberPanel
        style={{
          width: 'min(360px,90vw)',
          padding: '18px',
          textAlign: 'center',
          pointerEvents: 'auto',
          background: 'rgba(2,11,20,.9)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            color: reconnecting ? CYBER.warn : CYBER.a,
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '3px',
            marginBottom: '12px',
          }}
        >
          {reconnecting ? 'RECONNECTING TO ARENA' : 'MOUSE CONTROL RELEASED'}
        </div>
        <CyberButton
          primary
          full
          onClick={onResume}
          disabled={reconnecting}
        >
          {reconnecting ? 'Please Wait' : 'Click to Resume'}
        </CyberButton>
      </CyberPanel>
    </div>
  );
}
