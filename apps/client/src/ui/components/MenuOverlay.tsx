import { useEffect, useState } from 'react';
import {
  CAMERA_SENSITIVITY,
  type AccountStatsView,
  type BackendTarget,
  type GraphicsQuality,
  MAX_FOV,
  MAX_LOOK_SENSITIVITY,
  MIN_FOV,
  MIN_LOOK_SENSITIVITY,
  normalizeRoomCode,
  type RoomView,
} from '../models';
import {
  CYBER,
  CyberButton,
  CyberGlitchText,
  CyberHexBg,
  CyberLine,
  CyberPanel,
  PingLabel
} from '../cyberTheme';
import { AccountStatsPanel } from './AccountStatsPanel';

interface MenuOverlayProps {
  connected: boolean;
  busy: boolean;
  nickname: string;
  roomCode: string;
  backendConnected: boolean;
  backendPingMs: number | null;
  backendPingLowMs: number | null;
  backendPingJitterMs: number | null;
  backendServerPipelineMs: number | null;
  backendServerPipelineLowMs: number | null;
  nerdPingsEnabled: boolean;
  backendTarget: BackendTarget;
  customBackendLabel: string;
  customBackendHost: string;
  customBackendPort: string;
  customBackendSecure: boolean;
  openRooms: RoomView[];
  connectionError: string | null;
  authError: string | null;
  authLoggedIn: boolean;
  authUsername: string | null;
  authStats: AccountStatsView | null;
  authBusy: boolean;
  graphicsQuality: GraphicsQuality;
  lookSensitivity: number;
  fov: number;
  sfxVolume: number;
  musicVolume: number;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshStats: () => void;
  onGraphicsQualityChange: (value: GraphicsQuality) => void;
  onLookSensitivityChange: (value: number) => void;
  onFovChange: (value: number) => void;
  onSfxVolumeChange: (value: number) => void;
  onMusicVolumeChange: (value: number) => void;
  onNerdPingsChange: (enabled: boolean) => void;
  hasServerPings: boolean;
  onCopyServerPings: () => Promise<boolean>;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinOpenRoom: (code: string) => void;
  onBackendTargetChange: (target: BackendTarget) => void;
  onCustomBackendHostChange: (value: string) => void;
  onCustomBackendPortChange: (value: string) => void;
  onCustomBackendSecureChange: (value: boolean) => void;
  onUseCustomBackend: () => void;
}

function SettingSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  delay = 0
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
      <div style={{ position: 'relative', height: '3px', background: `${CYBER.textDim}33`, cursor: 'pointer' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg,${CYBER.a3},${CYBER.a})`,
          boxShadow: `0 0 8px ${CYBER.a}`,
          transition: 'width 0.15s',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(90deg,transparent,${CYBER.textBright}33,transparent)`,
          backgroundSize: '200% 100%',
          animation: 'cyberShimmer 2.5s linear infinite',
        }} />
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

