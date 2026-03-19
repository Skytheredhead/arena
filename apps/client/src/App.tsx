import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuOverlay } from './ui/components/MenuOverlay';
import { HudOverlay } from './ui/components/HudOverlay';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { useGameStore } from './state/gameStore';
import { GameRuntime } from './app/GameRuntime';
import { getSpacetimeUriCandidates } from './utils/env';
import { normalizeRoomCode } from './utils/roomCode';
import { CyberGlobalStyles } from './ui/cyberTheme';

const BACKEND_PROBE_TIMEOUT_MS = 2500;
const BACKEND_PROBE_INTERVAL_MS = 4000;
const BACKEND_RETRY_INTERVAL_MS = 1600;

const toBackendProbeUrl = (uri: string): string => {
  if (uri.startsWith('wss://')) {
    return `https://${uri.slice('wss://'.length)}`;
  }
  if (uri.startsWith('ws://')) {
    return `http://${uri.slice('ws://'.length)}`;
  }
  return uri;
};

export default function App(): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const hadPointerLockRef = useRef(false);
  const pointerLockedRef = useRef(false);
  const pausedRef = useRef(false);
  const resumeOnEscapeKeyupRef = useRef(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendPingMs, setBackendPingMs] = useState<number | null>(null);
  const connectionStatus = useGameStore(state => state.connectionStatus);
  const connectionError = useGameStore(state => state.connectionError);
  const nickname = useGameStore(state => state.nickname);
  const roomCode = useGameStore(state => state.roomCode);
  const match = useGameStore(state => state.match);
  const killFeed = useGameStore(state => state.killFeed);
  const scoreboardOpen = useGameStore(state => state.scoreboardOpen);
  const hitmarkerUntil = useGameStore(state => state.hitmarkerUntil);
  const crosshairSpread = useGameStore(state => state.crosshairSpread);
  const scoped = useGameStore(state => state.scoped);
  const localPlayer = useGameStore(state => state.localPlayer);
  const localIdentity = useGameStore(state => state.localIdentity);
  const players = useGameStore(state => state.players);
  const rooms = useGameStore(state => state.rooms);
  const connectedRoomCode = useGameStore(state => state.connectedRoomCode);
  const graphicsQuality = useGameStore(state => state.graphicsQuality);
  const lookSensitivity = useGameStore(state => state.lookSensitivity);
  const fov = useGameStore(state => state.fov);
  const forceLocalBackend = useGameStore(state => state.forceLocalBackend);
  const setNickname = useGameStore(state => state.setNickname);
  const setRoomCode = useGameStore(state => state.setRoomCode);
  const setForceLocalBackend = useGameStore(state => state.setForceLocalBackend);
  const setGraphicsQuality = useGameStore(state => state.setGraphicsQuality);
  const setLookSensitivity = useGameStore(state => state.setLookSensitivity);
  const setFov = useGameStore(state => state.setFov);

  const ensureRuntime = (): GameRuntime | null => {
    if (runtimeRef.current) {
      return runtimeRef.current;
    }
    if (!mountRef.current) {
      setRuntimeError('Game mount is not ready yet. Please try again.');
      return null;
    }
    try {
      const runtime = new GameRuntime(mountRef.current);
      runtime.setGraphicsQuality(graphicsQuality);
      runtime.setLookSensitivity(lookSensitivity);
      runtime.setFov(fov);
      runtimeRef.current = runtime;
      setRuntimeError(null);
      return runtime;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Game runtime failed to initialize.';
      setRuntimeError(message);
      return null;
    }
  };

  useEffect(
    () => () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    },
    []
  );

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.setGraphicsQuality(graphicsQuality);
    runtime.setLookSensitivity(lookSensitivity);
    runtime.setFov(fov);
  }, [fov, graphicsQuality, lookSensitivity]);

  const connected = connectionStatus === 'connected';
  const connecting = connectionStatus === 'connecting';

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    const probeCandidates = getSpacetimeUriCandidates(forceLocalBackend).map(toBackendProbeUrl);

    const schedule = (delayMs: number): void => {
      if (cancelled) {
        return;
      }
      timerId = window.setTimeout(() => {
        void probe();
      }, delayMs);
    };

    const probeUri = async (probeUrl: string): Promise<number> => {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_PROBE_TIMEOUT_MS);

      try {
        await fetch(probeUrl, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal
        });
        return Math.round(performance.now() - startedAt);
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const probe = async (): Promise<void> => {
      for (const probeUrl of probeCandidates) {
        try {
          const pingMs = await probeUri(probeUrl);
          if (cancelled) {
            return;
          }
          setBackendConnected(true);
          setBackendPingMs(pingMs);
          schedule(BACKEND_PROBE_INTERVAL_MS);
          return;
        } catch {
          // Try next backend candidate.
        }
      }

      if (cancelled) {
        return;
      }
      setBackendConnected(false);
      setBackendPingMs(null);
      schedule(BACKEND_RETRY_INTERVAL_MS);
    };

    setBackendConnected(false);
    setBackendPingMs(null);
    void probe();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [forceLocalBackend]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const resumeFromPause = useCallback((deferPointerLock = false): void => {
    setPaused(false);
    runtimeRef.current?.setPaused(false);
    if (deferPointerLock) {
      resumeOnEscapeKeyupRef.current = true;
      return;
    }
    runtimeRef.current?.requestPointerLock();
  }, []);

  useEffect(() => {
    if (!connected) {
      setPaused(false);
      runtimeRef.current?.setPaused(false);
      hadPointerLockRef.current = false;
      pointerLockedRef.current = false;
      resumeOnEscapeKeyupRef.current = false;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') {
        return;
      }
      if (event.repeat) {
        return;
      }

      event.preventDefault();
      if (pausedRef.current) {
        resumeFromPause(true);
        return;
      }

      setPaused(true);
      runtimeRef.current?.setPaused(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connected, resumeFromPause]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') {
        return;
      }
      if (!resumeOnEscapeKeyupRef.current) {
        return;
      }

      resumeOnEscapeKeyupRef.current = false;
      runtimeRef.current?.requestPointerLock();
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [connected]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const handlePointerLockChange = (): void => {
      const runtime = runtimeRef.current;
      const wasPointerLocked = pointerLockedRef.current;
      const hasPointerLock = runtime?.isPointerLocked() ?? false;
      pointerLockedRef.current = hasPointerLock;

      if (hasPointerLock) {
        hadPointerLockRef.current = true;
        return;
      }

      if (wasPointerLocked && hadPointerLockRef.current && !pausedRef.current) {
        setPaused(true);
        runtime?.setPaused(true);
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, [connected]);

  const hitmarkerVisible = hitmarkerUntil > performance.now();
  const scoreboard = useMemo(
    () =>
      Object.values(players)
        .filter(player => player.roomCode === connectedRoomCode)
        .sort((left, right) => right.kills - left.kills || left.deaths - right.deaths),
    [connectedRoomCode, players]
  );
  const openRooms = useMemo(
    () =>
      Object.values(rooms)
        .filter(room => room.playerCount > 0)
        .sort((left, right) => right.playerCount - left.playerCount || left.code.localeCompare(right.code))
        .slice(0, 6),
    [rooms]
  );
  const localMeta = useMemo(
    () => (localIdentity ? players[localIdentity] : undefined),
    [localIdentity, players]
  );

  const hudProps = useMemo(
    () => ({
      localIdentity,
      health: localPlayer.health,
      ammo: localPlayer.ammo,
      localKills: localMeta?.kills ?? 0,
      localDeaths: localMeta?.deaths ?? 0,
      match,
      killFeed,
      scoreboard,
      scoreboardOpen,
      connected,
      hitmarkerVisible,
      crosshairSpread,
      scoped
    }),
    [
      connected,
      crosshairSpread,
      hitmarkerVisible,
      killFeed,
      localIdentity,
      localPlayer.ammo,
      localPlayer.health,
      localMeta?.deaths,
      localMeta?.kills,
      match,
      scoped,
      scoreboard,
      scoreboardOpen
    ]
  );

  const connectToRoom = (createRoom: boolean, explicitRoomCode?: string): void => {
    const runtime = ensureRuntime();
    if (!runtime) {
      return;
    }

    const targetRoomCode = normalizeRoomCode(explicitRoomCode ?? roomCode);
    if (targetRoomCode !== roomCode) {
      setRoomCode(targetRoomCode);
    }

    setPaused(false);
    runtime.setPaused(false);

    void runtime
      .connect({
        nickname,
        roomCode: targetRoomCode,
        createRoom
      })
      .then(() => {
        if (useGameStore.getState().connectionStatus === 'connected') {
          runtime.requestPointerLock();
        }
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Connection failed';
        useGameStore.getState().setConnection('error', message);
      });
  };

  return (
    <div className="cyber-root relative h-full w-full overflow-hidden bg-[#020b14]">
      <CyberGlobalStyles />
      <div ref={mountRef} className="absolute inset-0 z-0" />
      <HudOverlay {...hudProps} />
      <MenuOverlay
        connected={connected}
        busy={connecting}
        nickname={nickname}
        roomCode={roomCode}
        connectionStatus={connectionStatus}
        backendConnected={backendConnected}
        backendPingMs={backendPingMs}
        forceLocalBackend={forceLocalBackend}
        openRooms={openRooms}
        connectionError={runtimeError ?? connectionError}
        onNicknameChange={setNickname}
        onRoomCodeChange={value => setRoomCode(normalizeRoomCode(value))}
        onCreateRoom={() => connectToRoom(true)}
        onJoinRoom={() => connectToRoom(false)}
        onJoinOpenRoom={code => connectToRoom(false, code)}
        onForceLocalBackendChange={setForceLocalBackend}
      />
      <PauseOverlay
        visible={paused && connected}
        roomCode={roomCode}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        forceLocalBackend={forceLocalBackend}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onForceLocalBackendChange={setForceLocalBackend}
        onResume={resumeFromPause}
        onDisconnect={() => {
          setPaused(false);
          runtimeRef.current?.disconnect();
        }}
      />
    </div>
  );
}
