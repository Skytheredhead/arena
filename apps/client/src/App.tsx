import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuOverlay } from './ui/components/MenuOverlay';
import { HudOverlay } from './ui/components/HudOverlay';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { MobileControls } from './ui/components/MobileControls';
import { EliminatedOverlay } from './ui/components/EliminatedOverlay';
import { useGameStore } from './state/gameStore';
import { GameRuntime } from './app/GameRuntime';
import { normalizeRoomCode } from './utils/roomCode';
import { CyberGlobalStyles } from './ui/cyberTheme';

export default function App(): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const connectInFlightRef = useRef(false);
  const hadPointerLockRef = useRef(false);
  const pointerLockedRef = useRef(false);
  const pausedRef = useRef(false);
  const resumeOnEscapeKeyupRef = useRef(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [touchControls, setTouchControls] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [pauseView, setPauseView] = useState<'pause' | 'settings'>('pause');
  const connectionStatus = useGameStore(state => state.connectionStatus);
  const connectionError = useGameStore(state => state.connectionError);
  const nickname = useGameStore(state => state.nickname);
  const roomCode = useGameStore(state => state.roomCode);
  const match = useGameStore(state => state.match);
  const killFeed = useGameStore(state => state.killFeed);
  const scoreboardOpen = useGameStore(state => state.scoreboardOpen);
  const hitmarkerUntil = useGameStore(state => state.hitmarkerUntil);
  const damageFlashToken = useGameStore(state => state.damageFlashToken);
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
  const sfxVolume = useGameStore(state => state.sfxVolume);
  const musicVolume = useGameStore(state => state.musicVolume);
  const setNickname = useGameStore(state => state.setNickname);
  const setRoomCode = useGameStore(state => state.setRoomCode);
  const setGraphicsQuality = useGameStore(state => state.setGraphicsQuality);
  const setLookSensitivity = useGameStore(state => state.setLookSensitivity);
  const setFov = useGameStore(state => state.setFov);
  const setSfxVolume = useGameStore(state => state.setSfxVolume);
  const setMusicVolume = useGameStore(state => state.setMusicVolume);

  const syncViewportMode = useCallback((): void => {
    const coarsePointer =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches;
    const touchCapable =
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 || /android|iphone|ipad|ipod/i.test(navigator.userAgent));
    const mobile = coarsePointer || touchCapable;
    setTouchControls(mobile);
    setPortrait(mobile && window.innerHeight > window.innerWidth);
    runtimeRef.current?.setTouchControlsActive(mobile);
  }, []);

  const lockLandscape = useCallback((): void => {
    const orientationApi =
      typeof screen === 'undefined'
        ? undefined
        : (screen.orientation as ScreenOrientation & {
            lock?: (orientation: 'landscape') => Promise<void>;
          });

    if (!touchControls || !orientationApi?.lock) {
      return;
    }

    void orientationApi.lock('landscape').catch(() => undefined);
  }, [touchControls]);

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
      runtime.setSfxVolume(sfxVolume);
      runtime.setMusicVolume(musicVolume);
      runtime.setTouchControlsActive(touchControls);
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
    ensureRuntime();
    const unlockAudio = (): void => {
      runtimeRef.current?.unlockAudio();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    // Intentionally run only once after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncViewportMode();
    window.addEventListener('resize', syncViewportMode);
    window.addEventListener('orientationchange', syncViewportMode);
    return () => {
      window.removeEventListener('resize', syncViewportMode);
      window.removeEventListener('orientationchange', syncViewportMode);
    };
  }, [syncViewportMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.setGraphicsQuality(graphicsQuality);
    runtime.setLookSensitivity(lookSensitivity);
    runtime.setFov(fov);
    runtime.setSfxVolume(sfxVolume);
    runtime.setMusicVolume(musicVolume);
    runtime.setTouchControlsActive(touchControls);
  }, [fov, graphicsQuality, lookSensitivity, musicVolume, sfxVolume, touchControls]);

  const connected = connectionStatus === 'connected';
  const connecting = connectionStatus === 'connecting';
  const backendConnected = connected;
  const backendPingMs = null;

  useEffect(() => {
    runtimeRef.current?.setLobbyMusicActive(!connected);
  }, [connected]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    runtimeRef.current?.setTextInputActive(chatOpen);
    if (!chatOpen) {
      return;
    }
    if (!touchControls && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [chatOpen, touchControls]);

  const resumeFromPause = useCallback((deferPointerLock = false): void => {
    setPaused(false);
    setPauseView('pause');
    runtimeRef.current?.setPaused(false);
    runtimeRef.current?.unlockAudio();
    if (deferPointerLock) {
      resumeOnEscapeKeyupRef.current = true;
      return;
    }
    runtimeRef.current?.requestPointerLock();
  }, []);

  useEffect(() => {
    if (!connected) {
      setPaused(false);
      setPauseView('pause');
      setChatOpen(false);
      setChatDraft('');
      runtimeRef.current?.setPaused(false);
      hadPointerLockRef.current = false;
      pointerLockedRef.current = false;
      resumeOnEscapeKeyupRef.current = false;
      return;
    }
    if (touchControls) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') {
        return;
      }
      if (chatOpen) {
        event.preventDefault();
        setChatOpen(false);
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
      setPauseView('pause');
      runtimeRef.current?.setPaused(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen, connected, resumeFromPause, touchControls]);

  useEffect(() => {
    if (touchControls) {
      return;
    }
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
  }, [connected, touchControls]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Enter') {
        return;
      }
      if (event.repeat) {
        return;
      }

      const target = event.target;
      const typingIntoField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (typingIntoField) {
        return;
      }

      event.preventDefault();
      setChatOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connected]);

  useEffect(() => {
    if (touchControls) {
      return;
    }
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

      if (wasPointerLocked && hadPointerLockRef.current && !pausedRef.current && !chatOpen) {
        setPaused(true);
        runtime?.setPaused(true);
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, [chatOpen, connected, touchControls]);

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
  const eliminated = connected && !localPlayer.alive;

  const sendChat = useCallback((): void => {
    const runtime = runtimeRef.current;
    const text = chatDraft.trim();
    if (!runtime || text.length === 0 || chatBusy) {
      return;
    }
    setChatBusy(true);
    void runtime
      .sendChatMessage(text)
      .then(() => {
        setChatDraft('');
        setChatOpen(false);
        if (!touchControls) {
          runtime.requestPointerLock();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setChatBusy(false);
      });
  }, [chatBusy, chatDraft, touchControls]);

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
      damageFlashToken,
      crosshairSpread,
      scoped,
      chatOpen,
      chatDraft,
      chatBusy,
      onChatOpen: () => setChatOpen(true),
      onChatClose: () => setChatOpen(false),
      onChatDraftChange: (value: string) => setChatDraft(value),
      onChatSend: sendChat
    }),
    [
      connected,
      crosshairSpread,
      damageFlashToken,
      chatBusy,
      chatDraft,
      chatOpen,
      hitmarkerVisible,
      killFeed,
      localIdentity,
      localPlayer.health,
      localPlayer.ammo,
      localMeta?.deaths,
      localMeta?.kills,
      match,
      sendChat,
      scoped,
      scoreboard,
      scoreboardOpen
    ]
  );

  const connectToRoom = (createRoom: boolean, explicitRoomCode?: string): void => {
    if (connectInFlightRef.current || useGameStore.getState().connectionStatus === 'connecting') {
      return;
    }

    const runtime = ensureRuntime();
    if (!runtime) {
      return;
    }
    runtime.unlockAudio();

    const targetRoomCode = normalizeRoomCode(explicitRoomCode ?? roomCode);
    if (targetRoomCode !== roomCode) {
      setRoomCode(targetRoomCode);
    }

    setPaused(false);
    runtime.setPaused(false);
    lockLandscape();
    connectInFlightRef.current = true;

    void runtime
      .connect({
        nickname,
        roomCode: targetRoomCode,
        createRoom
      })
      .then(() => {
        if (useGameStore.getState().connectionStatus === 'connected' && !touchControls) {
          runtime.requestPointerLock();
        }
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Connection failed';
        useGameStore.getState().setConnection('error', message);
      })
      .finally(() => {
        connectInFlightRef.current = false;
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
        openRooms={openRooms}
        connectionError={runtimeError ?? connectionError}
        onNicknameChange={setNickname}
        onRoomCodeChange={value => setRoomCode(normalizeRoomCode(value))}
        onCreateRoom={() => connectToRoom(true)}
        onJoinRoom={() => connectToRoom(false)}
        onJoinOpenRoom={code => connectToRoom(false, code)}
      />
      <PauseOverlay
        visible={paused && connected}
        roomCode={roomCode}
        view={pauseView}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onOpenSettings={() => setPauseView('settings')}
        onCloseSettings={() => setPauseView('pause')}
        onResume={resumeFromPause}
        onDisconnect={() => {
          setPaused(false);
          setPauseView('pause');
          runtimeRef.current?.disconnect();
        }}
      />
      <EliminatedOverlay
        visible={eliminated}
        onRespawn={() => {
          void runtimeRef.current?.requestRespawn().catch(() => undefined);
        }}
      />
      <MobileControls
        visible={connected && touchControls}
        portrait={portrait}
        onMoveChange={(moveX, moveZ) => runtimeRef.current?.setVirtualMove(moveX, moveZ)}
        onLookChange={(lookX, lookY) => runtimeRef.current?.setVirtualLook(lookX, lookY)}
        onFireChange={held => runtimeRef.current?.setVirtualFireHeld(held)}
      />
    </div>
  );
}
