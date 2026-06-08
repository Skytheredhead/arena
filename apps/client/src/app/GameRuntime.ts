import {
  MAX_PITCH,
  RIFLE_CLIP_SIZE,
  RIFLE_CARRY_CAPACITY,
  RIFLE_RESERVE_CAPACITY,
  RELOAD_DURATION_MS,
  SERVER_TICK_MS,
  SNIPER_FIRE_INTERVAL_TICKS,
  WEAPON_SLOT_RIFLE,
  WEAPON_SLOT_SNIPER,
  WEAPON_SLOT_SHOTGUN,
  WALK_SPEED,
  simulatePlayerTick,
  type AmmoPackView,
  type DamageEvent,
  type HealthPackView,
  type ImpactMarkView,
  type InputCommand,
  type LocalPlayerState,
  type Vec3,
  type RemotePlayerState,
  type WeaponSnapshot,
} from '@arena/shared';
import { InputController } from '../input/InputController';
import { LocalPlayerController } from '../player/LocalPlayerController';
import { GameRenderer } from '../rendering/GameRenderer';
import { useGameStore } from '../state/gameStore';
import {
  BASE_REMOTE_INTERPOLATION_DELAY_MS,
  SnapshotBuffer,
  getAdaptiveRemoteInterpolationDelayMs,
  updateRemoteBufferPressure as calculateRemoteBufferPressure,
  type RemoteInterpolationSampleMode,
} from '../netcode/interpolation';
import { type ConnectionStage } from '../netcode/connectionProgress';
import { ConnectOptions, SpacetimeBridge } from '../netcode/SpacetimeBridge';
import { RifleController } from '../weapons/RifleController';
import type { GraphicsQuality } from '../types/settings';
import { AudioManager } from '../audio/AudioManager';
import { getLatencyTailMs } from '../netcode/pingStats';
import { isDamageEventCurrentForLocalPlayer } from '../netcode/damageEvents';
import { publishRuntimeHudFrame } from '../ui/runtimeHudFrame';

declare global {
  interface Window {
    __vectorDriftDebug?: {
      estimatedServerTimeMs: number;
      interpolationDelayMs: number;
      prediction: ReturnType<LocalPlayerController['getDebugState']> | null;
      rejectedShots: number;
      pingMs: number | null;
      pingOnePercentLowMs: number | null;
      serverPipelineMs: number | null;
      serverOnePercentLowMs: number | null;
      remoteBuffers: Record<string, number>;
      remoteInterpolationDelayMs: number;
      remoteUnderrunMs: number;
      remoteSampleModes: Record<string, RemoteInterpolationSampleMode>;
      remoteBufferDepthMs: Record<string, number>;
      localCorrectionOffsetMeters: number;
      spamFire: (count?: number) => Promise<void>;
    };
  }
}

export class GameRuntime {
  private static readonly MOBILE_LOOK_SPEED = 2.8;
  private static readonly DRY_FIRE_COOLDOWN_MS = 180;
  private static readonly FOOTSTEP_MIN_INTERVAL_MS = 430;
  private static readonly REMOTE_FOOTSTEP_MIN_INTERVAL_MS = 300;
  private static readonly REMOTE_FOOTSTEP_MAX_DISTANCE = 24;
  private static readonly PING_AVERAGE_WINDOW_MS = 5_000;
  private static readonly SERVER_PIPELINE_AVERAGE_WINDOW_MS = 5_000;
  private static readonly LOWS_WINDOW_MS = 10_000;
  private static readonly PING_UI_UPDATE_INTERVAL_MS = 250;
  private static readonly INGAME_PING_INTERVAL_MS = 250;
  private static readonly INGAME_PING_BACKGROUND_INTERVAL_MS = 1000;
  private static readonly REMOTE_BUFFER_STALE_MS = 1_800;
  private static readonly REMOTE_BUFFER_PRESSURE_DECAY_PER_SECOND = 0.65;
  private static readonly REMOTE_UNDERRUN_FULL_PRESSURE_MS = 140;
  private static readonly MAX_FRAME_DELTA_MS = 250;
  private static readonly MAX_FIXED_TICKS_PER_FRAME = 8;
  private static readonly INPUT_SEND_INTERVAL_MS = 16;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly rifle = new RifleController();
  private readonly audio = new AudioManager();
  private readonly remoteBuffers = new Map<string, SnapshotBuffer>();
  private readonly impactMarks = new Map<number, ImpactMarkView>();
  private readonly bloodBursts: Array<{
    id: number;
    position: Vec3;
    createdAt: number;
    expiresAt: number;
  }> = [];
  private readonly remoteFootsteps = new Map<
    string,
    { lastPosition: Vec3; strideDistance: number; lastStepAt: number }
  >();
  private localPlayerController: LocalPlayerController | null = null;
  private bridge: SpacetimeBridge | null = null;
  private frameHandle = 0;
  private lastFrameTime = performance.now();
  private accumulatorMs = 0;
  private sequence = 0;
  private latestServerTimeMs = 0;
  private latestServerObservedAt = 0;
  private paused = false;
  private crosshairKick = 0;
  private totalAmmo = RIFLE_CARRY_CAPACITY;
  private magAmmo = RIFLE_CLIP_SIZE;
  private reserveAmmo = RIFLE_RESERVE_CAPACITY;
  private reloadStartedAt = -1;
  private reloadCompletesAt = -1;
  private nextDryFireAt = 0;
  private smoothedPingMs = 48;
  private readonly pendingInputSentAt = new Map<number, number>();
  private queuedNetworkInput: InputCommand | null = null;
  private inputFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInputSendAt = 0;
  private readonly pingSamples: Array<{ at: number; rttMs: number }> = [];
  private readonly serverPipelineSamples: Array<{
    at: number;
    pipelineMs: number;
  }> = [];
  private smoothedServerPipelineMs = 0;
  private lastAuthoritativePipelineMs = 0;
  private adaptiveInterpolationDelayMs =
    BASE_REMOTE_INTERPOLATION_DELAY_MS;
  private remoteBufferPressure = 0;
  private latestRemoteUnderrunMs = 0;
  private latestRemoteSampleModes: Record<string, RemoteInterpolationSampleMode> =
    {};
  private latestRemoteBufferDepthMs: Record<string, number> = {};
  private lastPingUiUpdateAt = 0;
  private pingProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingProbeInFlight = false;
  private preferAckPingSampling = false;
  private walkPhase = 0;
  private walkIntensity = 0;
  private walkStrideDistance = 0;
  private crouchAmount = 0;
  private lastFootstepAt = 0;
  private lastLocalShotAt = -1000;
  private deathViewState: LocalPlayerState | null = null;
  private sniperCooldownEndsAt = 0;
  private onConnectionStageChange: ((stage: ConnectionStage) => void) | null =
    null;
  private hasReceivedInitialLocalState = false;
  private renderErrorReported = false;

