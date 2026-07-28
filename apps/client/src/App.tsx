import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliminatedOverlay } from './ui/components/EliminatedOverlay';
import { HudOverlay } from './ui/components/HudOverlay';
import { MenuOverlay } from './ui/components/MenuOverlay';
import { MobileControls } from './ui/components/MobileControls';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { CYBER, CyberGlobalStyles, CyberScanFx } from './ui/cyberTheme';
import {
  type AccountStatsView,
  type BackendTarget,
  type GraphicsQuality,
  type KillFeedEntry,
  normalizeRoomCode,
  type RoomView,
  type WeaponSlot,
  WEAPON_SLOT_RIFLE,
} from './ui/models';

const openRooms: RoomView[] = [
  { code: 'NOVA-01', playerCount: 2, active: true },
  { code: 'VOID-77', playerCount: 4, active: true },
];

const sampleStats: AccountStatsView = {
  accountId: 1,
  username: 'OPERATOR',
  timesPlayed: 42,
  totalPlayTimeTicks: 441_000,
  totalLobbyTimeTicks: 54_000,
  kills: 286,
  deaths: 173,
  kdr: 1.65,
  shotsFired: 4_820,
  shotsHit: 1_976,
  damageDealt: 29_440,
  damageTaken: 18_720,
  ammoCollected: 91,
  healthCollected: 63,
  chatMessages: 48,
  roomsCreated: 12,
  roomsJoined: 30,
  matchesStarted: 38,
  respawns: 173,
  lastSeenTick: 0,
};

const copyPreviewData = async (): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(
      'Arena UI shell: simulated ping 24 ms, pipeline 8 ms'
    );
    return true;
  } catch {
    return false;
  }
};

