import { CAMERA_SENSITIVITY } from '@arena/shared';
import type { GraphicsQuality } from '../../types/settings';
import { CYBER, CyberButton, CyberHexBg, CyberLine, CyberPanel } from '../cyberTheme';

interface PauseOverlayProps {
  visible: boolean;
  roomCode: string;
  view: 'pause' | 'settings';
  graphicsQuality: GraphicsQuality;
  lookSensitivity: number;
  fov: number;
  sfxVolume: number;
  musicVolume: number;
  onGraphicsQualityChange: (value: GraphicsQuality) => void;
  onLookSensitivityChange: (value: number) => void;
  onFovChange: (value: number) => void;
  onSfxVolumeChange: (value: number) => void;
  onMusicVolumeChange: (value: number) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onResume: () => void;
  onDisconnect: () => void;
}

export function PauseOverlay({
  visible,
  roomCode,
  view,
  graphicsQuality,
  lookSensitivity,
  fov,
  sfxVolume,
  musicVolume,
  onGraphicsQualityChange,
  onLookSensitivityChange,
  onFovChange,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onOpenSettings,
  onCloseSettings,
  onResume,
  onDisconnect
}: PauseOverlayProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      onMouseDown={() => {
        if (view === 'settings') {
          onCloseSettings();
        }
      }}
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
      <div
        className="cyber-scale-in"
        style={{ position: 'relative', zIndex: 2, width: 'min(460px, 92vw)' }}
        onMouseDown={event => event.stopPropagation()}
      >
        <CyberPanel style={{ padding: '36px 36px', boxShadow: `0 0 60px ${CYBER.a}22` }}>
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div
              style={{
                color: CYBER.textBright,
                fontSize: '9px',
                letterSpacing: '5px',
                fontFamily: CYBER.font,
                marginBottom: '10px',
                textShadow: '0 1px 8px rgba(0,0,0,0.9)'
              }}
            >
              {view === 'settings' ? '// SETTINGS //' : '// PAUSED //'}
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

          {view === 'pause' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              <CyberButton primary full onClick={onResume}>
                Resume
              </CyberButton>
              <CyberButton full onClick={onOpenSettings}>
                Settings
              </CyberButton>
              <CyberButton danger full onClick={onDisconnect}>
                Leave Match
              </CyberButton>
            </div>
          ) : (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font }}>
                      SFX VOLUME
                    </div>
                    <div style={{ color: CYBER.a, fontSize: '11px', fontFamily: CYBER.font }}>
                      {Math.round(sfxVolume * 100)}%
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={sfxVolume}
                    onChange={event => onSfxVolumeChange(Number(event.target.value))}
                    style={{ width: '100%', accentColor: CYBER.a }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font }}>
                      MUSIC VOLUME
                    </div>
                    <div style={{ color: CYBER.a, fontSize: '11px', fontFamily: CYBER.font }}>
                      {Math.round(musicVolume * 100)}%
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={musicVolume}
                    onChange={event => onMusicVolumeChange(Number(event.target.value))}
                    style={{ width: '100%', accentColor: CYBER.a }}
                  />
                </div>
              </div>
              <CyberLine margin="14px 0 10px" />
              <CyberButton primary full onClick={onCloseSettings}>
                Done
              </CyberButton>
            </CyberPanel>
          )}

          <CyberLine margin="18px 0 14px" />
          <div style={{ textAlign: 'center', fontFamily: CYBER.font, color: CYBER.textBright, fontSize: '9px', letterSpacing: '3px', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {roomCode || 'ARENA'} · LAN · ESC RESUME
          </div>
        </CyberPanel>
      </div>
    </div>
  );
}