  constructor(mount: HTMLElement) {
    this.renderer = new GameRenderer(mount);
    this.input = new InputController(this.renderer.getInputElement());
    const settings = useGameStore.getState();
    this.input.setLookSensitivity(settings.lookSensitivity);
    this.renderer.setGraphicsQuality(settings.graphicsQuality);
    this.renderer.setFov(settings.fov);
    this.audio.setSfxVolume(settings.sfxVolume);
    this.audio.setMusicVolume(settings.musicVolume);
    this.audio.setLobbyActive(true);
    useGameStore.getState().setDisplayedAmmo(this.magAmmo, this.reserveAmmo);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.clearInputFlushTimer();
    this.bridge?.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }

  requestPointerLock(): void {
    this.input.requestPointerLock();
  }

  isPointerLocked(): boolean {
    return this.input.isPointerLocked();
  }

  setTouchControlsActive(active: boolean): void {
    this.input.setTouchControlsActive(active);
  }

  unlockAudio(): void {
    this.audio.unlock();
  }

  setLobbyMusicActive(active: boolean): void {
    this.audio.setLobbyActive(active);
  }

  setVirtualMove(moveX: number, moveZ: number): void {
    this.input.setVirtualMove(moveX, moveZ);
  }

  setVirtualLook(lookX: number, lookY: number): void {
    this.input.setVirtualLook(lookX, lookY);
  }

  setVirtualFireHeld(held: boolean): void {
    this.input.setVirtualFireHeld(held);
  }

  setTextInputActive(active: boolean): void {
    this.input.setTextInputActive(active);
  }

  setPointerLockEnabled(enabled: boolean): void {
    this.input.setPointerLockEnabled(enabled);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.input.clearPressed();
  }

  setLookSensitivity(value: number): void {
    this.input.setLookSensitivity(value);
  }

  setGraphicsQuality(value: GraphicsQuality): void {
    this.renderer.setGraphicsQuality(value);
  }

  setFov(value: number): void {
    this.renderer.setFov(value);
  }

  setSfxVolume(value: number): void {
    this.audio.setSfxVolume(value);
  }

  setMusicVolume(value: number): void {
    this.audio.setMusicVolume(value);
  }

  async requestRespawn(): Promise<void> {
    if (!this.bridge) {
      return;
    }
    await this.bridge.requestRespawn();
  }

  async sendChatMessage(message: string): Promise<void> {
    if (!this.bridge) {
      return;
    }
    await this.bridge.sendChatMessage(message);
  }

  async connect(
    options: ConnectOptions,
    onConnectionStageChange?: (stage: ConnectionStage) => void
  ): Promise<void> {
    this.disconnect();
    this.onConnectionStageChange = onConnectionStageChange ?? null;
    this.hasReceivedInitialLocalState = false;
    useGameStore.getState().resetRuntime();
    useGameStore.getState().setNetworkReconnectState(false, 0, null);
    useGameStore.getState().setNickname(options.nickname);
    useGameStore.getState().setRoomCode(options.roomCode);
    this.onConnectionStageChange?.('opening_socket');

    this.bridge = new SpacetimeBridge({
      onLocalState: (state) => this.handleAuthoritativeLocalState(state),
      onRemoteState: (state) => this.handleRemoteState(state),
      onDamageEvent: (event) => this.handleDamageEvent(event),
      onImpactMark: (mark) => this.handleImpactMark(mark),
      onImpactMarkRemoved: (id) => this.impactMarks.delete(id),
      onServerTick: (serverTimeMs) => this.observeServerTime(serverTimeMs),
      onWeaponState: (weapon) => this.syncAuthoritativeWeaponState(weapon),
      onReconnectStateChange: (state) =>
        useGameStore
          .getState()
          .setNetworkReconnectState(
            state.reconnecting,
            state.attempt,
            state.startedAtMs
          ),
      onConnectionStageChange: (stage) => this.onConnectionStageChange?.(stage),
      onDisconnected: () => this.disconnect(false),
    });

    try {
      await this.bridge.connect(options);
      this.startInGamePingProbe();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Connection failed';
      useGameStore.getState().setConnection('error', message);
      this.disconnect(false);
      throw new Error(message);
    }
  }

  disconnect(resetStatus = true): void {
    this.stopInGamePingProbe();
    this.bridge?.disconnect();
    this.bridge = null;
    this.onConnectionStageChange = null;
    this.hasReceivedInitialLocalState = false;
    this.remoteBuffers.clear();
    this.remoteFootsteps.clear();
    this.impactMarks.clear();
    this.bloodBursts.length = 0;
    this.localPlayerController = null;
    this.sequence = 0;
    this.latestServerTimeMs = 0;
    this.latestServerObservedAt = 0;
    if (resetStatus) {
      useGameStore.getState().setConnection('disconnected', null);
    }
    useGameStore.getState().resetRuntime();
    this.crosshairKick = 0;
    this.totalAmmo = RIFLE_CARRY_CAPACITY;
    this.magAmmo = RIFLE_CLIP_SIZE;
    this.reserveAmmo = RIFLE_RESERVE_CAPACITY;
    this.pendingInputSentAt.clear();
    this.queuedNetworkInput = null;
    this.clearInputFlushTimer();
    this.lastInputSendAt = 0;
    this.smoothedPingMs = 48;
    this.pingSamples.length = 0;
    this.serverPipelineSamples.length = 0;
    this.smoothedServerPipelineMs = 0;
    this.adaptiveInterpolationDelayMs =
      BASE_REMOTE_INTERPOLATION_DELAY_MS;
    this.remoteBufferPressure = 0;
    this.latestRemoteUnderrunMs = 0;
    this.latestRemoteSampleModes = {};
    this.latestRemoteBufferDepthMs = {};
    this.lastPingUiUpdateAt = 0;
    this.preferAckPingSampling = false;
    this.cancelReload();
    this.walkPhase = 0;
    this.walkIntensity = 0;
    this.walkStrideDistance = 0;
    this.crouchAmount = 0;
    this.lastFootstepAt = 0;
    this.deathViewState = null;
    this.sniperCooldownEndsAt = 0;
    this.renderErrorReported = false;
    useGameStore.getState().setSelectedWeaponSlot(WEAPON_SLOT_RIFLE);
    useGameStore.getState().setNetworkReconnectState(false, 0, null);
    publishRuntimeHudFrame({
      crosshairSpread: 0,
      sniperCooldownReady: 1,
    });
    this.applyDisplayedAmmo();
  }

