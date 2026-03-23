import { CAMERA_SENSITIVITY } from '@arena/shared';
import type { GraphicsQuality } from '../../types/settings';
import {
  CYBER,
  CyberButton,
  CyberGlitchText,
  CyberHexBg,
  CyberLine,
  CyberPanel
} from '../cyberTheme';

interface PauseOverlayProps {
  visible: boolean;
  roomCode: string;
  view: 'pause' | 'settings';
  graphicsQuality: GraphicsQuality;
  lookSensitivity: number;
  fov: number;
  sfxVolume: number;
  musicVolume: number;
  nerdPingsEnabled: boolean;
  onGraphicsQualityChange: (value: GraphicsQuality) => void;
  onLookSensitivityChange: (value: number) => void;
  onFovChange: (value: number) => void;
  onSfxVolumeChange: (value: number) => void;
  onMusicVolumeChange: (value: number) => void;
  onNerdPingsChange: (enabled: boolean) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onResume: () => void;
  onDisconnect: () => void;
}

/* Styled range input row */
function SettingSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  delay = 0,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  delay?: number;
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: '14px', animation: `cyberFadeUp .3s ${delay}s ease both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
        <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font, textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ color: CYBER.a, fontSize: '11px', fontFamily: "'Orbitron',var(--font)", textShadow: `0 0 8px ${CYBER.a}88` }}>
          {display}
        </div>
      </div>
      {/* Custom track */}
      <div style={{ position: 'relative', height: '3px', background: `${CYBER.textDim}33`, cursor: 'pointer' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg,${CYBER.a3},${CYBER.a})`,
          boxShadow: `0 0 8px ${CYBER.a}`,
          transition: 'width 0.15s',
        }} />
        {/* Shimmer */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(90deg,transparent,${CYBER.textBright}33,transparent)`,
          backgroundSize: '200% 100%',
          animation: 'cyberShimmer 2.5s linear infinite',
        }} />
        {/* Handle */}
        <div style={{
          position: 'absolute', top: '50%',
          left: `${pct}%`,
          width: '12px', height: '12px',
          background: CYBER.a, borderRadius: '50%',
          transform: 'translate(-50%,-50%)',
          boxShadow: `0 0 10px ${CYBER.a}`,
          transition: 'left 0.15s',
        }} />
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
    </div>
  );
}

const GRAPHICS_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];

export function PauseOverlay({
  visible,
  roomCode,
  view,
  graphicsQuality,
  lookSensitivity,
  fov,
  sfxVolume,
  musicVolume,
  nerdPingsEnabled,
  onGraphicsQualityChange,
  onLookSensitivityChange,
  onFovChange,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onNerdPingsChange,
  onOpenSettings,
  onCloseSettings,
  onResume,
  onDisconnect
}: PauseOverlayProps): React.JSX.Element | null {
  if (!visible) return null;

  const pauseButtons = [
    { label: 'Resume',       action: onResume,        primary: true  },
    { label: 'Settings',     action: onOpenSettings,  primary: false },
    { label: 'Leave Match',  action: onDisconnect,    danger:  true  },
  ];

  return (
    <div
      onMouseDown={() => { if (view === 'settings') onCloseSettings(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 35,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,11,20,0.78)', backdropFilter: 'blur(5px)',
        animation: 'cyberFadeIn .25s ease both',
      }}
    >
      <CyberHexBg />

      <div
        className="cyber-scale-in"
        style={{ position: 'relative', zIndex: 2, width: 'min(480px,92vw)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <CyberPanel style={{
          padding: '38px 38px',
          boxShadow: `0 0 60px ${CYBER.a}18, 0 0 120px ${CYBER.a}08`,
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '26px' }}>
            <div style={{
              color: CYBER.textDim, fontSize: '9px', letterSpacing: '5px',
              fontFamily: CYBER.font, marginBottom: '12px',
              animation: 'cyberBlink 2s step-start infinite',
            }}>
              {view === 'settings' ? '// SETTINGS //' : '// PAUSED //'}
            </div>
            <CyberGlitchText size={44}>ARENA</CyberGlitchText>
          </div>

          {/* ─── PAUSE VIEW ─── */}
          {view === 'pause' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {pauseButtons.map((btn, i) => (
                <CyberButton
                  key={btn.label}
                  primary={btn.primary}
                  danger={(btn as { danger?: boolean }).danger}
                  full
                  onClick={btn.action}
                  style={{ animation: `cyberFadeUp .3s ${0.05 + i * 0.06}s cubic-bezier(.16,1,.3,1) both` }}
                >
                  {btn.label}
                </CyberButton>
              ))}
            </div>
          )}

          {/* ─── SETTINGS VIEW ─── */}
          {view === 'settings' && (
            <div style={{ animation: 'cyberFadeIn .25s ease both' }}>
              <CyberPanel style={{ padding: '16px', background: 'rgba(0,245,255,0.03)', marginBottom: '0' }}>
                <div style={{ color: CYBER.a, fontSize: '9px', letterSpacing: '4px', fontFamily: CYBER.font, marginBottom: '14px' }}>
                  SYSTEM CONFIGURATION
                </div>

                {/* Graphics quality */}
                <div style={{ marginBottom: '16px', animation: 'cyberFadeUp .3s .05s ease both' }}>
                  <div style={{ color: CYBER.textDim, fontSize: '9px', letterSpacing: '2px', fontFamily: CYBER.font, marginBottom: '8px', textTransform: 'uppercase' }}>
                    Graphics Quality
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                    {GRAPHICS_QUALITIES.map(q => (
                      <CyberButton
                        key={q}
                        small
                        primary={graphicsQuality === q}
                        onClick={() => onGraphicsQualityChange(q)}
                        style={{
                          boxShadow: graphicsQuality === q ? `0 0 12px ${CYBER.a}44` : undefined,
                        }}
                      >
                        {q}
                      </CyberButton>
                    ))}
                  </div>
                </div>

                <SettingSlider
                  label="Look Sensitivity"
                  value={lookSensitivity}
                  display={`${(lookSensitivity / CAMERA_SENSITIVITY).toFixed(2)}×`}
                  min={0.0008} max={0.0042} step={0.0001}
                  onChange={onLookSensitivityChange}
                  delay={0.1}
                />
                <SettingSlider
                  label="Field of View"
                  value={fov}
                  display={`${Math.round(fov)}°`}
                  min={30} max={110} step={1}
                  onChange={onFovChange}
                  delay={0.16}
                />
                <SettingSlider
                  label="SFX Volume"
                  value={sfxVolume}
                  display={`${Math.round(sfxVolume * 100)}%`}
                  min={0} max={1} step={0.01}
                  onChange={onSfxVolumeChange}
                  delay={0.22}
                />
                <SettingSlider
                  label="Music Volume"
                  value={musicVolume}
                  display={`${Math.round(musicVolume * 100)}%`}
                  min={0} max={1} step={0.01}
                  onChange={onMusicVolumeChange}
                  delay={0.28}
                />
                <label
                  style={{
                    marginTop: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: CYBER.textBright,
                    fontFamily: CYBER.font,
                    fontSize: '10px',
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    animation: 'cyberFadeUp .3s .3s ease both'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={nerdPingsEnabled}
                    onChange={e => onNerdPingsChange(e.target.checked)}
                  />
                  Nerd pings
                </label>
              </CyberPanel>

              <div style={{ marginTop: '12px', animation: 'cyberFadeUp .3s .32s ease both' }}>
                <CyberButton primary full onClick={onCloseSettings}>
                  Done
                </CyberButton>
              </div>
            </div>
          )}

          <CyberLine margin="18px 0 14px" />
          <div style={{
            textAlign: 'center', fontFamily: CYBER.font, fontSize: '9px',
            letterSpacing: '3px', color: CYBER.textDim,
          }}>
            {roomCode || 'ARENA'} · LAN ·{' '}
            <span style={{ color: CYBER.textBright }}>ESC RESUME</span>
          </div>
        </CyberPanel>
      </div>
    </div>
  );
}
