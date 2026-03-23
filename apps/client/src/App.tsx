import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuOverlay } from './ui/components/MenuOverlay';
import { HudOverlay } from './ui/components/HudOverlay';
import { PauseOverlay } from './ui/components/PauseOverlay';
import { MobileControls } from './ui/components/MobileControls';
import { EliminatedOverlay } from './ui/components/EliminatedOverlay';
import { LoadingOverlay } from './ui/components/LoadingOverlay';
import { useGameStore } from './state/gameStore';
import { GameRuntime } from './app/GameRuntime';
import { normalizeRoomCode } from './utils/roomCode';
import {
  getBackendTarget,
  getCustomBackendSettings,
  setBackendTarget,
  setCustomBackendSettings,
  type CustomBackendSettings,
  type BackendTarget
} from './utils/env';
import { CyberGlobalStyles, CyberScanFx } from './ui/cyberTheme';
import { fetchOpenRoomsSnapshot, startLiveRoomDirectory } from './netcode/roomDirectory';
import {
  type AccountStatsView,
  type AuthSnapshot,
  fetchAuthSnapshot,
  loginAccount,
  logoutAccount,
  registerAccount
} from './netcode/authClient';

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[index] ?? 0;
};

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
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [backendTarget, setBackendTargetState] = useState<BackendTarget>(() => getBackendTarget());
  const [customBackendSettings, setCustomBackendSettingsState] =
    useState<CustomBackendSettings>(() => getCustomBackendSettings());
  const connectionStatus = useGameStore(state => state.connectionStatus);
  const connectionError = useGameStore(state => state.connectionError);
  const networkReconnecting = useGameStore(state => state.networkReconnecting);
  const networkReconnectAttempt = useGameStore(state => state.networkReconnectAttempt);
  const networkReconnectStartedAtMs = useGameStore(state => state.networkReconnectStartedAtMs);
  const nickname = useGameStore(state => state.nickname);
  const roomCode = useGameStore(state => state.roomCode);
  const match = useGameStore(state => state.match);
  const killFeed = useGameStore(state => state.killFeed);
  const scoreboardOpen = useGameStore(state => state.scoreboardOpen);
  const hitmarkerUntil = useGameStore(state => state.hitmarkerUntil);
  const damageFlashToken = useGameStore(state => state.damageFlashToken);
  const crosshairSpread = useGameStore(state => state.crosshairSpread);
  const scoped = useGameStore(state => state.scoped);
  const selectedWeaponSlot = useGameStore(state => state.selectedWeaponSlot);
  const sniperCooldownRemainingMs = useGameStore(state => state.sniperCooldownRemainingMs);
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
  const localPingMs = useGameStore(state => state.localPingMs);
  const localPingLowMs = useGameStore(state => state.localPingLowMs);
  const localPingJitterMs = useGameStore(state => state.localPingJitterMs);
  const serverPipelineMs = useGameStore(state => state.serverPipelineMs);
  const serverPipelineLowMs = useGameStore(state => state.serverPipelineLowMs);
  const nerdPingsEnabled = useGameStore(state => state.nerdPingsEnabled);
  const playerPings = useGameStore(state => state.playerPings);
  const setNickname = useGameStore(state => state.setNickname);
  const setRoomCode = useGameStore(state => state.setRoomCode);
  const setGraphicsQuality = useGameStore(state => state.setGraphicsQuality);
  const setLookSensitivity = useGameStore(state => state.setLookSensitivity);
  const setFov = useGameStore(state => state.setFov);
  const setSfxVolume = useGameStore(state => state.setSfxVolume);
  const setMusicVolume = useGameStore(state => state.setMusicVolume);
  const setRoomDirectory = useGameStore(state => state.setRoomDirectory);
  const setLocalPing = useGameStore(state => state.setLocalPing);
  const setLocalPingLow = useGameStore(state => state.setLocalPingLow);
  const setLocalPingJitter = useGameStore(state => state.setLocalPingJitter);
  const setServerPipeline = useGameStore(state => state.setServerPipeline);
  const setServerPipelineLow = useGameStore(state => state.setServerPipelineLow);
  const setNerdPingsEnabled = useGameStore(state => state.setNerdPingsEnabled);
  const lobbyPingSamplesRef = useRef<Array<{ at: number; rttMs: number }>>([]);
  const lobbyServerSamplesRef = useRef<Array<{ at: number; pipelineMs: number }>>([]);
  const lastLobbyLowsUpdateRef = useRef(0);

  const syncViewportMode = useCallback((): void => {
    const coarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
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
    if (!touchControls || !orientationApi?.lock) return;
    void orientationApi.lock('landscape').catch(() => undefined);
  }, [touchControls]);

  const ensureRuntime = (): GameRuntime | null => {
    if (runtimeRef.current) return runtimeRef.current;
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
      const message = error instanceof Error ? error.message : 'Game runtime failed to initialize.';
      setRuntimeError(message);
      return null;
    }
  };

  useEffect(() => () => { runtimeRef.current?.dispose(); runtimeRef.current = null; }, []);

  useEffect(() => {
    ensureRuntime();
    const unlockAudio = (): void => { runtimeRef.current?.unlockAudio(); };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
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

  const connected = connectionStatus === 'connected';
  const connecting = connectionStatus === 'connecting';
  const backendConnected = connected || localPingMs != null;
  const backendPingMs = localPingMs;
  const authLoggedIn = authSnapshot?.loggedIn ?? false;
  const authUsername = authSnapshot?.username ?? null;
  const authStats: AccountStatsView | null = authSnapshot?.stats ?? null;
  const authCallsign = useMemo(() => {
    const trimmed = authUsername?.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 16);
  }, [authUsername]);
  const effectiveNickname = authLoggedIn && authCallsign ? authCallsign : nickname;
  const customBackendLabel = useMemo(() => {
    const host = customBackendSettings.host.trim();
    const port = customBackendSettings.port.trim();
    if (!host || !port) {
      return 'Custom';
    }
    return `${host}:${port}`;
  }, [customBackendSettings.host, customBackendSettings.port]);

  const refreshAuthSnapshot = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await fetchAuthSnapshot();
      setAuthSnapshot(snapshot);
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach auth backend';
      setAuthError(message);
    }
  }, []);

  useEffect(() => { void refreshAuthSnapshot(); }, [refreshAuthSnapshot]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    const schedule = (): void => {
      timeoutId = window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') { schedule(); return; }
        void refreshAuthSnapshot().finally(schedule);
      }, 20_000);
    };
    schedule();
    return () => { cancelled = true; if (timeoutId != null) window.clearTimeout(timeoutId); };
  }, [refreshAuthSnapshot]);

  useEffect(() => {
    if (connected) return;
    lobbyPingSamplesRef.current = [];
    lobbyServerSamplesRef.current = [];
    lastLobbyLowsUpdateRef.current = 0;
    setLocalPing(null);
    setLocalPingLow(null);
    setLocalPingJitter(null);
    setServerPipeline(null);
    setServerPipelineLow(null);
    const live = startLiveRoomDirectory(
      {
        onSnapshot: rows => {
          setRoomDirectory(rows);
        },
        onPingSample: measuredLobbyPing => {
          const now = performance.now();
          lobbyPingSamplesRef.current.push({ at: now, rttMs: measuredLobbyPing });
          while (
            (lobbyPingSamplesRef.current.at(0)?.at ?? Number.POSITIVE_INFINITY) <
            now - 5_000
          ) {
            lobbyPingSamplesRef.current.shift();
          }

          const rttValues = lobbyPingSamplesRef.current.map(sample => sample.rttMs);
          const avgPing =
            rttValues.length === 0
              ? measuredLobbyPing
              : rttValues.reduce((sum, sample) => sum + sample, 0) / rttValues.length;
          const variance =
            rttValues.length === 0
              ? 0
              : rttValues.reduce((sum, sample) => {
                  const delta = sample - avgPing;
                  return sum + delta * delta;
                }, 0) / rttValues.length;
          const jitterMs = Math.sqrt(variance);
          const baselinePing = percentile(rttValues, 0.05);
          const pipelineSampleMs = Math.max(0, measuredLobbyPing - baselinePing);
          lobbyServerSamplesRef.current.push({ at: now, pipelineMs: pipelineSampleMs });
          while (
            (lobbyServerSamplesRef.current.at(0)?.at ?? Number.POSITIVE_INFINITY) <
            now - 5_000
          ) {
            lobbyServerSamplesRef.current.shift();
          }

          setLocalPing(Math.max(1, Math.round(avgPing)));
          setLocalPingJitter(Math.max(0, Math.round(jitterMs)));
          setServerPipeline(Math.max(0, Math.round(pipelineSampleMs)));

          if (
            lastLobbyLowsUpdateRef.current === 0 ||
            now - lastLobbyLowsUpdateRef.current >= 5_000
          ) {
            lastLobbyLowsUpdateRef.current = now;
            const pingOnePercentLow = percentile(rttValues, 0.99);
            const serverValues = lobbyServerSamplesRef.current.map(sample => sample.pipelineMs);
            const serverOnePercentLow = percentile(serverValues, 0.99);
            setLocalPingLow(Math.max(1, Math.round(pingOnePercentLow)));
            setServerPipelineLow(Math.max(0, Math.round(serverOnePercentLow)));
          }
        },
        onStateChange: liveConnected => {
          if (liveConnected) {
            return;
          }
          setLocalPing(null);
          setLocalPingLow(null);
          setLocalPingJitter(null);
          setServerPipeline(null);
          setServerPipelineLow(null);
        }
      },
      backendTarget
    );
    return () => {
      live.stop();
    };
  }, [
    backendTarget,
    connected,
    setLocalPing,
    setLocalPingLow,
    setLocalPingJitter,
    setServerPipeline,
    setServerPipelineLow,
    setRoomDirectory
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setGraphicsQuality(graphicsQuality);
    runtime.setLookSensitivity(lookSensitivity);
    runtime.setFov(fov);
    runtime.setSfxVolume(sfxVolume);
    runtime.setMusicVolume(musicVolume);
    runtime.setTouchControlsActive(touchControls);
  }, [fov, graphicsQuality, lookSensitivity, musicVolume, sfxVolume, touchControls]);

  useEffect(() => {
    runtimeRef.current?.setPointerLockEnabled(connected && !touchControls);
  }, [connected, touchControls]);

  useEffect(() => {
    runtimeRef.current?.setLobbyMusicActive(!connected);
  }, [connected]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    runtimeRef.current?.setTextInputActive(chatOpen);
    if (!chatOpen) return;
    if (!touchControls && document.pointerLockElement) document.exitPointerLock();
  }, [chatOpen, touchControls]);

  const resumeFromPause = useCallback((deferPointerLock = false): void => {
    setPaused(false);
    setPauseView('pause');
    runtimeRef.current?.setPaused(false);
    runtimeRef.current?.unlockAudio();
    if (deferPointerLock) { resumeOnEscapeKeyupRef.current = true; return; }
    runtimeRef.current?.requestPointerLock();
  }, []);

  useEffect(() => {
    if (!connected) {
      setPaused(false); setPauseView('pause'); setChatOpen(false); setChatDraft('');
      runtimeRef.current?.setPaused(false);
      hadPointerLockRef.current = false;
      pointerLockedRef.current = false;
      resumeOnEscapeKeyupRef.current = false;
      return;
    }
    if (touchControls) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') return;
      const target = event.target;
      const typingIntoField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (chatOpen || typingIntoField) {
        event.preventDefault();
        setChatOpen(false);
        runtimeRef.current?.setPaused(false);
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        if (!touchControls) {
          resumeOnEscapeKeyupRef.current = true;
        }
        return;
      }
      if (event.repeat) return;
      event.preventDefault();
      if (pausedRef.current) { resumeFromPause(true); return; }
      setPaused(true); setPauseView('pause');
      runtimeRef.current?.setPaused(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen, connected, resumeFromPause, touchControls]);

  useEffect(() => {
    if (touchControls || !connected) return;
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape' || !resumeOnEscapeKeyupRef.current) return;
      resumeOnEscapeKeyupRef.current = false;
      runtimeRef.current?.requestPointerLock();
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [connected, touchControls]);

  useEffect(() => {
    if (!connected) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Slash' || event.repeat) return;
      const target = event.target;
      const typingIntoField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (typingIntoField) return;
      event.preventDefault();
      setChatOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connected]);

  useEffect(() => {
    if (touchControls || !connected) return;
    const handlePointerLockChange = (): void => {
      const runtime = runtimeRef.current;
      const wasPointerLocked = pointerLockedRef.current;
      const hasPointerLock = runtime?.isPointerLocked() ?? false;
      const active = document.activeElement;
      const typingIntoField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      pointerLockedRef.current = hasPointerLock;
      if (hasPointerLock) { hadPointerLockRef.current = true; return; }
      if (
        wasPointerLocked &&
        hadPointerLockRef.current &&
        !pausedRef.current &&
        !chatOpen &&
        !typingIntoField
      ) {
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
        .filter(p => p.connected && p.roomCode === connectedRoomCode)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map(p => ({ ...p, kdr: p.deaths === 0 ? p.kills : p.kills / p.deaths, pingMs: playerPings[p.identity] ?? null })),
    [connectedRoomCode, playerPings, players]
  );
  const openRooms = useMemo(
    () =>
      Object.values(rooms)
        .filter(r => r.playerCount > 0 && r.playerCount < 5)
        .sort((a, b) => b.playerCount - a.playerCount || a.code.localeCompare(b.code))
        .slice(0, 6),
    [rooms]
  );
  const localMeta = useMemo(
    () => (localIdentity ? scoreboard.find(player => player.identity === localIdentity) : undefined),
    [localIdentity, scoreboard]
  );
  const eliminated = connected && !localPlayer.alive;

  useEffect(() => {
    if (!eliminated) return;
    setPaused(false); setPauseView('pause'); setChatOpen(false);
    runtimeRef.current?.setPaused(false);
  }, [eliminated]);

  useEffect(() => {
    if (!eliminated || touchControls) return;
    const releasePointerOnMouseMove = (event: MouseEvent): void => {
      if (!document.pointerLockElement) return;
      if (Math.abs(event.movementX) + Math.abs(event.movementY) <= 0) return;
      void document.exitPointerLock();
    };
    window.addEventListener('mousemove', releasePointerOnMouseMove);
    return () => window.removeEventListener('mousemove', releasePointerOnMouseMove);
  }, [eliminated, touchControls]);

  const triggerRespawn = useCallback((): void => {
    void runtimeRef.current?.requestRespawn().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!eliminated) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (event.code !== 'Enter' && event.code !== 'Space') return;
      event.preventDefault();
      triggerRespawn();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [eliminated, triggerRespawn]);

  const sendChat = useCallback((): void => {
    const runtime = runtimeRef.current;
    const text = chatDraft.trim();
    if (!runtime || text.length === 0 || chatBusy) return;
    setChatBusy(true);
    setChatOpen(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    if (!touchControls && connected && localPlayer.alive && !pausedRef.current) {
      runtime.requestPointerLock();
    }
    void runtime
      .sendChatMessage(text)
      .then(() => { setChatDraft(''); })
      .catch(() => undefined)
      .finally(() => { setChatBusy(false); });
  }, [chatBusy, chatDraft, connected, localPlayer.alive, touchControls]);

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
      pingMs: localPingMs,
      pingLowMs: localPingLowMs,
      pingJitterMs: localPingJitterMs,
      serverPipelineMs,
      serverPipelineLowMs,
      nerdPingsEnabled,
      hitmarkerVisible,
      damageFlashToken,
      crosshairSpread,
      scoped,
      selectedWeaponSlot,
      sniperCooldownRemainingMs,
      networkReconnecting,
      networkReconnectAttempt,
      networkReconnectStartedAtMs,
      paused,
      chatOpen,
      chatDraft,
      chatBusy,
      onChatOpen:       () => setChatOpen(true),
      onChatClose:      () => setChatOpen(false),
      onChatDraftChange:(v: string) => setChatDraft(v),
      onChatSend:       sendChat,
    }),
    [
      connected, crosshairSpread, damageFlashToken,
      chatBusy, chatDraft, chatOpen,
      hitmarkerVisible, killFeed, localIdentity,
      localPlayer.health, localPlayer.ammo,
      localMeta?.deaths, localMeta?.kills,
      localPingMs, localPingLowMs, localPingJitterMs, serverPipelineMs, serverPipelineLowMs, nerdPingsEnabled,
      match, networkReconnecting, networkReconnectAttempt, networkReconnectStartedAtMs, paused, selectedWeaponSlot, sendChat, sniperCooldownRemainingMs, scoped, scoreboard, scoreboardOpen,
    ]
  );

  const connectToRoom = (createRoom: boolean, explicitRoomCode?: string): void => {
    if (connectInFlightRef.current || useGameStore.getState().connectionStatus === 'connecting') return;
    const runtime = ensureRuntime();
    if (!runtime) return;
    const targetRoomCode = normalizeRoomCode(explicitRoomCode ?? roomCode);
    if (targetRoomCode !== roomCode) setRoomCode(targetRoomCode);
    connectInFlightRef.current = true;
    void (async () => {
      runtime.unlockAudio();
      try {
        if (createRoom) {
          try {
            const snapshot = await fetchOpenRoomsSnapshot(backendTarget);
            setRoomDirectory(snapshot);
            if (snapshot.some(room => normalizeRoomCode(room.code) === targetRoomCode)) {
              useGameStore
                .getState()
                .setConnection('error', 'Room already exists, hit "Join".');
              return;
            }
          } catch {
            if (rooms[targetRoomCode]) {
              useGameStore
                .getState()
                .setConnection('error', 'Room already exists, hit "Join".');
              return;
            }
          }
        }

        setPaused(false);
        runtime.setPaused(false);
        lockLandscape();
        await runtime.connect({ nickname: effectiveNickname, roomCode: targetRoomCode, createRoom });
        if (useGameStore.getState().connectionStatus === 'connected' && !touchControls) {
          runtime.setPointerLockEnabled(true);
          runtime.requestPointerLock();
        }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Connection failed';
        const message =
          /already exists/i.test(rawMessage)
            ? 'Room already exists, hit "Join".'
            : rawMessage;
        useGameStore.getState().setConnection('error', message);
      } finally {
        connectInFlightRef.current = false;
      }
    })();
  };

  const handleLogin = useCallback(async (identifier: string, password: string): Promise<void> => {
    setAuthBusy(true); setAuthError(null);
    try {
      const snapshot = await loginAccount(identifier, password);
      setAuthSnapshot(snapshot); setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed');
    } finally { setAuthBusy(false); }
  }, []);

  const handleRegister = useCallback(async (email: string, username: string, password: string): Promise<void> => {
    setAuthBusy(true); setAuthError(null);
    try {
      const snapshot = await registerAccount(email, username, password);
      setAuthSnapshot(snapshot); setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Registration failed');
    } finally { setAuthBusy(false); }
  }, []);

  const handleLogout = useCallback(async (): Promise<void> => {
    setAuthBusy(true); setAuthError(null);
    try {
      const snapshot = await logoutAccount();
      setAuthSnapshot(snapshot); setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Logout failed');
    } finally { setAuthBusy(false); }
  }, []);

  const handleBackendTargetChange = useCallback((target: BackendTarget): void => {
    setBackendTargetState(current => {
      if (current === target) return current;
      setBackendTarget(target);
      setLocalPing(null);
      setLocalPingLow(null);
      setLocalPingJitter(null);
      setServerPipeline(null);
      setServerPipelineLow(null);
      return target;
    });
  }, [setLocalPing, setLocalPingLow, setLocalPingJitter, setServerPipeline, setServerPipelineLow]);

  const updateCustomBackendSettings = useCallback(
    (next: CustomBackendSettings): void => {
      setCustomBackendSettingsState(next);
      setCustomBackendSettings(next);
    },
    []
  );

  const handleCustomBackendHostChange = useCallback(
    (host: string): void => {
      updateCustomBackendSettings({ ...customBackendSettings, host });
    },
    [customBackendSettings, updateCustomBackendSettings]
  );

  const handleCustomBackendPortChange = useCallback(
    (port: string): void => {
      updateCustomBackendSettings({ ...customBackendSettings, port });
    },
    [customBackendSettings, updateCustomBackendSettings]
  );

  const handleCustomBackendSecureChange = useCallback(
    (secure: boolean): void => {
      updateCustomBackendSettings({ ...customBackendSettings, secure });
    },
    [customBackendSettings, updateCustomBackendSettings]
  );

  return (
    <div className="cyber-root relative h-full w-full overflow-hidden bg-[#020b14]">
      <CyberGlobalStyles />
      <CyberScanFx showSweep={!connected} />
      <div ref={mountRef} className="absolute inset-0 z-0" />
      <HudOverlay {...hudProps} />
      <MenuOverlay
        connected={connected}
        busy={connecting}
        nickname={effectiveNickname}
        roomCode={roomCode}
        backendConnected={backendConnected}
        backendPingMs={backendPingMs}
        backendPingLowMs={localPingLowMs}
        backendPingJitterMs={localPingJitterMs}
        backendServerPipelineMs={serverPipelineMs}
        backendServerPipelineLowMs={serverPipelineLowMs}
        nerdPingsEnabled={nerdPingsEnabled}
        backendTarget={backendTarget}
        customBackendLabel={customBackendLabel}
        customBackendHost={customBackendSettings.host}
        customBackendPort={customBackendSettings.port}
        customBackendSecure={customBackendSettings.secure}
        openRooms={openRooms}
        connectionError={runtimeError ?? connectionError}
        authError={authError}
        authLoggedIn={authLoggedIn}
        authUsername={authUsername}
        authStats={authStats}
        authBusy={authBusy}
        graphicsQuality={graphicsQuality}
        lookSensitivity={lookSensitivity}
        fov={fov}
        sfxVolume={sfxVolume}
        musicVolume={musicVolume}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onLogout={handleLogout}
        onRefreshStats={() => { void refreshAuthSnapshot(); }}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onNerdPingsChange={setNerdPingsEnabled}
        onNicknameChange={value => { if (authLoggedIn) return; setNickname(value); }}
        onRoomCodeChange={value => setRoomCode(normalizeRoomCode(value))}
        onCreateRoom={() => connectToRoom(true)}
        onJoinRoom={() => connectToRoom(false)}
        onJoinOpenRoom={code => connectToRoom(false, code)}
        onBackendTargetChange={handleBackendTargetChange}
        onCustomBackendHostChange={handleCustomBackendHostChange}
        onCustomBackendPortChange={handleCustomBackendPortChange}
        onCustomBackendSecureChange={handleCustomBackendSecureChange}
        onUseCustomBackend={() => handleBackendTargetChange('custom')}
      />
      <LoadingOverlay
        visible={connecting}
        roomCode={roomCode}
        connectionError={runtimeError ?? connectionError}
        onCancel={() => {
          runtimeRef.current?.disconnect();
        }}
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
        nerdPingsEnabled={nerdPingsEnabled}
        onGraphicsQualityChange={setGraphicsQuality}
        onLookSensitivityChange={setLookSensitivity}
        onFovChange={setFov}
        onSfxVolumeChange={setSfxVolume}
        onMusicVolumeChange={setMusicVolume}
        onNerdPingsChange={setNerdPingsEnabled}
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
        onRespawn={triggerRespawn}
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