  private handleAuthoritativeLocalState(state: LocalPlayerState): void {
    if (!this.hasReceivedInitialLocalState) {
      this.hasReceivedInitialLocalState = true;
      this.onConnectionStageChange?.('ready');
    }
    this.observeServerTime(state.serverTimeMs);
    this.recordAuthoritativePipelineSample(state.inputPipelineMs);
    this.updateMeasuredPing(state.lastProcessedInput);
    this.sequence = Math.max(this.sequence, state.lastProcessedInput);
    if (!this.localPlayerController) {
      this.localPlayerController = new LocalPlayerController(state);
      this.syncMagazineFromTotal(state.ammo);
      this.deathViewState = state.alive
        ? null
        : {
            ...state,
            position: { ...state.position },
            velocity: { x: 0, y: 0, z: 0 },
          };
      useGameStore.getState().setLocalPlayer(state);
      useGameStore
        .getState()
        .setPredictionDebug(this.localPlayerController.getDebugState());
      return;
    }

    const before = this.localPlayerController.getState();
    const { state: reconciled, snapped } =
      this.localPlayerController.applyAuthoritativeSnapshot(state);

    if (before.alive && !reconciled.alive) {
      this.deathViewState = {
        ...reconciled,
        position: { ...reconciled.position },
        velocity: { x: 0, y: 0, z: 0 },
      };
    } else if (!before.alive && reconciled.alive) {
      // On respawn, clear stale pre-death local samples so movement resumes immediately.
      this.localPlayerController.hydrate(reconciled);
      this.pendingInputSentAt.clear();
      this.sequence = reconciled.lastProcessedInput;
      this.walkStrideDistance = 0;
      this.input.clearPressed();
      this.deathViewState = null;
    } else if (snapped) {
      this.pendingInputSentAt.clear();
      this.sequence = Math.max(this.sequence, reconciled.lastProcessedInput);
    }

    useGameStore.getState().setLocalPlayer(reconciled);
    useGameStore
      .getState()
      .setPredictionDebug(this.localPlayerController.getDebugState());
  }

  private handleRemoteState(state: RemotePlayerState): void {
    this.observeServerTime(state.serverTimeMs);
    let buffer = this.remoteBuffers.get(state.identity);
    if (!buffer) {
      buffer = new SnapshotBuffer();
      this.remoteBuffers.set(state.identity, buffer);
    }

    buffer.push(state);
  }

  private syncAuthoritativeWeaponState(weapon: WeaponSnapshot): void {
    const nextMagAmmo = Math.max(
      0,
      Math.min(RIFLE_CLIP_SIZE, weapon.ammoInMag)
    );
    const nextReserveAmmo = Math.max(
      0,
      Math.min(RIFLE_RESERVE_CAPACITY, weapon.reserveAmmo)
    );
    const previousVisualAmmo = this.totalAmmo;
    const nextVisualAmmo = nextMagAmmo + nextReserveAmmo;

    const ammoGain = nextVisualAmmo - previousVisualAmmo;
    this.magAmmo = nextMagAmmo;
    this.reserveAmmo = nextReserveAmmo;
    this.totalAmmo = nextVisualAmmo;
    if (this.localPlayerController) {
      this.localPlayerController.setAmmo(nextVisualAmmo);
    }
    useGameStore.getState().setLocalPlayer({ ammo: nextVisualAmmo });

    if (ammoGain > 0 && ammoGain <= 8) {
      this.audio.play('bulletPickup', {
        volume: 0.65,
        playbackRateMin: 0.93,
        playbackRateMax: 1.07,
      });
    }

    if (weapon.reloading) {
      this.reloadStartedAt = weapon.reloadStartedTick * SERVER_TICK_MS;
      this.reloadCompletesAt = weapon.reloadCompleteTick * SERVER_TICK_MS;
    } else {
      this.reloadStartedAt = -1;
      this.reloadCompletesAt = -1;
    }
    useGameStore.getState().setSelectedWeaponSlot(weapon.selectedWeaponSlot);
    this.applyDisplayedAmmo();
  }

  private applyDisplayedAmmo(): void {
    useGameStore.getState().setDisplayedAmmo(this.magAmmo, this.reserveAmmo);
  }

  private syncMagazineFromTotal(totalAmmo: number): void {
    const clamped = Math.max(0, Math.min(RIFLE_CARRY_CAPACITY, totalAmmo));
    this.totalAmmo = clamped;
    this.magAmmo = Math.min(RIFLE_CLIP_SIZE, clamped);
    this.reserveAmmo = Math.max(0, clamped - this.magAmmo);
    this.applyDisplayedAmmo();
  }

  private startReload(now: number): void {
    if (this.reloadCompletesAt >= now) {
      return;
    }
    if (this.magAmmo >= RIFLE_CLIP_SIZE) {
      return;
    }
    if (this.reserveAmmo <= 0) {
      return;
    }

    this.reloadStartedAt = now;
    this.reloadCompletesAt = now + RELOAD_DURATION_MS;
    this.audio.play('reload', {
      volume: 0.45,
      playbackRateMin: 0.96,
      playbackRateMax: 1.04,
    });
  }

  private completeReloadIfReady(now: number): void {
    if (this.reloadCompletesAt < 0 || now < this.reloadCompletesAt) {
      return;
    }
    this.reloadStartedAt = -1;
    this.reloadCompletesAt = -1;
    this.applyDisplayedAmmo();
  }

  private cancelReload(): void {
    this.reloadStartedAt = -1;
    this.reloadCompletesAt = -1;
  }

  private getReloadProgress(now: number): number {
    if (this.reloadCompletesAt < 0 || this.reloadStartedAt < 0) {
      return 0;
    }
    const duration = Math.max(1, this.reloadCompletesAt - this.reloadStartedAt);
    return Math.max(0, Math.min(1, (now - this.reloadStartedAt) / duration));
  }

  private handleImpactMark(mark: ImpactMarkView): void {
    this.impactMarks.set(mark.id, mark);
    const now = performance.now();
    if (now - this.lastLocalShotAt <= 220) {
      this.audio.play('bulletWallHit', {
        volume: 0.55,
        playbackRateMin: 0.94,
        playbackRateMax: 1.06,
      });
    }
  }

