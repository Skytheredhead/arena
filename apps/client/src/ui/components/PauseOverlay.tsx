import { CAMERA_SENSITIVITY } from '@arena/shared';
import type { GraphicsQuality } from '../../types/settings';
import { CYBER, CyberButton, CyberHexBg, CyberLine, CyberPanel } from '../cyberTheme';

interface PauseOverlayProps {
  visible: boolean;
  roomCode: string;
  graphicsQuality: GraphicsQuality;
  lookSensitivity: number;
  fov: number;
  forceLocalBackend: boolean;
  onGraphicsQualityChange: (value: GraphicsQuality) => void;
  onLookSensitivityChange: (value: number) => void;
  onFovChange: (value: number) => void;
  onForceLocalBackendChange: (value: boolean) => void;
  onResume: () => void;
  onDisconnect: () => void;
}

export function PauseOverlay({
  visible,
  roomCode,
  graphicsQuality,
  lookSensitivity,
  fov,
  forceLocalBackend,
  onGraphicsQualityChange,
  onLookSensitivityChange,
  onFovChange,
  onForceLocalBackendChange,
  onResume,
  onDisconnect
}: PauseOverlayProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 35,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2,11,20,0.75)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <CyberHexBg />
      <div className="cyber-scale-in" style={{ position: 'relative', zIndex: 2, width: 'min(460px, 92vw)' }}>
        <CyberPanel style={{ padding: '36px 36px', boxShadow: `0 0 60px ${CYBER.a}22` }}>
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div
              style={{
                color: CYBER.textDim,
                fontSize: '9px',
                letterSpacing: '5px',
                fontFamily: CYBER.font,
                marginBottom: '10px'
              }}
            >
              // PAUSED //
            </div>
            <div
              style={{
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '44px',
                fontWeight: 900,
                color: CYBER.a,
                letterSpacing: '3px',
                textShadow: `0 0 18px ${CYBER.a}`
              }}
            >
              ARENA
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
            <CyberButton primary full onClick={onResume}>
              Resume
            </CyberButton>
            <CyberButton danger full onClick={onDisconnect}>
              Leave Match
            </CyberButton>
          </div>

          <CyberPanel style={{ padding: '12px 12px 14px', background: 'rgba(0,245,255,0.03)' }}>
            <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '3px', fontFamily: CYBER.font, marginBottom: '10px' }}>
              SETTINGS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              <div>
                <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font, marginBottom: '6px' }}>
                  GRAPHICS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['low', 'medium', 'high'] as const).map(value => (
                    <CyberButton
                      key={value}
                      small
                      primary={graphicsQuality === value}
                      onClick={() => onGraphicsQualityChange(value)}
                    >
                      {value}
                    </CyberButton>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font }}>
                    LOOK SENSITIVITY
                  </div>
                  <div style={{ color: CYBER.a, fontSize: '11px', fontFamily: CYBER.font }}>
                    {(lookSensitivity / CAMERA_SENSITIVITY).toFixed(2)}x
                  </div>
                </div>
                <input
                  type="range"
                  min={0.0008}
                  max={0.0042}
                  step={0.0001}
                  value={lookSensitivity}
                  onChange={event => onLookSensitivityChange(Number(event.target.value))}
                  style={{ width: '100%', accentColor: CYBER.a }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font }}>
                    FOV
                  </div>
                  <div style={{ color: CYBER.a, fontSize: '11px', fontFamily: CYBER.font }}>
                    {Math.round(fov)}
                  </div>
                </div>
                <input
                  type="range"
                  min={30}
                  max={110}
                  step={1}
                  value={fov}
                  onChange={event => onFovChange(Number(event.target.value))}
                  style={{ width: '100%', accentColor: CYBER.a }}
                />
              </div>

              <div>
                <div
                  style={{
                    color: CYBER.textDim,
                    fontSize: '9px',
                    letterSpacing: '2px',
                    fontFamily: CYBER.font,
                    marginBottom: '6px'
                  }}
                >
                  BACKEND MODE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <CyberButton
                    small
                    primary={!forceLocalBackend}
                    onClick={() => onForceLocalBackendChange(false)}
                  >
                    Auto
                  </CyberButton>
                  <CyberButton
                    small
                    primary={forceLocalBackend}
                    onClick={() => onForceLocalBackendChange(true)}
                  >
                    Force Local
                  </CyberButton>
                </div>
              </div>
            </div>
          </CyberPanel>

          <CyberLine margin="18px 0 14px" />
          <div style={{ textAlign: 'center', fontFamily: CYBER.font, color: CYBER.textDim, fontSize: '9px', letterSpacing: '3px' }}>
            {roomCode || 'ARENA'} · LAN · ESC RESUME
          </div>
        </CyberPanel>
      </div>
    </div>
  );
}
