import { useEffect, useRef, useState } from 'react';
import {
  WEAPON_SLOT_SHOTGUN,
  WEAPON_SLOT_SNIPER,
  type KillFeedEntry,
  type MatchView,
  type ScoreRow,
  type WeaponSlot,
} from '../models';
import {
  CYBER,
  CyberButton,
  CyberCrosshair,
  CyberPanel,
  CyberSegBar,
  PingLabel,
} from '../cyberTheme';
import {
  getRuntimeHudFrame,
  subscribeRuntimeHudFrame,
} from '../runtimeHudFrame';

interface HudOverlayProps {
  localIdentity: string | null;
  health: number;
  ammo: number;
  reserveAmmo: number;
  clipSize: number;
  reloading: boolean;
  reloadProgress: number;
  localKills: number;
  localDeaths: number;
  match: MatchView | null;
  killFeed: KillFeedEntry[];
  scoreboard: Array<ScoreRow & { kdr: number; pingMs: number | null }>;
  scoreboardOpen: boolean;
  connected: boolean;
  pingMs: number | null;
  pingLowMs: number | null;
  pingJitterMs: number | null;
  serverPipelineMs: number | null;
  serverPipelineLowMs: number | null;
  nerdPingsEnabled: boolean;
  hitmarkerVisible: boolean;
  damageFlashToken: number;
  scoped: boolean;
  selectedWeaponSlot: WeaponSlot;
  networkReconnecting: boolean;
  networkReconnectAttempt: number;
  networkReconnectStartedAtMs: number | null;
  paused: boolean;
  chatOpen: boolean;
  chatDraft: string;
  chatBusy: boolean;
  chatError: string | null;
  onChatOpen: () => void;
  onChatClose: () => void;
  onChatDraftChange: (value: string) => void;
  onChatSend: () => void;
}

function FeedItem({
  entry,
  index,
  nowMs,
}: {
  entry: KillFeedEntry;
  index: number;
  nowMs: number;
}): React.JSX.Element | null {
  const age = nowMs - entry.tick;
  const fadeStart = 8_500;
  const fadeEnd = 10_000;
  const opacity =
    age < fadeStart
      ? 1
      : age > fadeEnd
        ? 0
        : 1 - (age - fadeStart) / (fadeEnd - fadeStart);
  if (opacity <= 0) return null;

  const isKill = entry.kind === 'kill';
  return (
    <div
      style={{
        background: isKill ? `${CYBER.danger}12` : `${CYBER.a}08`,
        border: `1px solid ${isKill ? `${CYBER.danger}44` : CYBER.border}`,
        padding: '4px 8px',
        display: 'flex',
        gap: '6px',
        alignItems: 'baseline',
        fontFamily: CYBER.font,
        fontSize: '11px',
        lineHeight: 1.3,
        opacity,
        transition: 'opacity 0.6s ease',
        animation: `cyberSlideRight .25s ${index * 0.04}s cubic-bezier(.16,1,.3,1) both`,
        backdropFilter: 'blur(4px)',
      }}
    >
      <span
        style={{
          color: isKill ? CYBER.a2 : CYBER.a,
          fontWeight: 700,
          textShadow: `0 0 6px ${isKill ? CYBER.a2 : CYBER.a}88`,
        }}
      >
        {entry.senderNickname}
      </span>
      <span style={{ color: CYBER.textBright }}>{entry.message}</span>
    </div>
  );
}

function SniperCooldownFill({
  glowPx,
}: {
  glowPx: number;
}): React.JSX.Element {
  const fillRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () =>
      subscribeRuntimeHudFrame((frame) => {
        const fill = fillRef.current;
        if (!fill) return;
        const clamped = Math.max(0, Math.min(1, frame.sniperCooldownReady));
        const readyColor = clamped >= 1 ? CYBER.ok : CYBER.warn;
        fill.style.height = `${Math.round(clamped * 100)}%`;
        fill.style.background = readyColor;
        fill.style.boxShadow = `0 0 ${glowPx}px ${readyColor}`;
      }),
    [glowPx]
  );
  const initialReady = Math.max(
    0,
    Math.min(1, getRuntimeHudFrame().sniperCooldownReady)
  );
  const initialColor = initialReady >= 1 ? CYBER.ok : CYBER.warn;

  return (
    <div
      ref={fillRef}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `${Math.round(initialReady * 100)}%`,
        background: initialColor,
        boxShadow: `0 0 ${glowPx}px ${initialColor}`,
        transition: 'height 0.06s linear',
      }}
    />
  );
}