  private handleDamageEvent(event: DamageEvent): void {
    const store = useGameStore.getState();
    if (
      !isDamageEventCurrentForLocalPlayer(
        event,
        store.connectedRoomCode,
        store.localPlayer.respawnTick
      )
    ) {
      return;
    }

    const localIdentity = store.localIdentity;
    const now = performance.now();

    if (event.victimIdentity === localIdentity) {
      store.triggerDamageFlash();
      this.audio.play('flyby', {
        volume: 0.5,
        playbackRateMin: 0.95,
        playbackRateMax: 1.07,
      });
      if (event.causedDeath) {
        this.audio.play('death', {
          volume: 0.68,
          playbackRateMin: 0.94,
          playbackRateMax: 1.05,
        });
        const predicted =
          this.localPlayerController?.getState() ?? store.localPlayer;
        const deadState: LocalPlayerState = {
          ...predicted,
          alive: false,
          health: 0,
          velocity: { x: 0, y: 0, z: 0 },
          serverTick: Math.max(predicted.serverTick, event.tick),
          serverTimeMs: event.tick * SERVER_TICK_MS,
          inputPipelineMs: predicted.inputPipelineMs,
          respawnTick: event.tick,
        };
        if (this.localPlayerController) {
          this.localPlayerController.hydrate(deadState);
        }
        this.deathViewState = {
          ...deadState,
          position: { ...deadState.position },
          velocity: { x: 0, y: 0, z: 0 },
        };
        store.setLocalPlayer(deadState);
      }
    }

    if (
      event.attackerIdentity !== localIdentity ||
      event.victimIdentity === localIdentity
    ) {
      return;
    }

    const victim = store.remotePlayers[event.victimIdentity];
    if (!victim || !victim.alive) {
      return;
    }

    this.bloodBursts.push({
      id: event.id,
      position: {
        x: victim.position.x,
        y: victim.position.y + 1.0,
        z: victim.position.z,
      },
      createdAt: now,
      expiresAt: now + 320,
    });
    this.audio.play('bulletBodyHit', {
      volume: 0.65,
      playbackRateMin: 0.92,
      playbackRateMax: 1.05,
    });
  }