export function MenuOverlay({
  connected,
  busy,
  nickname,
  roomCode,
  backendConnected,
  backendPingMs,
  backendPingLowMs,
  backendPingJitterMs,
  backendServerPipelineMs,
  backendServerPipelineLowMs,
  nerdPingsEnabled,
  backendTarget,
  customBackendLabel,
  customBackendHost,
  customBackendPort,
  customBackendSecure,
  openRooms,
  connectionError,
  authError,
  authLoggedIn,
  authUsername,
  authStats,
  authBusy,
  graphicsQuality,
  lookSensitivity,
  fov,
  sfxVolume,
  musicVolume,
  onLogin,
  onRegister,
  onLogout,
  onRefreshStats,
  onGraphicsQualityChange,
  onLookSensitivityChange,
  onFovChange,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onNerdPingsChange,
  hasServerPings,
  onCopyServerPings,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onJoinOpenRoom,
  onBackendTargetChange,
  onCustomBackendHostChange,
  onCustomBackendPortChange,
  onCustomBackendSecureChange,
  onUseCustomBackend
}: MenuOverlayProps): React.JSX.Element | null {
  const [authPanel, setAuthPanel] = useState<'none' | 'login' | 'register' | 'account' | 'stats'>('none');
  const [menuView, setMenuView] = useState<'room' | 'settings'>('room');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const backendOptions: Array<{ target: BackendTarget; label: string }> = [
    { target: 'current', label: 'Current' },
    { target: 'arenaapi2', label: 'Playit' },
    { target: 'custom', label: customBackendLabel }
  ];
  const customPortValid = /^\d+$/.test(customBackendPort.trim());

  useEffect(() => {
    if (authLoggedIn && (authPanel === 'login' || authPanel === 'register')) {
      setAuthPanel('none');
      return;
    }
    if (!authLoggedIn && (authPanel === 'account' || authPanel === 'stats')) {
      setAuthPanel('none');
    }
  }, [authLoggedIn, authPanel]);

  if (connected && !connectionError) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30"
      style={{ backgroundColor: CYBER.bg, overflow: 'hidden' }}
    >
      <CyberHexBg />

      {/* ── TOP BAR ── */}
      <div
        className="pointer-events-auto cyber-fade-up"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 12,
          borderBottom: `1px solid ${CYBER.border}`,
          background: 'rgba(2,11,20,0.95)', backdropFilter: 'blur(12px)',
          padding: '10px 32px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        {/* Connection status */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', fontFamily: CYBER.font, fontSize: '10px', letterSpacing: '2px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: CYBER.textDim, letterSpacing: '1px' }}>BACKEND</span>
            {backendOptions.map(option => (
              <button
                key={option.target}
                type="button"
                onClick={() => onBackendTargetChange(option.target)}
                disabled={busy}
                style={{
                  border: `1px solid ${
                    backendTarget === option.target ? CYBER.a : CYBER.border
                  }`,
                  background:
                    backendTarget === option.target
                      ? `${CYBER.a}22`
                      : 'rgba(255,255,255,0.03)',
                  color:
                    backendTarget === option.target ? CYBER.a : CYBER.textBright,
                  padding: '3px 8px',
                  borderRadius: '999px',
                  fontFamily: CYBER.font,
                  fontSize: '10px',
                  letterSpacing: '1px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.55 : 1,
                  maxWidth: option.target === 'custom' ? '180px' : undefined,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={option.target === 'custom' ? customBackendLabel : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: backendConnected ? CYBER.ok : CYBER.danger,
              boxShadow: `0 0 7px ${backendConnected ? CYBER.ok : CYBER.danger}`,
              animation: 'cyberPulse 2s ease-in-out infinite',
            }} />
            <span style={{ color: backendConnected ? CYBER.ok : CYBER.danger, letterSpacing: '2px' }}>
              {backendConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <span style={{ color: CYBER.textDim, letterSpacing: '1px' }}>
            <PingLabel
              ping={backendPingMs}
              jitter={backendPingJitterMs}
              showNerd={nerdPingsEnabled}
              pingLowMs={backendPingLowMs}
              serverPipelineMs={backendServerPipelineMs}
              serverPipelineLowMs={backendServerPipelineLowMs}
            />
          </span>
        </div>

        {/* Auth controls */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {authLoggedIn ? (
            <CyberButton
              small primary
              onClick={() => setAuthPanel(p => p === 'account' ? 'none' : 'account')}
              disabled={authBusy}
            >
              {authUsername ?? 'Account'}
            </CyberButton>
          ) : (
            <>
              <CyberButton
                primary small
                onClick={() => setAuthPanel(p => p === 'login' ? 'none' : 'login')}
                disabled={authBusy}
              >
                Login
              </CyberButton>
              <CyberButton
                small
                onClick={() => setAuthPanel(p => p === 'register' ? 'none' : 'register')}
                disabled={authBusy}
              >
                Register
              </CyberButton>
            </>
          )}
        </div>
      </div>

      {/* ── AUTH PANEL (dropdown) ── */}
      {authPanel !== 'none' && (
        <div
          className="pointer-events-auto cyber-fade-up"
          style={{ position: 'absolute', top: '60px', right: '24px', width: 'min(360px,92vw)', zIndex: 14 }}
        >
          <CyberPanel style={{ padding: '16px', background: 'rgba(0,10,20,0.94)', backdropFilter: 'blur(12px)' }}>
            {authError && (
              <div style={{
                marginBottom: '10px', padding: '8px 12px',
                background: `${CYBER.danger}18`, border: `1px solid ${CYBER.danger}66`,
                color: CYBER.danger, fontFamily: CYBER.font, fontSize: '11px', letterSpacing: '1px',
              }}>
                {authError}
              </div>
            )}

            {authPanel === 'login' && (
              <form
                onSubmit={e => { e.preventDefault(); void onLogin(loginIdentifier.trim(), loginPassword); }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div className="cyber-label" style={{ fontSize: '10px', letterSpacing: '4px' }}>// OPERATOR LOGIN</div>
                <input
                  className="cyber-input"
                  value={loginIdentifier}
                  onChange={e => setLoginIdentifier(e.target.value)}
                  placeholder="EMAIL OR USERNAME"
                  autoComplete="username"
                />
                <input
                  className="cyber-input"
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="PASSWORD"
                  autoComplete="current-password"
                />
                <CyberButton
                  primary full type="submit"
                  disabled={authBusy || loginIdentifier.trim().length === 0 || loginPassword.length === 0}
                >
                  {authBusy ? 'Authenticating...' : 'Sign In'}
                </CyberButton>
              </form>
            )}

            {authPanel === 'register' && (
              <form
                onSubmit={e => { e.preventDefault(); void onRegister(registerEmail.trim(), registerUsername.trim(), registerPassword); }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div className="cyber-label" style={{ fontSize: '10px', letterSpacing: '4px' }}>// CREATE ACCOUNT</div>
                <input className="cyber-input" value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} placeholder="EMAIL" autoComplete="email" />
                <input className="cyber-input" value={registerUsername} onChange={e => setRegisterUsername(e.target.value)} placeholder="USERNAME" autoComplete="username" />
                <input className="cyber-input" type="password" value={registerPassword} onChange={e => setRegisterPassword(e.target.value)} placeholder="PASSWORD" autoComplete="new-password" />
                <CyberButton
                  primary full type="submit"
                  disabled={authBusy || !registerEmail.trim() || !registerUsername.trim() || !registerPassword}
                >
                  {authBusy ? 'Creating...' : 'Create Account'}
                </CyberButton>
              </form>
            )}

            {authPanel === 'account' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="cyber-label" style={{ fontSize: '10px', letterSpacing: '4px' }}>// {authUsername ?? 'ACCOUNT'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <CyberButton onClick={() => { onRefreshStats(); setAuthPanel('stats'); }} disabled={authBusy}>Stats</CyberButton>
                  <CyberButton danger onClick={() => { void onLogout(); setAuthPanel('none'); }} disabled={authBusy}>Logout</CyberButton>
                </div>
              </div>
            )}

            {authPanel === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="cyber-label" style={{ fontSize: '10px', letterSpacing: '4px' }}>// STATS · {authUsername ?? 'USER'}</div>
                <AccountStatsPanel stats={authStats} />
                <CyberLine margin="8px 0" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <CyberButton onClick={onRefreshStats} disabled={authBusy}>Refresh</CyberButton>
                  <CyberButton danger onClick={() => { void onLogout(); }} disabled={authBusy}>Logout</CyberButton>
                </div>
              </div>
            )}
          </CyberPanel>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div
        className="pointer-events-none"
        style={{
          position: 'relative', zIndex: 2, height: '100%',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          padding: '96px 16px',
        }}
      >
        {/* LOGO */}
        <div className="cyber-fade-up" style={{ textAlign: 'center', marginBottom: '52px' }}>
          <CyberGlitchText size={92}>ARENA</CyberGlitchText>
          <div style={{
            color: CYBER.textDim, fontSize: '10px', letterSpacing: '8px',
            marginTop: '14px', fontFamily: CYBER.font,
            animation: 'cyberFadeUp .5s .35s ease both',
          }}>
            arena fps // made by skytheredhead
          </div>
        </div>

        {/* MAIN PANEL */}
        <div
          className="pointer-events-auto"
          style={{ position: 'relative', zIndex: 2, width: 'min(420px,92vw)', animation: 'cyberFadeUp .5s .2s cubic-bezier(.16,1,.3,1) both' }}
        >
          {menuView === 'room' ? (
            <CyberPanel style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="cyber-label" style={{ animation: 'cyberSlideLeft .35s .3s both', color: CYBER.textBright }}>operator callsign</div>
              <input
                className="cyber-input"
                value={nickname}
                maxLength={16}
                disabled={authLoggedIn}
                onChange={e => onNicknameChange(e.target.value.slice(0, 16))}
                placeholder={authLoggedIn ? 'ACCOUNT USERNAME' : 'CALLSIGN'}
                style={{ animation: 'cyberSlideLeft .35s .35s both' }}
              />

              <div className="cyber-label" style={{ animation: 'cyberSlideLeft .35s .4s both', color: CYBER.textBright }}>room access code</div>
              <input
                className="cyber-input"
                value={roomCode}
                onChange={e => onRoomCodeChange(normalizeRoomCode(e.target.value))}
                placeholder="XK-0000"
                style={{ letterSpacing: '5px', textTransform: 'uppercase', animation: 'cyberSlideLeft .35s .42s both' }}
              />

              {connectionError && (
                <div style={{
                  padding: '10px 14px',
                  background: `${CYBER.danger}18`,
                  border: `1px solid ${CYBER.danger}66`,
                  color: CYBER.danger, fontFamily: CYBER.font,
                  fontSize: '11px', letterSpacing: '1px',
                  animation: 'cyberShake .45s ease both',
                }}>
                  ⚠ {connectionError}
                </div>
              )}

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px',
                animation: 'cyberFadeUp .4s .5s ease both',
              }}>
                <CyberButton primary onClick={onCreateRoom} disabled={connected || busy}>
                  Create Room
                </CyberButton>
                <CyberButton onClick={onJoinRoom} disabled={connected || busy}>
                  Join Room
                </CyberButton>
              </div>

              <CyberLine margin="16px 0 10px" />

              <div style={{ animation: 'cyberFadeUp .4s .55s ease both' }}>
                <div className="cyber-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: CYBER.textBright }}>
                  <span>Open Rooms</span>
                  {openRooms.length > 0 && (
                    <span style={{ color: CYBER.textBright }}>{openRooms.length} available</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {openRooms.length === 0 ? (
                    <div style={{
                      color: CYBER.textBright, fontFamily: CYBER.font, fontSize: '11px',
                      letterSpacing: '2px', padding: '8px 0',
                    }}>
                      <span className="cyber-blink">█ </span>
                      scanning for open rooms…
                    </div>
                  ) : (
                    openRooms.map((room, i) => (
                      <button
                        key={room.code}
                        className="cyber-btn cyber-btn-full"
                        onClick={() => onJoinOpenRoom(room.code)}
                        disabled={busy || room.playerCount >= 5}
                        onMouseEnter={() => setHoveredRoom(room.code)}
                        onMouseLeave={() => setHoveredRoom(null)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          letterSpacing: '1.5px', textTransform: 'none',
                          animation: `cyberSlideLeft .3s ${0.55 + i * 0.06}s cubic-bezier(.16,1,.3,1) both`,
                          boxShadow: hoveredRoom === room.code ? `0 0 14px ${CYBER.a}44` : undefined,
                        }}
                      >
                        <span>{room.code}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '9px', letterSpacing: '1px', color: CYBER.textBright }}>
                            {room.playerCount}/5 pilots
                          </span>
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: room.playerCount < 3 ? CYBER.ok : CYBER.warn,
                            boxShadow: `0 0 5px ${room.playerCount < 3 ? CYBER.ok : CYBER.warn}`,
                            animation: 'cyberPulse 2s ease-in-out infinite',
                          }} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </CyberPanel>
          ) : (
            <CyberPanel style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="cyber-label" style={{ color: CYBER.textBright }}>settings</div>
              <CyberPanel style={{ padding: '16px', background: 'rgba(0,245,255,0.03)', marginBottom: '0' }}>
                <div style={{ color: CYBER.a, fontSize: '9px', letterSpacing: '4px', fontFamily: CYBER.font, marginBottom: '14px' }}>
                  SYSTEM CONFIGURATION
                </div>
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
                  min={MIN_LOOK_SENSITIVITY}
                  max={MAX_LOOK_SENSITIVITY}
                  step={0.0001}
                  onChange={onLookSensitivityChange}
                  delay={0.1}
                />
                <SettingSlider
                  label="Field of View"
                  value={fov}
                  display={`${Math.round(fov)}°`}
                  min={MIN_FOV}
                  max={MAX_FOV}
                  step={1}
                  onChange={onFovChange}
                  delay={0.16}
                />
                <SettingSlider
                  label="SFX Volume"
                  value={sfxVolume}
                  display={`${Math.round(sfxVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onSfxVolumeChange}
                  delay={0.22}
                />
                <SettingSlider
                  label="Music Volume"
                  value={musicVolume}
                  display={`${Math.round(musicVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
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
                <div style={{ marginTop: '10px', animation: 'cyberFadeUp .3s .34s ease both' }}>
                  <CyberButton
                    full
                    onClick={() => {
                      void onCopyServerPings().then(copied => {
                        setCopyStatus(copied ? 'copied' : 'failed');
                        window.setTimeout(() => setCopyStatus('idle'), 2200);
                      });
                    }}
                    disabled={!hasServerPings}
                  >
                    {copyStatus === 'copied'
                      ? 'Copied'
                      : copyStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy server pings'}
                  </CyberButton>
                </div>

                <CyberLine margin="14px 0 12px" />

                <div style={{ animation: 'cyberFadeUp .3s .32s ease both' }}>
                  <div
                    style={{
                      color: CYBER.a,
                      fontSize: '9px',
                      letterSpacing: '3px',
                      fontFamily: CYBER.font,
                      marginBottom: '10px'
                    }}
                  >
                    NETWORK OVERRIDE (TESTING)
                  </div>
                  <div
                    style={{
                      color: CYBER.textDim,
                      fontSize: '10px',
                      letterSpacing: '1px',
                      fontFamily: CYBER.font,
                      marginBottom: '8px'
                    }}
                  >
                    Custom host / IP
                  </div>
                  <input
                    className="cyber-input"
                    value={customBackendHost}
                    onChange={e => onCustomBackendHostChange(e.target.value)}
                    placeholder="127.0.0.1"
                  />
                  <div
                    style={{
                      color: CYBER.textDim,
                      fontSize: '10px',
                      letterSpacing: '1px',
                      fontFamily: CYBER.font,
                      marginTop: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    Port
                  </div>
                  <input
                    className="cyber-input"
                    inputMode="numeric"
                    value={customBackendPort}
                    onChange={e => onCustomBackendPortChange(e.target.value)}
                    placeholder="4789"
                  />
                  <label
                    style={{
                      marginTop: '10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: CYBER.textBright,
                      fontFamily: CYBER.font,
                      fontSize: '10px',
                      letterSpacing: '1px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={customBackendSecure}
                      onChange={e => onCustomBackendSecureChange(e.target.checked)}
                    />
                    Use secure WebSocket (`wss://`)
                  </label>
                  <div
                    style={{
                      marginTop: '10px',
                      color: CYBER.textDim,
                      fontFamily: CYBER.font,
                      fontSize: '10px',
                      letterSpacing: '1px'
                    }}
                  >
                    Current custom endpoint: {customBackendLabel}
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <CyberButton
                      full
                      onClick={onUseCustomBackend}
                      disabled={!customBackendHost.trim() || !customPortValid}
                    >
                      Use Custom Backend
                    </CyberButton>
                  </div>
                </div>
              </CyberPanel>
              <div style={{ marginTop: '12px', animation: 'cyberFadeUp .3s .32s ease both' }}>
                <CyberButton primary full onClick={() => setMenuView('room')}>
                  Done
                </CyberButton>
              </div>
            </CyberPanel>
          )}
        </div>
      </div>

      {menuView === 'room' && (
        <div
          className="pointer-events-auto cyber-fade-up"
          style={{ position: 'absolute', right: '24px', bottom: '52px', zIndex: 12 }}
        >
          <CyberButton onClick={() => setMenuView('settings')}>
            Settings
          </CyberButton>
        </div>
      )}

      {/* ── BOTTOM STATUS BAR ── */}
      <div
        className="pointer-events-none cyber-fade-up"
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          borderTop: `1px solid ${CYBER.border}`,
          background: 'rgba(2,11,20,0.95)', backdropFilter: 'blur(8px)',
          padding: '8px 32px',
          display: 'flex', justifyContent: 'center', gap: '32px',
          fontFamily: CYBER.font,
        }}
      >
        {[
          { label: 'version', value: 'v0.1.0' },
          { label: 'github',  value: 'skytheredhead' },
        ].map(item => (
          <div key={item.label} style={{ fontSize: '10px', letterSpacing: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: CYBER.textDim }}>{item.label}</span>
            <span style={{ color: CYBER.a, textShadow: `0 0 6px ${CYBER.a}66` }}>|</span>
            <span style={{ color: CYBER.textBright }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
