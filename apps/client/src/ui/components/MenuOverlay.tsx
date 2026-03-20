import { useEffect, useState } from 'react';
import { normalizeRoomCode } from '../../utils/roomCode';
import type { RoomView } from '../../state/gameStore';
import type { AccountStatsView } from '../../netcode/authClient';
import {
  CYBER,
  CyberButton,
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
}

const formatDuration = (ticks: number): string => {
  const seconds = Math.floor(ticks / 40);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
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
  onJoinOpenRoom
}: MenuOverlayProps): React.JSX.Element | null {
  const [authPanel, setAuthPanel] = useState<'none' | 'login' | 'register' | 'account' | 'stats'>('none');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  useEffect(() => {
    if (authLoggedIn && (authPanel === 'login' || authPanel === 'register')) {
      setAuthPanel('none');
      return;
    }
    if (!authLoggedIn && (authPanel === 'account' || authPanel === 'stats')) {
      setAuthPanel('none');
    }
  }, [authLoggedIn, authPanel]);

  if (connected && !connectionError) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30"
      style={{ backgroundColor: CYBER.bg, overflow: 'hidden' }}
    >
      <CyberHexBg />

      <div
        className="pointer-events-auto cyber-fade-up"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 12,
          borderBottom: `1px solid ${CYBER.border}`,
          background: 'rgba(2,11,20,0.95)',
          backdropFilter: 'blur(12px)',
          padding: '10px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '14px',
            alignItems: 'center',
            fontFamily: CYBER.font,
            fontSize: '10px',
            letterSpacing: '2px'
          }}
        >
          <span
            style={{
              color: backendConnected ? CYBER.ok : CYBER.danger
            }}
          >
            {backendConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          <span style={{ color: CYBER.textDim, letterSpacing: '1px' }}>
            <PingLabel ping={backendPingMs} jitter={backendPingJitterMs} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {authLoggedIn ? (
            <>
              <CyberButton
                small
                primary
                onClick={() => {
                  setAuthPanel(current => (current === 'account' ? 'none' : 'account'));
                }}
                disabled={authBusy}
              >
                {authUsername ?? 'Account'}
              </CyberButton>
            </>
          ) : (
            <>
              <CyberButton
                primary
                small
                onClick={() => setAuthPanel(authPanel === 'login' ? 'none' : 'login')}
                disabled={authBusy}
              >
                Login
              </CyberButton>
              <CyberButton
                small
                onClick={() => setAuthPanel(authPanel === 'register' ? 'none' : 'register')}
                disabled={authBusy}
              >
                Register
              </CyberButton>
            </>
          )}
        </div>
      </div>

      {authPanel !== 'none' ? (
        <div
          className="pointer-events-auto cyber-fade-up"
          style={{
            position: 'absolute',
            top: '86px',
            right: '24px',
            width: 'min(360px, 92vw)',
            zIndex: 14
          }}
        >
          <CyberPanel style={{ padding: '14px', background: 'rgba(0,10,20,0.92)', backdropFilter: 'blur(8px)' }}>
            {authError ? (
              <CyberPanel
                style={{
                  marginBottom: '8px',
                  padding: '8px 10px',
                  color: CYBER.danger,
                  fontFamily: CYBER.font,
                  fontSize: '11px'
                }}
              >
                {authError}
              </CyberPanel>
            ) : null}
            {authPanel === 'login' ? (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  void onLogin(loginIdentifier.trim(), loginPassword);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div className="cyber-label">login</div>
                <input
                  className="cyber-input"
                  value={loginIdentifier}
                  onChange={event => setLoginIdentifier(event.target.value)}
                  placeholder="EMAIL OR USERNAME"
                />
                <input
                  className="cyber-input"
                  type="password"
                  value={loginPassword}
                  onChange={event => setLoginPassword(event.target.value)}
                  placeholder="PASSWORD"
                />
                <CyberButton
                  primary
                  full
                  type="submit"
                  disabled={authBusy || loginIdentifier.trim().length === 0 || loginPassword.length === 0}
                >
                  {authBusy ? 'Signing In...' : 'Sign In'}
                </CyberButton>
              </form>
            ) : null}

            {authPanel === 'register' ? (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  void onRegister(registerEmail.trim(), registerUsername.trim(), registerPassword);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div className="cyber-label">register</div>
                <input
                  className="cyber-input"
                  value={registerEmail}
                  onChange={event => setRegisterEmail(event.target.value)}
                  placeholder="EMAIL"
                />
                <input
                  className="cyber-input"
                  value={registerUsername}
                  onChange={event => setRegisterUsername(event.target.value)}
                  placeholder="USERNAME"
                />
                <input
                  className="cyber-input"
                  type="password"
                  value={registerPassword}
                  onChange={event => setRegisterPassword(event.target.value)}
                  placeholder="PASSWORD"
                />
                <CyberButton
                  primary
                  full
                  type="submit"
                  disabled={
                    authBusy ||
                    registerEmail.trim().length === 0 ||
                    registerUsername.trim().length === 0 ||
                    registerPassword.length === 0
                  }
                >
                  {authBusy ? 'Creating Account...' : 'Create Account'}
                </CyberButton>
              </form>
            ) : null}

            {authPanel === 'account' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <CyberButton
                  onClick={() => {
                    onRefreshStats();
                    setAuthPanel('stats');
                  }}
                  disabled={authBusy}
                >
                  Stats
                </CyberButton>
                <CyberButton
                  danger
                  onClick={() => {
                    void onLogout();
                    setAuthPanel('none');
                  }}
                  disabled={authBusy}
                >
                  Logout
                </CyberButton>
              </div>
            ) : null}

            {authPanel === 'stats' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="cyber-label">stats · {authUsername ?? 'user'}</div>
                {authStats ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      fontFamily: CYBER.font,
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ color: CYBER.textDim }}>Times Played</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.timesPlayed}</div>
                    <div style={{ color: CYBER.textDim }}>Total Match Time</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{formatDuration(authStats.totalPlayTimeTicks)}</div>
                    <div style={{ color: CYBER.textDim }}>Total Lobby Time</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{formatDuration(authStats.totalLobbyTimeTicks)}</div>
                    <div style={{ color: CYBER.textDim }}>Kills / Deaths</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.kills} / {authStats.deaths}</div>
                    <div style={{ color: CYBER.textDim }}>KDR</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.kdr.toFixed(2)}</div>
                    <div style={{ color: CYBER.textDim }}>Shots Fired</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.shotsFired}</div>
                    <div style={{ color: CYBER.textDim }}>Shots Hit</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.shotsHit}</div>
                    <div style={{ color: CYBER.textDim }}>Damage Dealt</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.damageDealt}</div>
                    <div style={{ color: CYBER.textDim }}>Damage Taken</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.damageTaken}</div>
                    <div style={{ color: CYBER.textDim }}>Ammo Pickups</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.ammoCollected}</div>
                    <div style={{ color: CYBER.textDim }}>Health Pickups</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.healthCollected}</div>
                    <div style={{ color: CYBER.textDim }}>Chat Messages</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.chatMessages}</div>
                    <div style={{ color: CYBER.textDim }}>Rooms Created</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.roomsCreated}</div>
                    <div style={{ color: CYBER.textDim }}>Rooms Joined</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.roomsJoined}</div>
                    <div style={{ color: CYBER.textDim }}>Matches Started</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.matchesStarted}</div>
                    <div style={{ color: CYBER.textDim }}>Respawns</div><div style={{ color: CYBER.textBright, textAlign: 'right' }}>{authStats.respawns}</div>
                  </div>
                ) : (
                  <div style={{ color: CYBER.textDim, fontFamily: CYBER.font, fontSize: '11px' }}>No stats yet.</div>
                )}
                <CyberLine margin="8px 0" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <CyberButton onClick={onRefreshStats} disabled={authBusy}>Stats</CyberButton>
                  <CyberButton danger onClick={() => { void onLogout(); }} disabled={authBusy}>Logout</CyberButton>
                </div>
              </div>
            ) : null}
          </CyberPanel>
        </div>
      ) : null}

      <div
        className="pointer-events-none"
        style={{
          position: 'relative',
          zIndex: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '96px 16px 96px'
        }}
      >
        <div className="cyber-fade-up" style={{ textAlign: 'center', marginBottom: '52px' }}>
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              fontFamily: "'Orbitron',var(--font)",
              fontSize: '92px',
              fontWeight: 900,
              color: CYBER.a,
              letterSpacing: '4px',
              lineHeight: 1,
              textShadow: `0 0 30px ${CYBER.a}, 0 0 60px ${CYBER.a}44`
            }}
          >
            ARENA
          </div>
          <div
            style={{
              color: CYBER.textBright,
              fontSize: '10px',
              letterSpacing: '8px',
              marginTop: '14px',
              fontFamily: CYBER.font,
              textShadow: '0 1px 7px rgba(0,0,0,0.9)'
            }}
          >
            arena fps // made by skytheredhead
          </div>
        </div>

        <div className="pointer-events-auto" style={{ position: 'relative', zIndex: 2, width: 'min(420px, 92vw)' }}>
          <CyberPanel style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="cyber-label" style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>
              operator callsign
            </div>
            <input
              className="cyber-input"
              value={nickname}
              maxLength={16}
              disabled={authLoggedIn}
              onChange={event => onNicknameChange(event.target.value.slice(0, 16))}
              placeholder={authLoggedIn ? 'ACCOUNT USERNAME' : 'CALLSIGN'}
            />
            <div className="cyber-label" style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>
              room access code
            </div>
            <input
              className="cyber-input"
              value={roomCode}
              onChange={event => onRoomCodeChange(normalizeRoomCode(event.target.value))}
              placeholder="XK-0000"
              style={{ letterSpacing: '5px', textTransform: 'uppercase' }}
            />
            {connectionError ? (
              <CyberPanel
                style={{
                  padding: '10px 14px',
                  color: CYBER.danger,
                  fontFamily: CYBER.font,
                  fontSize: '11px',
                  letterSpacing: '1px'
                }}
              >
                {connectionError}
              </CyberPanel>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <CyberButton primary onClick={onCreateRoom} disabled={connected || busy}>
                Create Room
              </CyberButton>
              <CyberButton onClick={onJoinRoom} disabled={connected || busy}>
                Join Room
              </CyberButton>
            </div>
            <CyberLine margin="16px 0 10px" />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                color: CYBER.textBright,
                fontSize: '9px',
                letterSpacing: '3px',
                fontFamily: CYBER.font,
                textTransform: 'uppercase',
                textShadow: '0 1px 7px rgba(0,0,0,0.9)'
              }}
            >
              <div>Open Rooms</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {openRooms.length === 0 ? (
                  <div style={{ color: CYBER.textBright, letterSpacing: '2px', textTransform: 'none', textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>
                    none detected yet
                  </div>
                ) : (
                  openRooms.map(room => (
                    <CyberButton
                      key={room.code}
                      onClick={() => onJoinOpenRoom(room.code)}
                      disabled={busy || room.playerCount >= 5}
                      full
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        letterSpacing: '1.2px',
                        textTransform: 'none'
                      }}
                    >
                      {room.code} · {room.playerCount}/5
                    </CyberButton>
                  ))
                )}
              </div>
            </div>
          </CyberPanel>
        </div>
      </div>

      <div
        className="pointer-events-none cyber-fade-up"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: `1px solid ${CYBER.border}`,
          background: 'rgba(2,11,20,0.95)',
          backdropFilter: 'blur(8px)',
          padding: '8px 32px',
          display: 'flex',
          justifyContent: 'center',
          gap: '28px',
          fontFamily: CYBER.font
        }}
      >
        <div style={{ color: CYBER.textDim, fontSize: '10px', letterSpacing: '2px' }}>
          <span style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>
            version
          </span>{' '}
          <span style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>| v0.1.0</span>
        </div>
        <div style={{ color: CYBER.textDim, fontSize: '10px', letterSpacing: '2px' }}>
          <span style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>
            github
          </span>{' '}
          <span style={{ color: CYBER.textBright, textShadow: '0 1px 7px rgba(0,0,0,0.9)' }}>| skytheredhead</span>
        </div>
      </div>
    </div>
  );
}
