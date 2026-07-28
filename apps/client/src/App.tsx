import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { SpacetimeArenaClient } from './app/SpacetimeArenaClient';
import {
  ArenaRuntime,
  createInitialRuntimeSnapshot,
  type RuntimeSnapshot,
} from './runtime';
import { resolveSpacetimeUri } from './netcode/endpoint';
import { EliminatedOverlay } from './ui/components/EliminatedOverlay';
import { HudOverlay } from './ui/components/HudOverlay';
import { MenuOverlay } from './ui/components/MenuOverlay';
import { MobileControls } from './ui/components/MobileControls';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { PointerLockOverlay } from './ui/components/PointerLockOverlay';
import { ResultsOverlay } from './ui/components/ResultsOverlay';
import { CyberGlobalStyles, CyberScanFx } from './ui/cyberTheme';
import {
  type BackendTarget,
  type GraphicsQuality,
  type KillFeedEntry,
  type MatchView,
  normalizeRoomCode,
} from './ui/models';

const DEFAULT_DATABASE =
  import.meta.env.VITE_SPACETIME_DATABASE?.trim() || 'arena-fps-slice';
const PRIMARY_ENDPOINT = resolveSpacetimeUri({
  configuredUri: import.meta.env.VITE_SPACETIME_URI,
  currentLocation: window.location,
});
const FALLBACK_ENDPOINT = resolveSpacetimeUri({
  configuredUri:
    import.meta.env.VITE_SPACETIME_FALLBACK_URI || PRIMARY_ENDPOINT,
});
const INITIAL_RUNTIME_SNAPSHOT = createInitialRuntimeSnapshot();
const NOOP_SUBSCRIBE = (): (() => void) => () => undefined;

const ticksUntil = (futureTick: number, currentTick: number): number => {
  const delta = (futureTick - currentTick) >>> 0;
  return delta > 0x7fff_ffff ? 0 : delta;
};

const customEndpoint = (
  host: string,
  port: string,
  secure: boolean
): string => {
  const normalizedHost = host.trim();
  const normalizedPort = port.trim();
  const portNumber = Number(normalizedPort);
  if (
    !/^[a-z0-9.-]+$/iu.test(normalizedHost) ||
    normalizedHost.includes('..') ||
    !Number.isInteger(portNumber) ||
    portNumber < 1 ||
    portNumber > 65_535
  ) {
    return PRIMARY_ENDPOINT;
  }
  return `${secure ? 'https' : 'http'}://${normalizedHost}:${normalizedPort}`;
};