export default function App(): React.JSX.Element {
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseView, setPauseView] = useState<'pause' | 'settings' | 'stats'>(
    'pause'
  );
  const [eliminated, setEliminated] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [nickname, setNickname] = useState('OPERATOR');
  const [roomCode, setRoomCode] = useState('NOVA-01');
  const [authUsername, setAuthUsername] = useState<string | null>(null);
  const [graphicsQuality, setGraphicsQuality] =
    useState<GraphicsQuality>('high');
  const [lookSensitivity, setLookSensitivity] = useState(0.0021);
  const [fov, setFov] = useState(80);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [nerdPingsEnabled, setNerdPingsEnabled] = useState(false);
  const [backendTarget, setBackendTarget] =
    useState<BackendTarget>('current');
  const [customBackendHost, setCustomBackendHost] = useState('127.0.0.1');
  const [customBackendPort, setCustomBackendPort] = useState('4789');
  const [customBackendSecure, setCustomBackendSecure] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [selectedWeaponSlot] = useState<WeaponSlot>(WEAPON_SLOT_RIFLE);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [feed, setFeed] = useState<KillFeedEntry[]>(() => {
    const now = performance.now();
    return [
      {
        id: 1,
        kind: 'kill',
        senderNickname: 'GHOST',
        message: 'eliminated VECTOR',
        tick: now,
      },
      {
        id: 2,
        kind: 'chat',
        senderNickname: 'NOVA',
        message: 'UI shell online.',
        tick: now,
      },
    ];
  });

  const connect = useCallback((nextRoom?: string): void => {
    if (nextRoom) setRoomCode(normalizeRoomCode(nextRoom));
    setConnected(true);
    setPaused(false);
    setPauseView('pause');
  }, []);

  const disconnect = useCallback((): void => {
    setConnected(false);
    setPaused(false);
    setEliminated(false);
    setScoreboardOpen(false);
    setPauseView('pause');
  }, []);

  const sendChat = useCallback((): void => {
    const message = chatDraft.trim();
    if (!message) return;
    setFeed((entries) => [
      ...entries.slice(-5),
      {
        id: Date.now(),
        kind: 'chat',
        senderNickname: (authUsername ?? nickname) || 'OPERATOR',
        message,
        tick: performance.now(),
      },
    ]);
    setChatDraft('');
  }, [authUsername, chatDraft, nickname]);

  useEffect(() => {
    const syncMobilePreview = (): void => {
      setMobilePreview(window.matchMedia('(pointer: coarse)').matches);
      setPortrait(window.innerHeight > window.innerWidth);
    };
    syncMobilePreview();
    window.addEventListener('resize', syncMobilePreview);
    return () => window.removeEventListener('resize', syncMobilePreview);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!connected) return;
      if (event.key === 'Escape') {
        setPaused((value) => !value);
        setPauseView('pause');
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        setScoreboardOpen(true);
      }
      if (event.key.toLowerCase() === 'k') setEliminated(true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') setScoreboardOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [connected]);

  const scoreboard = useMemo(
    () => [
      {
        identity: 'local',
        nickname: (authUsername ?? nickname) || 'OPERATOR',
        kills: 12,
        deaths: 4,
        connected: true,
        kdr: 3,
        pingMs: 24,
      },
      {
        identity: 'ghost',
        nickname: 'GHOST',
        kills: 9,
        deaths: 7,
        connected: true,
        kdr: 1.29,
        pingMs: 31,
      },
      {
        identity: 'vector',
        nickname: 'VECTOR',
        kills: 5,
        deaths: 10,
        connected: true,
        kdr: 0.5,
        pingMs: 46,
      },
    ],
    [authUsername, nickname]
  );

  const customBackendLabel = `${customBackendSecure ? 'wss' : 'ws'}://${customBackendHost}:${customBackendPort}`;
  const authStats = authUsername
    ? { ...sampleStats, username: authUsername }
    : null;

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100%',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 50% 42%, rgba(0,245,255,.12), transparent 25%), linear-gradient(145deg,#03101b 0%,#020711 58%,#071723 100%)',
      }}
    >
      <CyberGlobalStyles />
      <CyberScanFx />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0,245,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,.04) 1px,transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage:
            'linear-gradient(to bottom,transparent,black 18%,black 78%,transparent)',
        }}
      />

      {connected && (
        <div
          style={{
            position: 'absolute',
            inset: '12% 8%',
            border: `1px solid ${CYBER.border}`,
            background:
              'linear-gradient(135deg,rgba(0,245,255,.035),rgba(255,47,209,.025))',
            boxShadow: `inset 0 0 100px ${CYBER.a}0d`,
          }}
        />
      )}

      {connected && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 14,
            zIndex: 21,
            color: CYBER.textDim,
            fontFamily: CYBER.font,
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          UI shell · Esc pause · Tab scoreboard · K eliminated
        </div>
      )}

      <HudOverlay
        localIdentity={connected ? 'local' : null}
        health={78}
        ammo={7}
        reserveAmmo={24}
        localKills={12}
        localDeaths={4}
        match={{
          roomCode,
          active: connected,
          tick: 0,
          remainingMs: 96_000,
          round: 2,
        }}
        killFeed={feed}
        scoreboard={scoreboard}
        scoreboardOpen={scoreboardOpen}
        connected={connected}
        pingMs={24}
        pingLowMs={18}
        pingJitterMs={3}
        serverPipelineMs={8}
        serverPipelineLowMs={5}
        nerdPingsEnabled={nerdPingsEnabled}
        hitmarkerVisible={false}
        damageFlashToken={0}
        scoped={false}
        selectedWeaponSlot={selectedWeaponSlot}
        networkReconnecting={false}
        networkReconnectAttempt={0}
        networkReconnectStartedAtMs={null}
        paused={paused}
        chatOpen={chatOpen}
        chatDraft={chatDraft}
        chatBusy={false}
        onChatOpen={() => setChatOpen(true)}
        onChatClose={() => setChatOpen(false)}
        onChatDraftChange={setChatDraft}
        onChatSend={sendChat}
      />

      <MenuOverlay
        connected={connected}
        busy={false}
        nickname={authUsername ?? nickname}
        roomCode={roomCode}
        backendConnected={false}
        backendPingMs={null}
        backendPingLowMs={null}
        backendPingJitterMs={null}
        backendServerPipelineMs={null}
        backendServerPipelineLowMs={null}
        nerdPingsEnabled={nerdPingsEnabled}
        backendTarget={backendTarget}
        customBackendLabel={customBackendLabel}
        customBackendHost={customBackendHost}
        customBackendPort={customBackendPort}
        customBackendSecure={customBackendSecure}
        openRooms={openRooms}
        connectionError={null}
        authError={null}
        authLoggedIn={authUsername !== null}
        authUsername={authUsername}
        authStats={authStats}
        authBusy={false}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        onLogin={(identifier) => {
          setAuthUsername(identifier.trim().slice(0, 16) || 'OPERATOR');
          return Promise.resolve();
        }}
        onRegister={(_email, username) => {
          setAuthUsername(username.trim().slice(0, 16) || 'OPERATOR');
          return Promise.resolve();
        }}
        onLogout={() => {
          setAuthUsername(null);
          return Promise.resolve();
        }}
        onRefreshStats={() => undefined}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onNerdPingsChange={setNerdPingsEnabled}
        hasServerPings
        onCopyServerPings={copyPreviewData}
        onNicknameChange={setNickname}
        onRoomCodeChange={(value) => setRoomCode(normalizeRoomCode(value))}
        onCreateRoom={() => connect()}
        onJoinRoom={() => connect()}
        onJoinOpenRoom={connect}
        onBackendTargetChange={setBackendTarget}
        onCustomBackendHostChange={setCustomBackendHost}
        onCustomBackendPortChange={setCustomBackendPort}
        onCustomBackendSecureChange={setCustomBackendSecure}
        onUseCustomBackend={() => setBackendTarget('custom')}
      />

      <PauseOverlay
        visible={paused && connected}
        roomCode={roomCode}
        view={pauseView}
        authLoggedIn={authUsername !== null}
        authUsername={authUsername}
        authStats={authStats}
        authBusy={false}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        nerdPingsEnabled={nerdPingsEnabled}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onNerdPingsChange={setNerdPingsEnabled}
        hasServerPings
        onCopyServerPings={copyPreviewData}
        onOpenSettings={() => setPauseView('settings')}
        onOpenStats={() => setPauseView('stats')}
        onRefreshStats={() => undefined}
        onCloseSettings={() => setPauseView('pause')}
        onResume={() => setPaused(false)}
        onDisconnect={disconnect}
      />

      <EliminatedOverlay
        visible={eliminated && connected}
        onRespawn={() => setEliminated(false)}
      />

      <MobileControls
        visible={connected && mobilePreview}
        portrait={portrait}
        onMoveChange={() => undefined}
        onLookChange={() => undefined}
        onFireChange={() => undefined}
      />
    </main>
  );
}
