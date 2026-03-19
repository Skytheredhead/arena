import { normalizeRoomCode } from '../../utils/roomCode';
import type { RoomView } from '../../state/gameStore';
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
  connectionStatus: string;
  backendConnected: boolean;
  backendPingMs: number | null;
  forceLocalBackend: boolean;
  openRooms: RoomView[];
  connectionError: string | null;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinOpenRoom: (code: string) => void;
  onForceLocalBackendChange: (value: boolean) => void;
}

export function MenuOverlay({
  connected,
  busy,
  nickname,
  roomCode,
  connectionStatus,
  backendConnected,
  backendPingMs,
  forceLocalBackend,
  openRooms,
  connectionError,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onJoinOpenRoom,
  onForceLocalBackendChange
}: MenuOverlayProps): React.JSX.Element {
  if (connected && !connectionError) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
        <div
          className="pointer-events-auto cyber-fade-up"
          style={{
            borderBottom: `1px solid ${CYBER.border}`,
            background: 'rgba(2,11,20,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '12px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px'
          }}
        >
          <div
            style={{
              fontFamily: "'Orbitron',var(--font)",
              color: backendConnected ? CYBER.ok : CYBER.danger,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '3px'
            }}
          >
            {backendConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <PingLabel ping={backendPingMs} />
            <div
              style={{
                fontFamily: CYBER.font,
                color: CYBER.textDim,
                fontSize: '9px',
                letterSpacing: '3px'
              }}
            >
              ROOM CODE
            </div>
            <CyberPanel
              style={{
                padding: '8px 24px',
                fontFamily: "'Orbitron',var(--font)",
                color: CYBER.textBright,
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '8px',
                animation: 'cyberBorderGlow 3s ease-in-out infinite'
              }}
            >
              <span style={{ textShadow: `0 0 16px ${CYBER.a}` }}>{roomCode}</span>
            </CyberPanel>
            <div
              style={{
                color: CYBER.textDim,
                fontSize: '10px',
                letterSpacing: '3px',
                fontFamily: CYBER.font,
                textTransform: 'uppercase'
              }}
            >
              {connectionStatus}
            </div>
          </div>
        </div>
      </div>
    );
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
            <PingLabel ping={backendPingMs} />
          </span>
        </div>
        <div />
      </div>

      <div
        className="pointer-events-auto"
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
              color: CYBER.textDim,
              fontSize: '10px',
              letterSpacing: '8px',
              marginTop: '14px',
              fontFamily: CYBER.font
            }}
          >
            // BROWSER ARENA FPS // ROOM:{roomCode} //
          </div>
        </div>

        <div className="pointer-events-auto" style={{ position: 'relative', zIndex: 2, width: 'min(420px, 92vw)' }}>
          <CyberPanel style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="cyber-label">operator callsign</div>
            <input
              className="cyber-input"
              value={nickname}
              maxLength={16}
              onChange={event => onNicknameChange(event.target.value.slice(0, 16))}
              placeholder="CALLSIGN"
            />
            <div className="cyber-label">room access code</div>
            <input
              className="cyber-input"
              value={roomCode}
              onChange={event => onRoomCodeChange(normalizeRoomCode(event.target.value))}
              placeholder="XK-0000"
              style={{ letterSpacing: '5px', textTransform: 'uppercase' }}
            />
            <div className="cyber-label">backend mode</div>
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
                color: CYBER.textDim,
                fontSize: '9px',
                letterSpacing: '3px',
                fontFamily: CYBER.font,
                textTransform: 'uppercase'
              }}
            >
              <div>Open Rooms</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {openRooms.length === 0 ? (
                  <div style={{ color: `${CYBER.textDim}aa`, letterSpacing: '2px', textTransform: 'none' }}>
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
                        textTransform: 'none',
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
          version <span style={{ color: CYBER.a }}>| v0.1.0</span>
        </div>
        <div style={{ color: CYBER.textDim, fontSize: '10px', letterSpacing: '2px' }}>
          github <span style={{ color: CYBER.a }}>| skytheredhead</span>
        </div>
      </div>
    </div>
  );
}