export function HudOverlay({
  localIdentity,
  health,
  ammo,
  reserveAmmo,
  clipSize,
  reloading,
  reloadProgress,
  localKills,
  localDeaths,
  match,
  killFeed,
  scoreboard,
  scoreboardOpen,
  connected,
  pingMs,
  pingLowMs,
  pingJitterMs,
  serverPipelineMs,
  serverPipelineLowMs,
  nerdPingsEnabled,
  hitmarkerVisible,
  damageFlashToken,
  scoped,
  selectedWeaponSlot,
  networkReconnecting,
  networkReconnectAttempt,
  networkReconnectStartedAtMs,
  paused,
  chatOpen,
  chatDraft,
  chatBusy,
  chatError,
  onChatOpen,
  onChatClose,
  onChatDraftChange,
  onChatSend,
}: HudOverlayProps): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const visibleFeed = killFeed.filter((e) => nowMs - e.tick < 10_000);
  const pilotCount = Math.max(scoreboard.length, connected ? 1 : 0);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const prevAmmo = useRef(ammo);
  const [ammoTick, setAmmoTick] = useState(0);

  useEffect(() => {
    if (chatOpen) chatInputRef.current?.focus();
  }, [chatOpen]);

  useEffect(() => {
    if (prevAmmo.current !== ammo) {
      prevAmmo.current = ammo;
      setAmmoTick((t) => t + 1);
    }
  }, [ammo]);

  const displayedHealth = Math.max(0, Math.min(100, Math.round(health)));
  const displayedAmmo = Math.max(
    0,
    Math.min(clipSize, Math.round(ammo))
  );
  const displayedReserveAmmo = Math.max(0, Math.round(reserveAmmo));
  const hpLow = displayedHealth < 30;
  const hpCritical = displayedHealth < 15;
  const hpColor = hpCritical ? CYBER.danger : hpLow ? CYBER.warn : CYBER.ok;
  const weaponName =
    selectedWeaponSlot === WEAPON_SLOT_SNIPER
      ? 'LONGSHOT SNIPER'
      : selectedWeaponSlot === WEAPON_SLOT_SHOTGUN
        ? 'BREACH SHOTGUN'
        : 'PULSE RIFLE';
  const reconnectElapsedSeconds =
    networkReconnecting && networkReconnectStartedAtMs != null
      ? Math.max(0, (nowMs - networkReconnectStartedAtMs) / 1000)
      : 0;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((match?.remainingMs ?? 0) / 1000)
  );
  const matchClock = `${Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: paused ? 40 : 20 }}
    >
      {!paused && (
        <>
          <div
            aria-hidden
            className="cyber-hud-vignette"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              pointerEvents: 'none',
              background: `radial-gradient(ellipse at center,transparent 40%,${CYBER.bg}cc 100%)`,
            }}
          />

          {hpLow && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 3,
                pointerEvents: 'none',
                background: `radial-gradient(ellipse at center,transparent 30%,${CYBER.danger}33 100%)`,
                animation: 'cyberPulse 1.4s ease-in-out infinite',
              }}
            />
          )}

          {damageFlashToken > 0 && (
            <div
              key={damageFlashToken}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 12,
                pointerEvents: 'none',
                background:
                  'radial-gradient(ellipse at center,rgba(255,32,32,0.02) 28%,rgba(255,32,32,0.18) 62%,rgba(100,0,0,0.55) 100%)',
                animation:
                  'cyberDamageFlash .55s cubic-bezier(.16,1,.3,1) both',
              }}
            />
          )}
        </>
      )}

      <CyberCrosshair
        hitmarkerVisible={hitmarkerVisible}
        scoped={scoped}
      />

      {selectedWeaponSlot === WEAPON_SLOT_SNIPER && scoped && !paused && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 19,
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at center, transparent 0 31vmin, rgba(0,0,0,0.9) 31.2vmin 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              width: '62vmin',
              height: '62vmin',
              border: '2px solid rgba(210,244,255,0.35)',
              borderRadius: '50%',
              boxShadow: '0 0 36px rgba(0,245,255,0.16) inset',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '1px',
              height: '62vmin',
              background: 'rgba(210,244,255,0.24)',
              transform: 'translate(-50%,-50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '62vmin',
              height: '1px',
              background: 'rgba(210,244,255,0.24)',
              transform: 'translate(-50%,-50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 'calc(50% + 31vmin + 14px)',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '98px',
                border: `1px solid ${CYBER.border}`,
                background: `${CYBER.bg}aa`,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: `0 0 12px ${CYBER.a}33`,
              }}
            >
              <SniperCooldownFill glowPx={10} />
            </div>
          </div>
        </div>
      )}

      {!paused && networkReconnecting && (
        <div
          className="cyber-fade-up"
          style={{
            position: 'absolute',
            top: '14px',
            left: '14px',
            zIndex: 18,
          }}
        >
          <CyberPanel
            style={{
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              border: `1px solid ${CYBER.warn}`,
              background: 'rgba(30,18,0,0.78)',
              boxShadow: `0 0 16px ${CYBER.warn}44`,
            }}
          >
            <div
              aria-hidden
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: `2px solid ${CYBER.warn}66`,
                borderTopColor: CYBER.warn,
                animation: 'cyberSpin 0.85s linear infinite',
              }}
            />
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              <span
                style={{
                  color: CYBER.warn,
                  fontFamily: "'Orbitron',var(--font)",
                  fontSize: '11px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                Disconnected
              </span>
              <span
                style={{
                  color: CYBER.textBright,
                  fontFamily: CYBER.font,
                  fontSize: '9px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}
              >
                Retrying... ({reconnectElapsedSeconds.toFixed(1)}s / attempt{' '}
                {Math.max(1, networkReconnectAttempt)})
              </span>
            </div>
          </CyberPanel>
        </div>
      )}

      {!paused && (
        <div
          className="cyber-fade-up"
          style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <CyberPanel
            style={{
              padding: '7px 22px',
              textAlign: 'center',
              backdropFilter: 'blur(12px)',
              minWidth: '150px',
            }}
          >
            <div
              style={{
                color: match?.phase === 'intermission' ? CYBER.warn : CYBER.a,
                fontFamily: "'Orbitron',var(--font)",
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '3px',
                textShadow: `0 0 10px ${CYBER.a}66`,
              }}
            >
              {matchClock}
            </div>
            <div
              style={{
                color: CYBER.text,
                fontFamily: CYBER.font,
                fontSize: '9px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
              }}
            >
              {match?.phase === 'intermission'
                ? 'Intermission'
                : `Round ${match?.round ?? 1} · First to 30`}
            </div>
          </CyberPanel>
        </div>
      )}

      {!paused && (
        <div
          className="cyber-fade-up"
          style={{
            position: 'absolute',
            top: networkReconnecting ? '70px' : '14px',
            left: '14px',
            zIndex: 10,
          }}
        >
          <CyberPanel
            style={{
              padding: '8px 24px',
              display: 'flex',
              gap: '28px',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(12px)',
              minWidth: '220px',
            }}
          >
            <div style={{ textAlign: 'center', width: '72px' }}>
              <div
                style={{
                  fontFamily: "'Orbitron',var(--font)",
                  color: CYBER.textBright,
                  fontSize: '20px',
                  fontWeight: 700,
                  textShadow: `0 0 10px ${CYBER.textBright}66`,
                  animation: 'cyberNumberTick .15s ease both',
                }}
              >
                {localKills}
              </div>
              <div
                style={{
                  color: CYBER.textBright,
                  fontSize: '9px',
                  letterSpacing: '3px',
                  fontFamily: CYBER.font,
                }}
              >
                KILLS
              </div>
            </div>
            <div
              style={{ width: '1px', height: '28px', background: CYBER.border }}
            />
            <div style={{ textAlign: 'center', width: '72px' }}>
              <div
                style={{
                  fontFamily: "'Orbitron',var(--font)",
                  color: CYBER.textBright,
                  fontSize: '20px',
                  fontWeight: 700,
                  textShadow: `0 0 10px ${CYBER.textBright}66`,
                }}
              >
                {localDeaths}
              </div>
              <div
                style={{
                  color: CYBER.textBright,
                  fontSize: '9px',
                  letterSpacing: '3px',
                  fontFamily: CYBER.font,
                }}
              >
                DEATHS
              </div>
            </div>
          </CyberPanel>
        </div>
      )}

      <div
        className="cyber-slide-right"
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          zIndex: 60,
          width: 'min(340px,45vw)',
          pointerEvents: 'auto',
        }}
      >
        <CyberPanel
          style={{
            padding: '8px',
            background: 'rgba(0,10,20,0.85)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              color: CYBER.textBright,
              fontFamily: CYBER.font,
              fontSize: '10px',
              letterSpacing: '3px',
              marginBottom: '6px',
              textTransform: 'uppercase',
              textShadow: `0 0 6px ${CYBER.textBright}44`,
            }}
          >
            Chat
          </div>
          <div
            style={{
              maxHeight: '170px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              justifyContent: 'flex-end',
            }}
          >
            {visibleFeed.map((entry, i) => (
              <FeedItem key={entry.id} entry={entry} index={i} nowMs={nowMs} />
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onChatSend();
            }}
            style={{ marginTop: '8px', display: 'flex', gap: '6px' }}
          >
            <input
              ref={chatInputRef}
              className="cyber-input"
              value={chatDraft}
              onFocus={onChatOpen}
              onBlur={onChatClose}
              onChange={(e) => onChatDraftChange(e.target.value.slice(0, 160))}
              placeholder={
                chatOpen ? 'Type and press Enter…' : 'Press / to chat'
              }
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '11px',
                minHeight: '30px',
              }}
            />
            <CyberButton
              small
              primary
              onClick={onChatSend}
              disabled={chatBusy || chatDraft.trim().length === 0}
            >
              Send
            </CyberButton>
          </form>
          {chatError && (
            <div
              role="alert"
              style={{
                marginTop: '6px',
                color: CYBER.danger,
                fontFamily: CYBER.font,
                fontSize: '9px',
                letterSpacing: '1px',
              }}
            >
              {chatError}
            </div>
          )}
        </CyberPanel>
      </div>

      {!paused && (
        <>
          <div
            className="cyber-slide-left"
            style={{
              position: 'absolute',
              bottom: '80px',
              left: '24px',
              zIndex: 10,
            }}
          >
            <CyberPanel
              style={{
                padding: '8px 12px',
                backdropFilter: 'blur(12px)',
                minWidth: '136px',
                boxShadow: hpCritical
                  ? `0 0 20px ${CYBER.danger}44`
                  : hpLow
                    ? `0 0 12px ${CYBER.warn}33`
                    : undefined,
                border: `1px solid ${hpLow ? (hpCritical ? CYBER.danger : CYBER.warn) : CYBER.border}`,
                transition: 'border-color 0.5s, box-shadow 0.5s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '5px',
                  alignItems: 'baseline',
                }}
              >
                <div
                  style={{
                    color: CYBER.text,
                    fontSize: '9px',
                    letterSpacing: '3px',
                    fontFamily: CYBER.font,
                  }}
                >
                  HP
                </div>
                <div
                  style={{
                    fontFamily: "'Orbitron',var(--font)",
                    color: hpColor,
                    fontSize: '18px',
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: `0 0 8px ${hpColor}66`,
                    transition: 'color 0.4s',
                    animation: hpCritical
                      ? 'cyberPulse 0.8s ease-in-out infinite'
                      : undefined,
                  }}
                >
                  {displayedHealth}
                </div>
              </div>
              <CyberSegBar
                value={displayedHealth}
                max={100}
                color={hpColor}
                height={4}
                segments={4}
              />
            </CyberPanel>
          </div>

          <div
            className="cyber-slide-right"
            style={{
              position: 'absolute',
              bottom: '80px',
              right: '24px',
              zIndex: 10,
              textAlign: 'right',
            }}
          >
            <CyberPanel
              style={{ padding: '16px 20px', backdropFilter: 'blur(12px)' }}
            >
              <div
                style={{
                  color: CYBER.textBright,
                  fontSize: '10px',
                  letterSpacing: '3px',
                  fontFamily: CYBER.font,
                  marginBottom: '6px',
                  textAlign: 'right',
                }}
              >
                {weaponName}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  key={ammoTick}
                  style={{
                    fontFamily: "'Orbitron',var(--font)",
                    fontSize: '56px',
                    fontWeight: 900,
                    color:
                      displayedAmmo < 10
                        ? CYBER.danger
                        : displayedAmmo < 20
                          ? CYBER.warn
                          : CYBER.textBright,
                    lineHeight: 1,
                    textShadow: `0 0 20px ${CYBER.a}44`,
                    animation: 'cyberNumberTick .15s ease both',
                    transition: 'color 0.3s',
                  }}
                >
                  {displayedAmmo}
                </div>
                <div
                  style={{
                    fontFamily: CYBER.font,
                    color: CYBER.textBright,
                    fontSize: '22px',
                    lineHeight: 1,
                  }}
                >
                  /{displayedReserveAmmo}
                </div>
                {selectedWeaponSlot === WEAPON_SLOT_SNIPER && !scoped && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginLeft: '4px',
                    }}
                  >
                    <div
                      style={{
                        width: '6px',
                        height: '44px',
                        border: `1px solid ${CYBER.border}`,
                        background: `${CYBER.bg}aa`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <SniperCooldownFill glowPx={8} />
                    </div>
                  </div>
                )}
              </div>
              {reloading && (
                <div
                  style={{
                    marginTop: '8px',
                    color: CYBER.warn,
                    fontFamily: CYBER.font,
                    fontSize: '9px',
                    letterSpacing: '2px',
                  }}
                >
                  RELOADING · {Math.round(Math.max(0, Math.min(1, reloadProgress)) * 100)}%
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: '2px',
                  justifyContent: 'flex-end',
                  marginTop: '8px',
                  flexWrap: 'wrap',
                  maxWidth: '120px',
                  marginLeft: 'auto',
                }}
              >
                {Array.from({ length: clipSize }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '5px',
                      height: '10px',
                      background:
                        i < displayedAmmo ? CYBER.a : `${CYBER.textDim}33`,
                      boxShadow:
                        i < displayedAmmo ? `0 0 3px ${CYBER.a}88` : undefined,
                      transition: 'background 0.15s, box-shadow 0.15s',
                    }}
                  />
                ))}
              </div>
            </CyberPanel>
          </div>

          <div
            className="cyber-fade-up"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              background: 'rgba(2,11,20,0.88)',
              backdropFilter: 'blur(8px)',
              borderTop: `1px solid ${CYBER.border}`,
              padding: '8px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: CYBER.font,
              fontSize: '10px',
              letterSpacing: '2px',
            }}
          >
            <span style={{ color: connected ? CYBER.ok : CYBER.danger }}>
              {connected ? 'IN MATCH' : 'OFFLINE'}
            </span>
            <div style={{ display: 'flex', gap: '24px' }}>
              <span style={{ color: CYBER.ok }}>
                {connected ? 'AUTHORITATIVE' : 'OFFLINE'}
              </span>
              <PingLabel
                ping={pingMs}
                jitter={pingJitterMs}
                showNerd={nerdPingsEnabled}
                pingLowMs={pingLowMs}
                serverPipelineMs={serverPipelineMs}
                serverPipelineLowMs={serverPipelineLowMs}
              />
              <span style={{ color: CYBER.textBright }}>
                {pilotCount} PILOTS
              </span>
            </div>
            <span
              style={{ color: CYBER.a, textShadow: `0 0 6px ${CYBER.a}88` }}
            >
              {match?.roomCode ?? 'NO ROOM'}
            </span>
          </div>

          {scoreboardOpen && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 25,
                background: 'rgba(2,11,20,0.8)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <div
                className="cyber-scale-in"
                style={{
                  width: 'min(1080px,96vw)',
                  maxHeight: '86vh',
                  overflow: 'hidden',
                }}
              >
                <CyberPanel
                  style={{
                    overflow: 'hidden',
                    boxShadow: `0 0 40px ${CYBER.a}18`,
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(2,11,20,0.97)',
                      backdropFilter: 'blur(12px)',
                      borderBottom: `1px solid ${CYBER.border}`,
                      padding: '16px 28px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Orbitron',var(--font)",
                        color: CYBER.a,
                        fontSize: '14px',
                        fontWeight: 700,
                        letterSpacing: '5px',
                        textShadow: `0 0 12px ${CYBER.a}88`,
                      }}
                    >
                      SCOREBOARD
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '36px',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            color: CYBER.ok,
                            fontSize: '28px',
                            fontFamily: "'Orbitron',var(--font)",
                            fontWeight: 700,
                            textShadow: `0 0 10px ${CYBER.ok}88`,
                          }}
                        >
                          {localKills}
                        </div>
                        <div
                          style={{
                            color: CYBER.textDim,
                            fontSize: '8px',
                            letterSpacing: '4px',
                            fontFamily: CYBER.font,
                          }}
                        >
                          KILLS
                        </div>
                      </div>
                      <div
                        style={{
                          color: CYBER.textDim,
                          fontFamily: CYBER.font,
                          fontSize: '18px',
                        }}
                      >
                        :
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            color: CYBER.danger,
                            fontSize: '28px',
                            fontFamily: "'Orbitron',var(--font)",
                            fontWeight: 700,
                            textShadow: `0 0 10px ${CYBER.danger}66`,
                          }}
                        >
                          {localDeaths}
                        </div>
                        <div
                          style={{
                            color: CYBER.textDim,
                            fontSize: '8px',
                            letterSpacing: '4px',
                            fontFamily: CYBER.font,
                          }}
                        >
                          DEATHS
                        </div>
                      </div>
                      <div
                        style={{
                          color: CYBER.textDim,
                          fontSize: '12px',
                          fontFamily: CYBER.font,
                          marginLeft: '12px',
                          letterSpacing: '2px',
                        }}
                      >
                        LIVE
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      borderBottom: `1px solid ${CYBER.a}44`,
                      background: 'rgba(0,245,255,0.03)',
                    }}
                  >
                    {[
                      { w: 40, label: '#' },
                      { flex: true, label: 'PLAYER' },
                      { w: 64, label: 'K', color: CYBER.ok },
                      { w: 64, label: 'D', color: CYBER.danger },
                      { w: 88, label: 'KDR', color: CYBER.a },
                      { w: 64, label: 'PING' },
                    ].map((col) => (
                      <div
                        key={col.label}
                        style={{
                          ...(col.flex
                            ? { flex: 1, paddingLeft: '8px' }
                            : { width: `${col.w}px`, textAlign: 'center' }),
                          padding: '10px 8px',
                          color: col.color ?? CYBER.textDim,
                          fontSize: '9px',
                          letterSpacing: '3px',
                          fontFamily: CYBER.font,
                          textTransform: 'uppercase',
                        }}
                      >
                        {col.label}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      maxHeight: '65vh',
                      overflow: 'auto',
                      paddingBottom: '24px',
                    }}
                  >
                    {scoreboard.map((player, i) => (
                      <div
                        key={player.identity}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          borderBottom: `1px solid ${CYBER.border}`,
                          background: i === 0 ? `${CYBER.a}0a` : 'transparent',
                          boxShadow:
                            i === 0 ? `inset 3px 0 0 ${CYBER.a}` : undefined,
                          animation: `cyberSlideLeft .3s ${i * 0.04}s cubic-bezier(.16,1,.3,1) both`,
                        }}
                      >
                        <div
                          style={{
                            width: '40px',
                            padding: '13px 8px',
                            color: CYBER.textDim,
                            fontSize: '12px',
                            textAlign: 'center',
                            fontFamily: CYBER.font,
                          }}
                        >
                          {i + 1}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            padding: '13px 8px',
                            color: i === 0 ? CYBER.textBright : CYBER.text,
                            fontWeight: i === 0 ? 'bold' : 'normal',
                            fontSize: '13px',
                            letterSpacing: '1px',
                            fontFamily: CYBER.font,
                          }}
                        >
                          {player.nickname}
                          {player.identity === localIdentity && (
                            <span
                              style={{
                                color: CYBER.a,
                                fontSize: '9px',
                                marginLeft: '8px',
                                letterSpacing: '2px',
                                animation: 'cyberPulse 2s infinite',
                              }}
                            >
                              ◀ YOU
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            width: '64px',
                            textAlign: 'center',
                            padding: '13px 8px',
                            fontFamily: "'Orbitron',var(--font)",
                            color: CYBER.ok,
                            fontWeight: 700,
                            fontSize: '15px',
                            textShadow: `0 0 8px ${CYBER.ok}66`,
                          }}
                        >
                          {player.kills}
                        </div>
                        <div
                          style={{
                            width: '64px',
                            textAlign: 'center',
                            padding: '13px 8px',
                            fontFamily: "'Orbitron',var(--font)",
                            color: CYBER.danger,
                            fontWeight: 700,
                            fontSize: '15px',
                          }}
                        >
                          {player.deaths}
                        </div>
                        <div
                          style={{
                            width: '88px',
                            textAlign: 'center',
                            padding: '13px 8px',
                            fontFamily: "'Orbitron',var(--font)",
                            color: CYBER.a,
                            fontWeight: 700,
                            fontSize: '15px',
                            textShadow: `0 0 8px ${CYBER.a}88`,
                          }}
                        >
                          {player.kdr.toFixed(2)}
                        </div>
                        <div
                          style={{
                            width: '64px',
                            textAlign: 'center',
                            padding: '13px 8px',
                          }}
                        >
                          <PingLabel ping={player.pingMs} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CyberPanel>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