  private readonly frame = (now: number): void => {
    const rawDeltaMs = Math.max(0, now - this.lastFrameTime);
    this.lastFrameTime = now;
    const deltaMs = Math.min(rawDeltaMs, GameRuntime.MAX_FRAME_DELTA_MS);
    const deltaSeconds = deltaMs / 1000;
    this.accumulatorMs = Math.min(
      GameRuntime.MAX_FRAME_DELTA_MS,
      this.accumulatorMs + deltaMs
    );
    this.rifle.update(deltaSeconds);
    this.crosshairKick = Math.max(0, this.crosshairKick - deltaSeconds * 18);

    const store = useGameStore.getState();
    store.pruneKillFeed(now);
    this.completeReloadIfReady(now);
    const frameInput = this.input.peekFrameInput();
    store.setScoreboardOpen(frameInput.scoreboardHeld);
    store.setScoped(frameInput.scoped);
    store.setSelectedWeaponSlot(frameInput.weaponSlot);
    let sniperCooldownReady = 1;
    if (frameInput.weaponSlot === WEAPON_SLOT_SNIPER) {
      const remainingMs = Math.max(0, this.sniperCooldownEndsAt - now);
      sniperCooldownReady = Math.max(
        0,
        Math.min(
          1,
          1 - remainingMs / (SNIPER_FIRE_INTERVAL_TICKS * SERVER_TICK_MS)
        )
      );
    }

    const predictedForLook = this.localPlayerController?.getState();
    if (
      this.localPlayerController &&
      predictedForLook &&
      !this.paused &&
      predictedForLook.alive
    ) {
      const look = this.input.consumeLook();
      const lookStick = this.input.getVirtualLook();
      if (lookStick.x !== 0 || lookStick.y !== 0) {
        look.yawDelta +=
          lookStick.x * GameRuntime.MOBILE_LOOK_SPEED * deltaSeconds;
        look.pitchDelta +=
          lookStick.y * GameRuntime.MOBILE_LOOK_SPEED * deltaSeconds;
      }
      if (look.yawDelta !== 0 || look.pitchDelta !== 0) {
        this.localPlayerController.applyLook(look.yawDelta, look.pitchDelta);
      }
    }

    let simulatedTicks = 0;
    while (
      this.accumulatorMs >= SERVER_TICK_MS &&
      simulatedTicks < GameRuntime.MAX_FIXED_TICKS_PER_FRAME
    ) {
      this.fixedTick(now);
      this.accumulatorMs -= SERVER_TICK_MS;
      simulatedTicks += 1;
    }
    if (this.accumulatorMs >= SERVER_TICK_MS) {
      // Drop excess backlog after long stalls so the local controller does not
      // burst many samples into the server validator at once.
      this.accumulatorMs = Math.min(this.accumulatorMs, SERVER_TICK_MS * 0.5);
    }

    const renderDelayMs = this.getAdaptiveInterpolationDelayMs();
    const renderServerTimeMs = Math.max(
      0,
      this.estimateServerTimeMs(now) - renderDelayMs
    );
    const connectedRoomCode = useGameStore.getState().connectedRoomCode;
    const remotePlayers: RemotePlayerState[] = [];
    const remoteSampleModes: Record<string, RemoteInterpolationSampleMode> = {};
    const remoteBufferDepthMs: Record<string, number> = {};
    let maxRemoteUnderrunMs = 0;
    for (const [identity, buffer] of this.remoteBuffers) {
      const meta = useGameStore.getState().players[identity];
      const staleBuffer =
        now - buffer.lastPushAtMsValue() > GameRuntime.REMOTE_BUFFER_STALE_MS;
      if (staleBuffer) {
        this.remoteBuffers.delete(identity);
        useGameStore.getState().removeRemotePlayer(identity);
        useGameStore.getState().setPlayerPing(identity, null);
        continue;
      }
      if (meta && !meta.connected) {
        this.remoteBuffers.delete(identity);
        useGameStore.getState().removeRemotePlayer(identity);
        useGameStore.getState().setPlayerPing(identity, null);
        continue;
      }

      const sampleResult = buffer.sampleWithMeta(renderServerTimeMs);
      if (!sampleResult) {
        continue;
      }
      remoteSampleModes[identity] = sampleResult.mode;
      remoteBufferDepthMs[identity] = sampleResult.bufferDepthMs;
      maxRemoteUnderrunMs = Math.max(
        maxRemoteUnderrunMs,
        sampleResult.underrunMs
      );
      const sample = sampleResult.state;
      if (
        connectedRoomCode &&
        sample.roomCode &&
        sample.roomCode !== connectedRoomCode
      ) {
        useGameStore.getState().removeRemotePlayer(identity);
        useGameStore.getState().setPlayerPing(identity, null);
        continue;
      }

      useGameStore.getState().upsertRemotePlayer(sample);
      remotePlayers.push(sample);
    }
    this.latestRemoteSampleModes = remoteSampleModes;
    this.latestRemoteBufferDepthMs = remoteBufferDepthMs;
    this.updateRemoteBufferPressure(maxRemoteUnderrunMs, deltaSeconds);

    const currentLocal = this.getPresentedLocalState();
    const speed = Math.hypot(currentLocal.velocity.x, currentLocal.velocity.z);
    const movingOnGround =
      currentLocal.onGround && currentLocal.alive && speed > 1.25;
    const crouchTarget = frameInput.crouching || currentLocal.crouching ? 1 : 0;
    this.crouchAmount +=
      (crouchTarget - this.crouchAmount) * Math.min(1, deltaSeconds * 12);
    const targetWalkIntensity = movingOnGround
      ? Math.max(0.12, Math.min(1, speed / Math.max(0.01, WALK_SPEED)))
      : 0;
    this.walkIntensity +=
      (targetWalkIntensity - this.walkIntensity) *
      Math.min(1, deltaSeconds * 9);
    if (movingOnGround) {
      this.walkPhase += deltaSeconds * (7.3 + this.walkIntensity * 4.2);
      const stride = Math.max(0.35, 0.58 - this.walkIntensity * 0.12);
      this.walkStrideDistance += speed * deltaSeconds;
      const enoughStride = this.walkStrideDistance >= stride;
      const footstepReady =
        now - this.lastFootstepAt >= GameRuntime.FOOTSTEP_MIN_INTERVAL_MS;
      if (enoughStride && footstepReady) {
        this.walkStrideDistance -= stride;
        this.lastFootstepAt = now;
        this.audio.play('footstep', {
          volume: 0.32 + this.walkIntensity * 0.16,
          playbackRateMin: 0.9,
          playbackRateMax: 1.1,
        });
      } else if (this.walkStrideDistance > stride * 2.4) {
        // Prevent huge backlog bursts after long frames/background tab throttling.
        this.walkStrideDistance = stride * 1.1;
      }
    } else {
      this.walkStrideDistance = 0;
      this.walkPhase += deltaSeconds * 1.6;
    }

    this.updateRemoteFootsteps(remotePlayers, currentLocal, deltaSeconds, now);

    const weaponSpread =
      frameInput.weaponSlot === WEAPON_SLOT_SNIPER
        ? frameInput.scoped
          ? Math.min(6, speed * 0.75)
          : Math.min(36, 20 + speed * 3.2)
        : frameInput.weaponSlot === WEAPON_SLOT_SHOTGUN
          ? frameInput.scoped
            ? Math.min(24, 11 + speed * 1.85)
            : Math.min(38, 18 + speed * 3.05)
          : frameInput.scoped
            ? Math.min(12, speed * 1.2)
            : Math.min(20, speed * 2.4);
    publishRuntimeHudFrame({
      crosshairSpread: Math.max(0, weaponSpread + this.crosshairKick),
      sniperCooldownReady,
    });

    const ammoPacks: AmmoPackView[] = Object.values(
      useGameStore.getState().ammoPacks
    ).filter(
      (pack) => !connectedRoomCode || pack.roomCode === connectedRoomCode
    );
    const healthPacks: HealthPackView[] = Object.values(
      useGameStore.getState().healthPacks
    ).filter(
      (pack) => !connectedRoomCode || pack.roomCode === connectedRoomCode
    );
    const bloodBursts = this.bloodBursts.filter(
      (burst) => burst.expiresAt > now
    );
    if (bloodBursts.length !== this.bloodBursts.length) {
      this.bloodBursts.length = 0;
      this.bloodBursts.push(...bloodBursts);
    }
    this.publishDebug(now);
    const estimatedServerTimeMs = this.estimateServerTimeMs(now);
    const renderFrame = {
      localPlayer: currentLocal,
      remotePlayers,
      ammoPacks,
      healthPacks,
      impactMarks: Array.from(this.impactMarks.values()).filter(
        (mark) => !connectedRoomCode || mark.roomCode === connectedRoomCode
      ),
      bloodBursts,
      scoped: frameInput.scoped,
      weaponSlot: frameInput.weaponSlot,
      deltaSeconds,
      recoil: this.rifle.getRecoil(),
      muzzleFlashVisible: useGameStore.getState().muzzleFlashUntil > now,
      walkPhase: this.walkPhase,
      walkIntensity: this.walkIntensity,
      crouchAmount: this.crouchAmount,
      crouched: frameInput.crouching || currentLocal.crouching,
      reloadProgress: this.getReloadProgress(now),
      estimatedServerTimeMs,
    };
    try {
      this.renderer.render(renderFrame);
    } catch (error) {
      if (!this.renderErrorReported) {
        this.renderErrorReported = true;
        console.error(
          'Render frame failed; retrying without transient shot effects.',
          error
        );
      }
      try {
        this.renderer.render({
          ...renderFrame,
          impactMarks: [],
          bloodBursts: [],
          muzzleFlashVisible: false,
        });
      } catch (retryError) {
        if (!this.renderErrorReported) {
          console.error('Render retry failed.', retryError);
        }
      }
    }

    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private updateRemoteFootsteps(
    remotePlayers: RemotePlayerState[],
    localPlayer: LocalPlayerState,
    deltaSeconds: number,
    now: number
  ): void {
    const activeIds = new Set(remotePlayers.map((player) => player.identity));
    for (const identity of Array.from(this.remoteFootsteps.keys())) {
      if (!activeIds.has(identity)) {
        this.remoteFootsteps.delete(identity);
      }
    }

    for (const remote of remotePlayers) {
      let footprint = this.remoteFootsteps.get(remote.identity);
      if (!footprint) {
        footprint = {
          lastPosition: { ...remote.position },
          strideDistance: 0,
          lastStepAt: Number.NEGATIVE_INFINITY,
        };
      }

      if (!remote.alive) {
        footprint.lastPosition = { ...remote.position };
        footprint.strideDistance = 0;
        this.remoteFootsteps.set(remote.identity, footprint);
        continue;
      }

      const dx = remote.position.x - footprint.lastPosition.x;
      const dz = remote.position.z - footprint.lastPosition.z;
      const movedDistance = Math.hypot(dx, dz);
      footprint.lastPosition = { ...remote.position };

      const horizontalSpeed = Math.hypot(remote.velocity.x, remote.velocity.z);
      const inferredSpeed =
        movedDistance > 0
          ? movedDistance / Math.max(0.001, deltaSeconds)
          : horizontalSpeed;
      const roughlyGrounded = Math.abs(remote.velocity.y) < 1.6;
      const movingOnGround = inferredSpeed > 1.2 && roughlyGrounded;
      if (!movingOnGround) {
        footprint.strideDistance = 0;
        this.remoteFootsteps.set(remote.identity, footprint);
        continue;
      }

      const stride = Math.max(
        0.33,
        0.56 - Math.min(1, inferredSpeed / Math.max(0.01, WALK_SPEED)) * 0.1
      );
      footprint.strideDistance +=
        movedDistance > 0 ? movedDistance : inferredSpeed * deltaSeconds;
      const readyByStride = footprint.strideDistance >= stride;
      const readyByTime =
        now - footprint.lastStepAt >=
        GameRuntime.REMOTE_FOOTSTEP_MIN_INTERVAL_MS;
      if (readyByStride && readyByTime) {
        const distanceToLocal = Math.hypot(
          remote.position.x - localPlayer.position.x,
          remote.position.z - localPlayer.position.z
        );
        if (distanceToLocal <= GameRuntime.REMOTE_FOOTSTEP_MAX_DISTANCE) {
          this.audio.playFootstepSpatial({
            sourcePosition: {
              x: remote.position.x,
              y: remote.position.y + 0.1,
              z: remote.position.z,
            },
            listenerPosition: {
              x: localPlayer.position.x,
              y: localPlayer.position.y + 1.58,
              z: localPlayer.position.z,
            },
            listenerYaw: localPlayer.yaw,
            volume: Math.max(
              0.12,
              0.5 *
                (1 - distanceToLocal / GameRuntime.REMOTE_FOOTSTEP_MAX_DISTANCE)
            ),
            playbackRateMin: 0.92,
            playbackRateMax: 1.08,
          });
        }

        footprint.lastStepAt = now;
        footprint.strideDistance -= stride;
      } else if (footprint.strideDistance > stride * 2.6) {
        footprint.strideDistance = stride * 1.2;
      }

      this.remoteFootsteps.set(remote.identity, footprint);
    }
  }

  private getPresentedLocalState(): LocalPlayerState {
    const local = this.localPlayerController?.getState();
    if (!local) {
      return useGameStore.getState().localPlayer;
    }

    if (!local.alive && this.deathViewState) {
      return {
        ...local,
        position: { ...this.deathViewState.position },
        velocity: { ...this.deathViewState.velocity },
        yaw: this.deathViewState.yaw,
        pitch: this.deathViewState.pitch,
      };
    }

    const partialTickSeconds = this.accumulatorMs / 1000;
    return partialTickSeconds > 0
      ? simulatePlayerTick(
          local,
          this.input.buildInputCommand(
            this.sequence,
            local.yaw,
            local.pitch,
            this.input.peekFrameInput()
          ),
          partialTickSeconds
        )
      : local;
  }

  private fixedTick(now: number): void {
    if (
      !this.localPlayerController ||
      !this.bridge ||
      this.paused ||
      useGameStore.getState().connectionStatus !== 'connected'
    ) {
      return;
    }

    const frameInput = this.input.getFrameInput();
    const local = this.localPlayerController.getState();
    if (!local.alive) {
      return;
    }
    const command = this.input.buildInputCommand(
      ++this.sequence,
      local.yaw,
      local.pitch,
      frameInput
    );
    const localState = this.localPlayerController.step(command);
    useGameStore.getState().setLocalPlayer(localState);
    useGameStore
      .getState()
      .setPredictionDebug(this.localPlayerController.getDebugState());
    this.enqueueNetworkInput(command, now);

    if (frameInput.wantsReload) {
      this.startReload(now);
    }

    if (frameInput.wantsFire) {
      if (this.magAmmo <= 0) {
        if (now >= this.nextDryFireAt) {
          this.audio.play('magEmpty', {
            volume: 0.6,
            playbackRateMin: 0.96,
            playbackRateMax: 1.05,
          });
          this.nextDryFireAt = now + GameRuntime.DRY_FIRE_COOLDOWN_MS;
        }
        if (this.reserveAmmo > 0 && frameInput.wantsReload) {
          this.startReload(now);
        }
        return;
      }

      const fireIntervalTicks = this.bridge.getFireIntervalTicks(
        frameInput.weaponSlot
      );
      if (this.rifle.tryFire(now, fireIntervalTicks)) {
        this.cancelReload();
        const fireSfxKey =
          frameInput.weaponSlot === WEAPON_SLOT_SNIPER
            ? 'sniperShot'
            : frameInput.weaponSlot === WEAPON_SLOT_SHOTGUN
              ? 'shotgunShot'
              : 'shot';
        this.audio.play(fireSfxKey, {
          volume: 0.75,
          playbackRateMin:
            frameInput.weaponSlot === WEAPON_SLOT_SNIPER
              ? 0.985
              : frameInput.weaponSlot === WEAPON_SLOT_SHOTGUN
                ? 0.94
                : 0.95,
          playbackRateMax:
            frameInput.weaponSlot === WEAPON_SLOT_SNIPER
              ? 1.015
              : frameInput.weaponSlot === WEAPON_SLOT_SHOTGUN
                ? 1.02
                : 1.05,
        });
        this.lastLocalShotAt = now;
        if (frameInput.weaponSlot === WEAPON_SLOT_SNIPER) {
          this.sniperCooldownEndsAt = now + fireIntervalTicks * SERVER_TICK_MS;
        }
        useGameStore
          .getState()
          .triggerMuzzleFlash(this.rifle.getMuzzleFlashUntil(now));
        const kick =
          frameInput.weaponSlot === WEAPON_SLOT_SNIPER
            ? frameInput.scoped
              ? 0.3
              : 2.6
            : frameInput.weaponSlot === WEAPON_SLOT_SHOTGUN
              ? frameInput.scoped
                ? 0.9
                : 1.8
              : frameInput.scoped
                ? 0.7
                : 1.4;
        this.crosshairKick = Math.min(20, this.crosshairKick + kick);
        const shotYaw = localState.yaw;
        const shotPitch = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, localState.pitch)
        );
        void shotYaw;
        void shotPitch;
      }
    }
  }

  private enqueueNetworkInput(command: InputCommand, now: number): void {
    this.queuedNetworkInput = this.mergeQueuedNetworkInput(
      this.queuedNetworkInput,
      command
    );
    const mustFlush = command.reloadPressed;
    if (
      !mustFlush &&
      now - this.lastInputSendAt < GameRuntime.INPUT_SEND_INTERVAL_MS
    ) {
      this.scheduleInputFlush();
      return;
    }

    this.flushQueuedNetworkInput(now, mustFlush);
  }

  private mergeQueuedNetworkInput(
    previous: InputCommand | null,
    next: InputCommand
  ): InputCommand {
    if (!previous) {
      return next;
    }

    return {
      ...next,
      fireHeld: previous.fireHeld || next.fireHeld,
      reloadPressed: previous.reloadPressed || next.reloadPressed,
    };
  }

  private flushQueuedNetworkInput(now = performance.now(), force = false): void {
    if (!this.bridge || !this.queuedNetworkInput) {
      return;
    }

    if (
      !force &&
      now - this.lastInputSendAt < GameRuntime.INPUT_SEND_INTERVAL_MS
    ) {
      this.scheduleInputFlush();
      return;
    }

    this.clearInputFlushTimer();
    const command = this.queuedNetworkInput;
    this.queuedNetworkInput = null;
    this.lastInputSendAt = now;
    this.pendingInputSentAt.set(command.sequence, now);
    if (this.pendingInputSentAt.size > 128) {
      const staleSequences = Array.from(this.pendingInputSentAt.keys())
        .sort((left, right) => left - right)
        .slice(0, this.pendingInputSentAt.size - 128);
      for (const sequence of staleSequences) {
        this.pendingInputSentAt.delete(sequence);
      }
    }

    void this.bridge.submitInput(command).catch(() => undefined);
  }

  private scheduleInputFlush(): void {
    if (this.inputFlushTimer || !this.queuedNetworkInput) {
      return;
    }
    const delay = Math.max(
      0,
      GameRuntime.INPUT_SEND_INTERVAL_MS -
        (performance.now() - this.lastInputSendAt)
    );
    this.inputFlushTimer = setTimeout(() => {
      this.inputFlushTimer = null;
      this.flushQueuedNetworkInput();
    }, delay);
  }

  private clearInputFlushTimer(): void {
    if (!this.inputFlushTimer) {
      return;
    }
    clearTimeout(this.inputFlushTimer);
    this.inputFlushTimer = null;
  }

  private observeServerTime(serverTimeMs: number): void {
    if (serverTimeMs < this.latestServerTimeMs) {
      return;
    }

    this.latestServerTimeMs = serverTimeMs;
    this.latestServerObservedAt = performance.now();
  }

  private estimateServerTimeMs(now: number): number {
    if (this.latestServerObservedAt === 0) {
      return this.latestServerTimeMs;
    }

    return this.latestServerTimeMs + (now - this.latestServerObservedAt);
  }

  private updateRemoteBufferPressure(
    maxUnderrunMs: number,
    deltaSeconds: number
  ): void {
    this.latestRemoteUnderrunMs = maxUnderrunMs;
    this.remoteBufferPressure = calculateRemoteBufferPressure({
      previousPressure: this.remoteBufferPressure,
      maxUnderrunMs,
      deltaSeconds,
      fullPressureUnderrunMs: GameRuntime.REMOTE_UNDERRUN_FULL_PRESSURE_MS,
      decayPerSecond: GameRuntime.REMOTE_BUFFER_PRESSURE_DECAY_PER_SECOND,
    });
  }

  private getAdaptiveInterpolationDelayMs(): number {
    const store = useGameStore.getState();
    const targetDelay = getAdaptiveRemoteInterpolationDelayMs({
      pingMs: store.localPingMs ?? this.smoothedPingMs,
      jitterMs: store.localPingJitterMs,
      serverPipelineMs: store.serverPipelineMs ?? this.smoothedServerPipelineMs,
      remoteBufferPressure: this.remoteBufferPressure,
      reconnecting: store.networkReconnecting,
    });
    const blend = targetDelay > this.adaptiveInterpolationDelayMs ? 0.35 : 0.04;
    this.adaptiveInterpolationDelayMs =
      this.adaptiveInterpolationDelayMs * (1 - blend) + targetDelay * blend;
    return this.adaptiveInterpolationDelayMs;
  }

  private updateMeasuredPing(lastProcessedInput: number): void {
    if (lastProcessedInput <= 0) {
      return;
    }
    const sentAt = this.pendingInputSentAt.get(lastProcessedInput);
    for (const sequence of Array.from(this.pendingInputSentAt.keys())) {
      if (sequence <= lastProcessedInput) {
        this.pendingInputSentAt.delete(sequence);
      }
    }
    if (this.preferAckPingSampling && sentAt != null) {
      this.recordMeasuredRttSample(performance.now() - sentAt);
    }
  }

  private recordAuthoritativePipelineSample(
    measuredPipelineMs: number,
    now = performance.now()
  ): void {
    const clampedPipelineMs = Math.max(0, Math.min(999, measuredPipelineMs));
    this.lastAuthoritativePipelineMs = clampedPipelineMs;
    this.smoothedServerPipelineMs =
      this.smoothedServerPipelineMs * 0.8 + clampedPipelineMs * 0.2;
    this.serverPipelineSamples.push({
      at: now,
      pipelineMs: clampedPipelineMs,
    });
    const lowsCutoff = now - GameRuntime.LOWS_WINDOW_MS;
    while (
      (this.serverPipelineSamples.at(0)?.at ?? Number.POSITIVE_INFINITY) <
      lowsCutoff
    ) {
      this.serverPipelineSamples.shift();
    }
  }

  private recordMeasuredRttSample(
    measuredRttMs: number,
    now = performance.now()
  ): void {
    const clampedRttMs = Math.max(1, Math.min(999, measuredRttMs));
    this.smoothedPingMs = this.smoothedPingMs * 0.8 + clampedRttMs * 0.2;
    this.pingSamples.push({ at: now, rttMs: clampedRttMs });
    const lowsCutoff = now - GameRuntime.LOWS_WINDOW_MS;
    while (
      (this.pingSamples.at(0)?.at ?? Number.POSITIVE_INFINITY) < lowsCutoff
    ) {
      this.pingSamples.shift();
    }

    const pingCutoff = now - GameRuntime.PING_AVERAGE_WINDOW_MS;
    const averageWindowSamples = this.pingSamples.filter(
      (sample) => sample.at >= pingCutoff
    );
    const sampleSet =
      averageWindowSamples.length > 0
        ? averageWindowSamples
        : this.pingSamples.length > 0
          ? this.pingSamples
          : [{ at: now, rttMs: this.smoothedPingMs }];
    const averagePing =
      sampleSet.reduce((acc, sample) => acc + sample.rttMs, 0) /
      sampleSet.length;
    const variance =
      sampleSet.reduce((acc, sample) => {
        const delta = sample.rttMs - averagePing;
        return acc + delta * delta;
      }, 0) / sampleSet.length;
    const jitterMs = Math.sqrt(variance);
    const pingLowWindowValues = this.pingSamples.map((sample) => sample.rttMs);
    const pingOnePercentLowMs = getLatencyTailMs(
      pingLowWindowValues,
      averagePing
    );

    const roundedPingMs = Math.max(1, Math.round(averagePing));
    const roundedPingOnePercentLowMs = Math.max(
      1,
      Math.round(pingOnePercentLowMs)
    );
    const store = useGameStore.getState();
    store.pushServerPingSample({
      atMs: Date.now(),
      source: 'ingame',
      pingMs: clampedRttMs,
      pipelineMs: this.lastAuthoritativePipelineMs,
    });
    const serverAverageCutoff =
      now - GameRuntime.SERVER_PIPELINE_AVERAGE_WINDOW_MS;
    const pipelineValues = this.serverPipelineSamples
      .filter((sample) => sample.at >= serverAverageCutoff)
      .map((sample) => sample.pipelineMs);
    const serverLowWindowValues = this.serverPipelineSamples.map(
      (sample) => sample.pipelineMs
    );
    const serverOnePercentLowMs = getLatencyTailMs(
      serverLowWindowValues,
      this.smoothedServerPipelineMs
    );

    const shouldUpdatePing =
      this.lastPingUiUpdateAt === 0 ||
      now - this.lastPingUiUpdateAt >= GameRuntime.PING_UI_UPDATE_INTERVAL_MS;
    if (shouldUpdatePing) {
      this.lastPingUiUpdateAt = now;
      store.setLocalPing(roundedPingMs);
      store.setLocalPingLow(roundedPingOnePercentLowMs);
      store.setLocalPingJitter(Math.max(0, Math.round(jitterMs)));
      const pipelineAverage =
        pipelineValues.length === 0
          ? this.smoothedServerPipelineMs
          : pipelineValues.reduce((sum, value) => sum + value, 0) /
            pipelineValues.length;
      store.setServerPipeline(Math.max(0, Math.round(pipelineAverage)));
      store.setServerPipelineLow(
        Math.max(0, Math.round(serverOnePercentLowMs))
      );
      if (store.localIdentity) {
        store.setPlayerPing(store.localIdentity, roundedPingMs);
      }
    }
  }

  private getPingProbeIntervalMs(): number {
    if (typeof document === 'undefined') {
      return GameRuntime.INGAME_PING_INTERVAL_MS;
    }
    const active =
      document.visibilityState === 'visible' && document.hasFocus();
    return active
      ? GameRuntime.INGAME_PING_INTERVAL_MS
      : GameRuntime.INGAME_PING_BACKGROUND_INTERVAL_MS;
  }

  private stopInGamePingProbe(): void {
    if (this.pingProbeTimer) {
      clearTimeout(this.pingProbeTimer);
      this.pingProbeTimer = null;
    }
    this.pingProbeInFlight = false;
  }

  private startInGamePingProbe(): void {
    this.stopInGamePingProbe();
    const loop = (): void => {
      if (!this.bridge) {
        return;
      }
      const store = useGameStore.getState();
      if (store.connectionStatus !== 'connected' || store.networkReconnecting) {
        this.pingProbeTimer = setTimeout(loop, this.getPingProbeIntervalMs());
        return;
      }
      if (this.pingProbeInFlight) {
        this.pingProbeTimer = setTimeout(loop, this.getPingProbeIntervalMs());
        return;
      }

      this.pingProbeInFlight = true;
      const startedAt = performance.now();
      void this.bridge
        .ping()
        .then(() => {
          this.preferAckPingSampling = false;
          this.recordMeasuredRttSample(performance.now() - startedAt);
        })
        .catch(() => {
          this.preferAckPingSampling = true;
        })
        .finally(() => {
          this.pingProbeInFlight = false;
          if (!this.bridge) {
            return;
          }
          this.pingProbeTimer = setTimeout(loop, this.getPingProbeIntervalMs());
        });
    };

    loop();
  }

  private publishDebug(now: number): void {
    const store = useGameStore.getState();
    window.__vectorDriftDebug = {
      estimatedServerTimeMs: this.estimateServerTimeMs(now),
      interpolationDelayMs: this.adaptiveInterpolationDelayMs,
      prediction: this.localPlayerController?.getDebugState() ?? null,
      rejectedShots: useGameStore.getState().rejectedShots,
      pingMs: store.localPingMs,
      pingOnePercentLowMs: store.localPingLowMs,
      serverPipelineMs: store.serverPipelineMs,
      serverOnePercentLowMs: store.serverPipelineLowMs,
      remoteBuffers: Object.fromEntries(
        Array.from(this.remoteBuffers.entries()).map(([identity, buffer]) => [
          identity,
          buffer.size(),
        ])
      ),
      remoteInterpolationDelayMs: this.adaptiveInterpolationDelayMs,
      remoteUnderrunMs: this.latestRemoteUnderrunMs,
      remoteSampleModes: this.latestRemoteSampleModes,
      remoteBufferDepthMs: this.latestRemoteBufferDepthMs,
      localCorrectionOffsetMeters: 0,
      spamFire: async (count = 3) => {
        if (!this.bridge || !this.localPlayerController) {
          return;
        }

        const weaponSlot = this.input.getSelectedWeaponSlot();
        for (let index = 0; index < count; index += 1) {
          const state = this.localPlayerController.getState();
          try {
            await this.bridge.submitInput({
              sequence: ++this.sequence,
              moveX: 0,
              moveZ: 0,
              yaw: state.yaw,
              pitch: state.pitch,
              jumpHeld: false,
              sprintHeld: false,
              crouchHeld: state.crouching,
              scoped: false,
              fireHeld: true,
              reloadPressed: false,
              weaponSlot,
            });
          } catch {
            useGameStore.getState().incrementRejectedShots();
          }
        }
      },
    };
  }
}