export default function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runtime, setRuntime] = useState<ArenaRuntime | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseView, setPauseView] = useState<
    'pause' | 'settings' | 'stats'
  >('pause');
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
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
  const [mobileControls, setMobileControls] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hitmarkerVisible, setHitmarkerVisible] = useState(false);

  const endpointUri = useMemo(() => {
    if (backendTarget === 'arenaapi2') return FALLBACK_ENDPOINT;
    if (backendTarget === 'custom') {
      return customEndpoint(
        customBackendHost,
        customBackendPort,
        customBackendSecure
      );
    }
    return PRIMARY_ENDPOINT;
  }, [
    backendTarget,
    customBackendHost,
    customBackendPort,
    customBackendSecure,
  ]);

  const client = useMemo(
    () =>
      new SpacetimeArenaClient({
        endpointUri,
        database: DEFAULT_DATABASE,
      }),
    [endpointUri]
  );
  const backend = useSyncExternalStore(
    client.ui.subscribe,
    client.ui.getSnapshot,
    client.ui.getSnapshot
  );
  const runtimeSnapshot: RuntimeSnapshot = useSyncExternalStore(
    runtime?.store.subscribe ?? NOOP_SUBSCRIBE,
    runtime?.store.getSnapshot ?? (() => INITIAL_RUNTIME_SNAPSHOT),
    () => INITIAL_RUNTIME_SNAPSHOT
  );

  const handlePauseRequested = useCallback(() => {
    setPaused((value) => !value);
    setPauseView('pause');
    setChatOpen(false);
  }, []);
  const handleChatRequested = useCallback(() => {
    setChatOpen(true);
  }, []);

  useEffect(() => {
    client.connect();
    return () => client.dispose();
  }, [client]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nextRuntime = new ArenaRuntime({
      canvas,
      transport: client,
      onPauseRequested: handlePauseRequested,
      onScoreboardChange: setScoreboardOpen,
      onChatRequested: handleChatRequested,
    });
    setRuntime(nextRuntime);
    nextRuntime.start();
    return () => {
      nextRuntime.dispose();
      setRuntime((current) => (current === nextRuntime ? null : current));
    };
  }, [client, handleChatRequested, handlePauseRequested]);

  useEffect(() => {
    runtime?.setQuality(graphicsQuality);
  }, [graphicsQuality, runtime]);
  useEffect(() => {
    runtime?.setSensitivity(lookSensitivity);
  }, [lookSensitivity, runtime]);
  useEffect(() => {
    runtime?.setFov(fov);
  }, [fov, runtime]);
  useEffect(() => {
    runtime?.setVolumes(sfxVolume, musicVolume);
  }, [musicVolume, runtime, sfxVolume]);
  useEffect(() => {
    runtime?.setPaused(paused);
  }, [paused, runtime]);
  useEffect(() => {
    runtime?.setInputCaptured(chatOpen);
  }, [chatOpen, runtime]);

  useEffect(() => {
    if (backend.currentRoomCode) setRoomCode(backend.currentRoomCode);
  }, [backend.currentRoomCode]);

  useEffect(() => {
    if (backend.localPlayerId) return;
    setPaused(false);
    setPauseView('pause');
    setScoreboardOpen(false);
    setChatOpen(false);
  }, [backend.localPlayerId]);

  useEffect(() => {
    if (runtimeSnapshot.hitmarkerToken === 0) return;
    setHitmarkerVisible(true);
    const timer = window.setTimeout(() => setHitmarkerVisible(false), 120);
    return () => window.clearTimeout(timer);
  }, [runtimeSnapshot.hitmarkerToken]);

  useEffect(() => {
    const updateLayout = (): void => {
      setMobileControls(window.matchMedia('(pointer: coarse)').matches);
      setPortrait(window.innerHeight > window.innerWidth);
    };
    const updateFullscreen = (): void => {
      setFullscreen(document.fullscreenElement != null);
    };
    updateLayout();
    updateFullscreen();
    window.addEventListener('resize', updateLayout);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      window.removeEventListener('resize', updateLayout);
      document.removeEventListener('fullscreenchange', updateFullscreen);
    };
  }, []);

  const connected = backend.localPlayerId != null;
  const displayNickname = backend.authUsername ?? nickname;
  const localScore = runtimeSnapshot.scoreboard.find(
    (row) => row.playerId === runtimeSnapshot.localPlayerId
  );
  const scoreboard = useMemo(
    () =>
      runtimeSnapshot.scoreboard.map((row) => ({
        identity: row.playerId,
        nickname: row.nickname,
        kills: row.kills,
        deaths: row.deaths,
        connected: row.connected,
        isBot: row.isBot,
        kdr: row.deaths === 0 ? row.kills : row.kills / row.deaths,
        pingMs: row.pingMs,
      })),
    [runtimeSnapshot.scoreboard]
  );
  const killFeed = useMemo<KillFeedEntry[]>(
    () =>
      runtimeSnapshot.feed.map((entry, index) => ({
        id: index + 1,
        kind: entry.kind,
        senderNickname: entry.senderNickname,
        message: entry.message,
        tick: entry.receivedAtMs,
      })),
    [runtimeSnapshot.feed]
  );
  const match = useMemo<MatchView | null>(() => {
    const room = runtimeSnapshot.room;
    if (!room) return null;
    const intermission = room.phase === 'intermission';
    const winner =
      scoreboard.find((row) => row.identity === room.winnerPlayerId) ??
      (intermission ? scoreboard[0] : undefined);
    const remainingTicks = intermission
      ? ticksUntil(room.intermissionEndsTick, room.serverTick)
      : Math.max(0, backend.matchDurationTicks - room.matchTick);
    return {
      roomCode: room.code,
      active: room.phase === 'active',
      tick: room.serverTick,
      remainingMs: (remainingTicks / backend.tickRate) * 1_000,
      round: room.round,
      phase: intermission ? 'intermission' : 'playing',
      winnerNickname: winner?.nickname ?? null,
    };
  }, [
    backend.matchDurationTicks,
    backend.tickRate,
    runtimeSnapshot.room,
    scoreboard,
  ]);

  const respawnTicks =
    runtimeSnapshot.respawnAtTick == null || runtimeSnapshot.room == null
      ? 0
      : ticksUntil(
          runtimeSnapshot.respawnAtTick,
          runtimeSnapshot.room.serverTick
        );
  const respawnSeconds = respawnTicks / backend.tickRate;
  const inIntermission = runtimeSnapshot.room?.phase === 'intermission';
  const reconnecting =
    backend.status === 'reconnecting' ||
    runtimeSnapshot.connectionStatus === 'reconnecting';

  const runRoomAction = useCallback(
    (action: () => Promise<void>): void => {
      void action().catch(() => undefined);
    },
    []
  );
  const copyDiagnostics = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(client.diagnostics());
      return true;
    } catch {
      return false;
    }
  }, [client]);
  const sendChat = useCallback((): void => {
    const message = chatDraft.trim();
    if (!message || backend.chatBusy) return;
    void client
      .sendChat(message)
      .then(() => setChatDraft(''))
      .catch(() => undefined);
  }, [backend.chatBusy, chatDraft, client]);
  const resumePlay = useCallback((): void => {
    setPaused(false);
    setPauseView('pause');
    setChatOpen(false);
    void runtime?.requestPointerLock();
  }, [runtime]);
  const leaveMatch = useCallback((): void => {
    setPaused(false);
    setPauseView('pause');
    setChatOpen(false);
    runRoomAction(() => client.leaveRoom());
  }, [client, runRoomAction]);
  const toggleFullscreen = useCallback((): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void runtime?.requestFullscreen();
    }
  }, [runtime]);

  return (
    <main
      className={`cyber-root${connected ? ' cyber-live-match' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#020711',
      }}
    >
      <CyberGlobalStyles />
      <CyberScanFx />
      <canvas
        ref={canvasRef}
        aria-label="Arena first-person game viewport"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />

      <HudOverlay
        localIdentity={runtimeSnapshot.localPlayerId}
        health={runtimeSnapshot.health}
        ammo={runtimeSnapshot.ammo}
        reserveAmmo={runtimeSnapshot.reserveAmmo}
        clipSize={runtimeSnapshot.clipCapacity}
        reloading={runtimeSnapshot.reloading}
        reloadProgress={runtimeSnapshot.reloadProgress}
        localKills={localScore?.kills ?? runtimeSnapshot.kills}
        localDeaths={localScore?.deaths ?? runtimeSnapshot.deaths}
        match={match}
        killFeed={killFeed}
        scoreboard={scoreboard}
        scoreboardOpen={scoreboardOpen}
        connected={connected}
        pingMs={backend.pingMs}
        pingLowMs={backend.pingLowMs}
        pingJitterMs={backend.pingJitterMs}
        serverPipelineMs={backend.serverPipelineMs}
        serverPipelineLowMs={null}
        nerdPingsEnabled={nerdPingsEnabled}
        hitmarkerVisible={hitmarkerVisible}
        damageFlashToken={runtimeSnapshot.damageFlashToken}
        scoped={runtimeSnapshot.scoped}
        selectedWeaponSlot={runtimeSnapshot.selectedWeapon}
        networkReconnecting={reconnecting}
        networkReconnectAttempt={backend.reconnectAttempt}
        networkReconnectStartedAtMs={runtimeSnapshot.reconnectStartedAtMs}
        paused={paused}
        chatOpen={chatOpen}
        chatDraft={chatDraft}
        chatBusy={backend.chatBusy}
        chatError={backend.chatError}
        onChatOpen={() => setChatOpen(true)}
        onChatClose={() => setChatOpen(false)}
        onChatDraftChange={setChatDraft}
        onChatSend={sendChat}
      />

      <MenuOverlay
        connected={connected}
        busy={
          backend.actionBusy ||
          backend.status === 'connecting' ||
          backend.status === 'reconnecting'
        }
        nickname={displayNickname}
        roomCode={roomCode}
        backendConnected={backend.status === 'connected'}
        backendPingMs={backend.pingMs}
        backendPingLowMs={backend.pingLowMs}
        backendPingJitterMs={backend.pingJitterMs}
        backendServerPipelineMs={backend.serverPipelineMs}
        backendServerPipelineLowMs={null}
        nerdPingsEnabled={nerdPingsEnabled}
        backendTarget={backendTarget}
        customBackendLabel={`${customBackendSecure ? 'wss' : 'ws'}://${customBackendHost}:${customBackendPort}`}
        customBackendHost={customBackendHost}
        customBackendPort={customBackendPort}
        customBackendSecure={customBackendSecure}
        openRooms={backend.rooms}
        connectionError={
          connected && backend.status === 'connected'
            ? null
            : backend.connectionError
        }
        authError={backend.authError}
        accountsEnabled={backend.accountsEnabled}
        authLoggedIn={backend.authLoggedIn}
        authUsername={backend.authUsername}
        authStats={backend.accountStats}
        authBusy={backend.authBusy}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        onLogin={(identifier, password) =>
          client.login(identifier, password)
        }
        onRegister={(email, username, password) =>
          client.register(email, username, password)
        }
        onLogout={() => client.logout()}
        onRefreshStats={() => void client.refreshStats()}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onNerdPingsChange={setNerdPingsEnabled}
        hasServerPings={backend.pingMs != null}
        onCopyServerPings={copyDiagnostics}
        onNicknameChange={setNickname}
        onRoomCodeChange={(value) => setRoomCode(normalizeRoomCode(value))}
        onQuickPlay={() =>
          runRoomAction(() => client.quickPlay(displayNickname))
        }
        onCreateRoom={() =>
          runRoomAction(() => client.createRoom(displayNickname, roomCode))
        }
        onJoinRoom={() =>
          runRoomAction(() => client.joinRoom(displayNickname, roomCode))
        }
        onJoinOpenRoom={(code) => {
          setRoomCode(code);
          runRoomAction(() => client.joinRoom(displayNickname, code));
        }}
        onBackendTargetChange={setBackendTarget}
        onCustomBackendHostChange={setCustomBackendHost}
        onCustomBackendPortChange={setCustomBackendPort}
        onCustomBackendSecureChange={setCustomBackendSecure}
        onUseCustomBackend={() => setBackendTarget('custom')}
      />

      <PauseOverlay
        visible={paused && connected && !inIntermission}
        roomCode={runtimeSnapshot.room?.code ?? roomCode}
        view={pauseView}
        authLoggedIn={backend.authLoggedIn}
        authUsername={backend.authUsername}
        authStats={backend.accountStats}
        authBusy={backend.authBusy}
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
        hasServerPings={backend.pingMs != null}
        onCopyServerPings={copyDiagnostics}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setPauseView('settings')}
        onOpenStats={() => setPauseView('stats')}
        onRefreshStats={() => void client.refreshStats()}
        onCloseSettings={() => setPauseView('pause')}
        onResume={resumePlay}
        onDisconnect={leaveMatch}
      />

      <EliminatedOverlay
        visible={connected && !runtimeSnapshot.alive && !inIntermission}
        killerNickname={runtimeSnapshot.lastKillerNickname}
        respawnSeconds={respawnSeconds}
        respawnAvailable={respawnTicks === 0}
        onRespawn={() => runtime?.requestRespawn()}
      />

      <ResultsOverlay
        visible={connected && inIntermission}
        winnerNickname={match?.winnerNickname ?? null}
        standings={scoreboard}
        localIdentity={runtimeSnapshot.localPlayerId}
        nextMatchSeconds={
          runtimeSnapshot.room == null
            ? 0
            : ticksUntil(
                runtimeSnapshot.room.intermissionEndsTick,
                runtimeSnapshot.room.serverTick
              ) / backend.tickRate
        }
      />

      <PointerLockOverlay
        visible={
          connected &&
          runtimeSnapshot.alive &&
          !runtimeSnapshot.pointerLocked &&
          !paused &&
          !chatOpen &&
          !inIntermission
        }
        reconnecting={reconnecting}
        onResume={resumePlay}
      />

      <MobileControls
        visible={
          connected &&
          runtimeSnapshot.alive &&
          mobileControls &&
          !paused &&
          !chatOpen &&
          !inIntermission
        }
        portrait={portrait}
        onMoveChange={(moveX, moveZ) =>
          runtime?.setMobileMove(moveX, moveZ)
        }
        onLookChange={(lookX, lookY) =>
          runtime?.addMobileLookDelta(lookX, lookY)
        }
        onFireChange={(held) => runtime?.setMobileFire(held)}
      />
    </main>
  );
}
