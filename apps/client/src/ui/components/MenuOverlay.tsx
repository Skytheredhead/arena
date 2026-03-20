import { useEffect, useState } from 'react';
import { normalizeRoomCode } from '../../utils/roomCode';
import type { BackendTarget } from '../../utils/env';
import type { RoomView } from '../../state/gameStore';
import type { AccountStatsView } from '../../netcode/authClient';
import {
  CYBER,
  CyberButton,
  CyberGlitchText,
  CyberHexBg,
  CyberLine,
  CyberPanel,
  PingLabel
} from '../cyberTheme';

interface MenuOverlayProps {
  connected: boolean;
  busy: boolean;
  nickname: string;
  roomCode: string;
  backendConnected: boolean;
  backendPingMs: number | null;
  backendPingJitterMs: number | null;
  backendTarget: BackendTarget;
  openRooms: RoomView[];
  connectionError: string | null;
  authError: string | null;
  authLoggedIn: boolean;
  authUsername: string | null;
  authStats: AccountStatsView | null;
  authBusy: boolean;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshStats: () => void;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinOpenRoom: (code: string) => void;
  onBackendTargetChange: (target: BackendTarget) => void;
}

const formatDuration = (ticks: number): string => {
  const seconds = Math.floor(ticks / 40);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
};

export function MenuOverlay({
  connected,
  busy,
  nickname,
  roomCode,
  backendConnected,
  backendPingMs,
  backendPingJitterMs,
  backendTarget,
  openRooms,
  connectionError,
  authError,
  authLoggedIn,
  authUsername,
  authStats,
  authBusy,
  onLogin,
  onRegister,
  onLogout,
  onRefreshStats,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onJoinOpenRoom,
  onBackendTargetChange
}: MenuOverlayProps): React.JSX.Element | null {
  const [authPanel, setAuthPanel] = useState<'none' | 'login' | 'register' | 'account' | 'stats'>('none');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: CYBER.textDim, letterSpacing: '1px' }}>BACKEND</span>
            <CyberButton
              small
              primary={backendTarget === 'current'}
              onClick={() => onBackendTargetChange('current')}
              disabled={busy}
            >
              Current
            </CyberButton>
            <CyberButton
              small
              primary={backendTarget === 'arenaapi2'}
              onClick={() => onBackendTargetChange('arenaapi2')}
              disabled={busy}
            >
              arenaapi2.playit.plus
            </CyberButton>
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
            <PingLabel ping={backendPingMs} jitter={backendPingJitterMs} />
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
                {authStats ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontFamily: CYBER.font, fontSize: '11px' }}>
                    {[
                      ['Times Played',     String(authStats.timesPlayed)],
                      ['Total Match Time', formatDuration(authStats.totalPlayTimeTicks)],
                      ['Total Lobby Time', formatDuration(authStats.totalLobbyTimeTicks)],
                      ['Kills / Deaths',   `${authStats.kills} / ${authStats.deaths}`],
                      ['KDR',              authStats.kdr.toFixed(2)],
                      ['Shots Fired',      String(authStats.shotsFired)],
                      ['Shots Hit',        String(authStats.shotsHit)],
                      ['Accuracy',         authStats.shotsFired > 0 ? `${Math.round((authStats.shotsHit / authStats.shotsFired) * 100)}%` : '0%'],
                      ['Damage Dealt',     String(authStats.damageDealt)],
                      ['Damage Taken',     String(authStats.damageTaken)],
                      ['Ammo Pickups',     String(authStats.ammoCollected)],
                      ['Health Pickups',   String(authStats.healthCollected)],
                      ['Chat Messages',    String(authStats.chatMessages)],
                      ['Rooms Created',    String(authStats.roomsCreated)],
                      ['Rooms Joined',     String(authStats.roomsJoined)],
                      ['Matches Started',  String(authStats.matchesStarted)],
                      ['Respawns',         String(authStats.respawns)],
                    ].map(([label, val]) => (
                      <>
                        <div style={{ color: CYBER.textBright }}>{label}</div>
                        <div style={{ color: CYBER.textBright, textAlign: 'right', fontFamily: "'Orbitron',var(--font)", fontSize: '11px' }}>{val}</div>
                      </>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: CYBER.textDim, fontFamily: CYBER.font, fontSize: '11px' }}>No stats recorded yet.</div>
                )}
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
          <CyberPanel style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Callsign */}
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

            {/* Room code */}
            <div className="cyber-label" style={{ animation: 'cyberSlideLeft .35s .4s both', color: CYBER.textBright }}>room access code</div>
            <input
              className="cyber-input"
              value={roomCode}
              onChange={e => onRoomCodeChange(normalizeRoomCode(e.target.value))}
              placeholder="XK-0000"
              style={{ letterSpacing: '5px', textTransform: 'uppercase', animation: 'cyberSlideLeft .35s .42s both' }}
            />

            {/* Error */}
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

            {/* Buttons */}
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

            {/* Open rooms */}
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
        </div>
      </div>

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
