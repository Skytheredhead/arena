import {
  MAX_PITCH,
  REMOTE_INTERPOLATION_DELAY_MS,
  RIFLE_CLIP_SIZE,
  RIFLE_CARRY_CAPACITY,
  SERVER_TICK_MS,
  WALK_SPEED,
  simulatePlayerTick,
  type AmmoPackView,
  type DamageEvent,
  type HealthPackView,
  type ImpactMarkView,
  type LocalPlayerState,
  type Vec3,
  type RemotePlayerState
} from '@arena/shared';
import { InputController } from '../input/InputController';
import { PredictionController } from '../player/PredictionController';
import { GameRenderer } from '../rendering/GameRenderer';
import { useGameStore } from '../state/gameStore';
import { SnapshotBuffer } from '../netcode/interpolation';
import { ConnectOptions, SpacetimeBridge } from '../netcode/SpacetimeBridge';
import { RifleController } from '../weapons/RifleController';
import type { GraphicsQuality } from '../types/settings';
import { AudioManager } from '../audio/AudioManager';

declare global {
  interface Window {
    __vectorDriftDebug?: {
      estimatedServerTimeMs: number;
      prediction: ReturnType<PredictionController['getDebugState']> | null;
      rejectedShots: number;
      remoteBuffers: Record<string, number>;
      spamFire: (count?: number) => Promise<void>;
    };
  }
}

export class GameRuntime {
  private static readonly MOBILE_LOOK_SPEED = 2.8;
  private static readonly RELOAD_DURATION_MS = 980;
  private static readonly DRY_FIRE_COOLDOWN_MS = 180;
  private static readonly FOOTSTEP_MIN_INTERVAL_MS = 430;
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
  private prediction: PredictionController | null = null;
  private bridge: SpacetimeBridge | null = null;
  private frameHandle = 0;
  private lastFrameTime = performance.now();
  private accumulatorMs = 0;
  private sequence = 0;
  private latestServerTimeMs = 0;
  private latestServerObservedAt = 0;
  private localCorrectionOffset = { x: 0, y: 0, z: 0 };
  private paused = false;
  private crosshairKick = 0;
  private totalAmmo = RIFLE_CARRY_CAPACITY;
  private magAmmo = RIFLE_CLIP_SIZE;
  private reserveAmmo = RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE;
  private reloadStartedAt = -1;
  private reloadCompletesAt = -1;
  private nextDryFireAt = 0;
  private smoothedPingMs = 48;
  private readonly pendingInputSentAt = new Map<number, number>();
  private walkPhase = 0;
  private walkIntensity = 0;
  private walkStrideDistance = 0;
  private crouchAmount = 0;
  private lastFootstepAt = 0;
  private lastLocalShotAt = -1000;

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

  async connect(options: ConnectOptions): Promise<void> {
    this.disconnect();
    useGameStore.getState().resetRuntime();
    useGameStore.getState().setNickname(options.nickname);
    useGameStore.getState().setRoomCode(options.roomCode);

    this.bridge = new SpacetimeBridge({
      onLocalState: state => this.handleAuthoritativeLocalState(state),
      onRemoteState: state => this.handleRemoteState(state),
      onDamageEvent: event => this.handleDamageEvent(event),
      onImpactMark: mark => this.handleImpactMark(mark),
      onImpactMarkRemoved: id => this.impactMarks.delete(id),
      onServerTick: serverTimeMs => this.observeServerTime(serverTimeMs),
      onWeaponAmmo: ammo => this.syncAuthoritativeAmmo(ammo),
      onDisconnected: () => this.disconnect(false)
    });

    try {
      await this.bridge.connect(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      useGameStore.getState().setConnection('error', message);
      this.disconnect(false);
      throw new Error(message);
    }
  }

  disconnect(resetStatus = true): void {
    this.bridge?.disconnect();
    this.bridge = null;
    this.remoteBuffers.clear();
    this.impactMarks.clear();
    this.bloodBursts.length = 0;
    this.prediction = null;
    this.sequence = 0;
    this.latestServerTimeMs = 0;
    this.latestServerObservedAt = 0;
    this.localCorrectionOffset = { x: 0, y: 0, z: 0 };
    if (resetStatus) {
      useGameStore.getState().setConnection('disconnected', null);
    }
    useGameStore.getState().resetRuntime();
    this.crosshairKick = 0;
    this.totalAmmo = RIFLE_CARRY_CAPACITY;
    this.magAmmo = RIFLE_CLIP_SIZE;
    this.reserveAmmo = RIFLE_CARRY_CAPACITY - RIFLE_CLIP_SIZE;
    this.pendingInputSentAt.clear();
    this.smoothedPingMs = 48;
    this.cancelReload();
    this.walkPhase = 0;
    this.walkIntensity = 0;
    this.walkStrideDistance = 0;
    this.crouchAmount = 0;
    this.lastFootstepAt = 0;
    this.applyDisplayedAmmo();
  }

  private handleAuthoritativeLocalState(state: LocalPlayerState): void {
    this.observeServerTime(state.serverTimeMs);
    this.updateMeasuredPing(state.lastProcessedInput);
    this.sequence = Math.max(this.sequence, state.lastProcessedInput);
    if (!this.prediction) {
      this.prediction = new PredictionController(state);
      this.localCorrectionOffset = { x: 0, y: 0, z: 0 };
      this.syncMagazineFromTotal(state.ammo);
      useGameStore.getState().setLocalPlayer(state);
      useGameStore.getState().setPredictionDebug(this.prediction.getDebugState());
      return;
    }

    const before = this.prediction.getState();
    const reconciled = this.prediction.reconcile(state);
    const correction = {
      x: before.position.x - reconciled.position.x,
      y: before.position.y - reconciled.position.y,
      z: before.position.z - reconciled.position.z
    };
    const correctionMagnitude = Math.hypot(correction.x, correction.y, correction.z);
    if (!before.alive || !reconciled.alive || correctionMagnitude > 3) {
      this.localCorrectionOffset = { x: 0, y: 0, z: 0 };
    } else {
      this.localCorrectionOffset = {
        x: this.localCorrectionOffset.x + correction.x,
        y: this.localCorrectionOffset.y + correction.y,
        z: this.localCorrectionOffset.z + correction.z
      };
    }
    useGameStore.getState().setLocalPlayer(reconciled);
    useGameStore.getState().setPredictionDebug(this.prediction.getDebugState());
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

  private syncAuthoritativeAmmo(ammo: number): void {
    const clamped = Math.max(0, Math.min(RIFLE_CARRY_CAPACITY, ammo));
    const previousTotal = this.totalAmmo;
    this.totalAmmo = clamped;
    if (this.prediction) {
      this.prediction.setAmmo(clamped);
    }

    const ammoGain = clamped - previousTotal;
    if (ammoGain > 0 && ammoGain <= 8) {
      const store = useGameStore.getState();
      this.audio.play('bulletPickup', { volume: 0.65, playbackRateMin: 0.93, playbackRateMax: 1.07 });
      store.consumeNearestAmmoPack(store.connectedRoomCode, store.localPlayer.position, 2.4);
    }

    this.magAmmo = Math.min(RIFLE_CLIP_SIZE, clamped);
    this.reloadStartedAt = -1;
    this.reloadCompletesAt = -1;
    this.applyDisplayedAmmo();
  }

  private setLocalAmmo(ammo: number): void {
    const clamped = Math.max(0, Math.min(RIFLE_CARRY_CAPACITY, ammo));
    this.totalAmmo = clamped;
    this.magAmmo = Math.min(RIFLE_CLIP_SIZE, clamped);
    if (this.prediction) {
      this.prediction.setAmmo(clamped);
    }
    useGameStore.getState().setLocalPlayer({ ammo: clamped });
    this.applyDisplayedAmmo();
  }

  private applyDisplayedAmmo(): void {
    this.reserveAmmo = Math.max(0, this.totalAmmo - this.magAmmo);
    useGameStore.getState().setDisplayedAmmo(this.magAmmo, this.reserveAmmo);
  }

  private syncMagazineFromTotal(totalAmmo: number): void {
    const clamped = Math.max(0, Math.min(RIFLE_CARRY_CAPACITY, totalAmmo));
    this.totalAmmo = clamped;
    this.magAmmo = Math.min(RIFLE_CLIP_SIZE, clamped);
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
    this.reloadCompletesAt = now + GameRuntime.RELOAD_DURATION_MS;
    this.audio.play('reload', { volume: 0.45, playbackRateMin: 0.96, playbackRateMax: 1.04 });
  }

  private completeReloadIfReady(now: number): void {
    if (this.reloadCompletesAt < 0 || now < this.reloadCompletesAt) {
      return;
    }
    const fill = Math.min(RIFLE_CLIP_SIZE, this.totalAmmo);
    this.magAmmo = fill;
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
      this.audio.play('bulletWallHit', { volume: 0.55, playbackRateMin: 0.94, playbackRateMax: 1.06 });
    }
  }

  private handleDamageEvent(event: DamageEvent): void {
    const store = useGameStore.getState();
    const localIdentity = store.localIdentity;
    const now = performance.now();

    if (event.victimIdentity === localIdentity) {
      store.triggerDamageFlash();
      this.audio.play('flyby', { volume: 0.5, playbackRateMin: 0.95, playbackRateMax: 1.07 });
    }

    if (event.attackerIdentity !== localIdentity || event.victimIdentity === localIdentity) {
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
        z: victim.position.z
      },
      createdAt: now,
      expiresAt: now + 320
    });
    this.audio.play('bulletBodyHit', { volume: 0.65, playbackRateMin: 0.92, playbackRateMax: 1.05 });
  }

  private readonly frame = (now: number): void => {
    const deltaSeconds = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.accumulatorMs += deltaSeconds * 1000;
    this.rifle.update(deltaSeconds);
    this.crosshairKick = Math.max(0, this.crosshairKick - deltaSeconds * 18);

    const store = useGameStore.getState();
    store.pruneKillFeed(now);
    this.completeReloadIfReady(now);
    const frameInput = this.input.getFrameInput();
    store.setScoreboardOpen(frameInput.scoreboardHeld);
    store.setScoped(frameInput.scoped);

    if (this.prediction && !this.paused) {
      const look = this.input.consumeLook();
      const lookStick = this.input.getVirtualLook();
      if (lookStick.x !== 0 || lookStick.y !== 0) {
        look.yawDelta += lookStick.x * GameRuntime.MOBILE_LOOK_SPEED * deltaSeconds;
        look.pitchDelta += lookStick.y * GameRuntime.MOBILE_LOOK_SPEED * deltaSeconds;
      }
      if (look.yawDelta !== 0 || look.pitchDelta !== 0) {
        this.prediction.applyLook(look.yawDelta, look.pitchDelta);
        const predicted = this.prediction.getState();
        useGameStore.getState().setLocalPlayer({
          yaw: predicted.yaw,
          pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, predicted.pitch))
        });
      }
    }

    while (this.accumulatorMs >= SERVER_TICK_MS) {
      this.fixedTick(now);
      this.accumulatorMs -= SERVER_TICK_MS;
    }

    const renderServerTimeMs = Math.max(
      0,
      this.estimateServerTimeMs(now) - REMOTE_INTERPOLATION_DELAY_MS
    );
    const remotePlayers: RemotePlayerState[] = [];
    for (const [identity, buffer] of this.remoteBuffers) {
      const meta = useGameStore.getState().players[identity];
      if (meta && (!meta.connected || !meta.roomCode)) {
        this.remoteBuffers.delete(identity);
        useGameStore.getState().removeRemotePlayer(identity);
        continue;
      }

      const sample = buffer.sample(renderServerTimeMs);
      if (!sample) {
        continue;
      }

      useGameStore.getState().upsertRemotePlayer(sample);
      remotePlayers.push(sample);
      if (!sample.roomCode) {
        this.remoteBuffers.delete(identity);
      }
    }

    const currentLocal = this.getPresentedLocalState(deltaSeconds);
    const speed = Math.hypot(currentLocal.velocity.x, currentLocal.velocity.z);
    const movingOnGround = currentLocal.onGround && currentLocal.alive && speed > 1.25;
    const crouchTarget = frameInput.sprinting ? 1 : 0;
    this.crouchAmount += (crouchTarget - this.crouchAmount) * Math.min(1, deltaSeconds * 12);
    const targetWalkIntensity = movingOnGround
      ? Math.max(0.12, Math.min(1, speed / Math.max(0.01, WALK_SPEED)))
      : 0;
    this.walkIntensity += (targetWalkIntensity - this.walkIntensity) * Math.min(1, deltaSeconds * 9);
    if (movingOnGround) {
      this.walkPhase += deltaSeconds * (7.3 + this.walkIntensity * 4.2);
      const stride = Math.max(0.35, 0.58 - this.walkIntensity * 0.12);
      this.walkStrideDistance += speed * deltaSeconds;
      const enoughStride = this.walkStrideDistance >= stride;
      const footstepReady = now - this.lastFootstepAt >= GameRuntime.FOOTSTEP_MIN_INTERVAL_MS;
      if (enoughStride && footstepReady) {
        this.walkStrideDistance -= stride;
        this.lastFootstepAt = now;
        this.audio.play('footstep', {
          volume: 0.32 + this.walkIntensity * 0.16,
          playbackRateMin: 0.9,
          playbackRateMax: 1.1
        });
      } else if (this.walkStrideDistance > stride * 2.4) {
        // Prevent huge backlog bursts after long frames/background tab throttling.
        this.walkStrideDistance = stride * 1.1;
      }
    } else {
      this.walkStrideDistance = 0;
      this.walkPhase += deltaSeconds * 1.6;
    }

    const baseSpread = Math.min(20, speed * 2.4);
    const scopedSpread = frameInput.scoped ? baseSpread * 0.45 : baseSpread;
    useGameStore.getState().setCrosshairSpread(Math.max(0, scopedSpread + this.crosshairKick));

    const connectedRoomCode = useGameStore.getState().connectedRoomCode;
    const ammoPacks: AmmoPackView[] = Object.values(useGameStore.getState().ammoPacks).filter(
      pack => !connectedRoomCode || pack.roomCode === connectedRoomCode
    );
    const healthPacks: HealthPackView[] = Object.values(useGameStore.getState().healthPacks).filter(
      pack => !connectedRoomCode || pack.roomCode === connectedRoomCode
    );
    const bloodBursts = this.bloodBursts.filter(burst => burst.expiresAt > now);
    if (bloodBursts.length !== this.bloodBursts.length) {
      this.bloodBursts.length = 0;
      this.bloodBursts.push(...bloodBursts);
    }
    this.publishDebug(now);
    const estimatedServerTimeMs = this.estimateServerTimeMs(now);
    this.renderer.render({
      localPlayer: currentLocal,
      remotePlayers,
      ammoPacks,
      healthPacks,
      impactMarks: Array.from(this.impactMarks.values()).filter(
        mark => !connectedRoomCode || mark.roomCode === connectedRoomCode
      ),
      bloodBursts,
      scoped: frameInput.scoped,
      deltaSeconds,
      recoil: this.rifle.getRecoil(),
      muzzleFlashVisible: useGameStore.getState().muzzleFlashUntil > now,
      walkPhase: this.walkPhase,
      walkIntensity: this.walkIntensity,
      crouchAmount: this.crouchAmount,
      reloadProgress: this.getReloadProgress(now),
      estimatedServerTimeMs
    });

    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private getPresentedLocalState(deltaSeconds: number): LocalPlayerState {
    const predicted = this.prediction?.getState();
    if (!predicted) {
      return useGameStore.getState().localPlayer;
    }

    const partialTickSeconds = this.accumulatorMs / 1000;
    if (partialTickSeconds <= 0) {
      return predicted;
    }

    const previewCommand = this.input.buildInputCommand(
      this.sequence,
      predicted.yaw,
      predicted.pitch
    );
    const preview = simulatePlayerTick(predicted, previewCommand, partialTickSeconds);

    const decay = Math.exp(-14 * deltaSeconds);
    this.localCorrectionOffset = {
      x: this.localCorrectionOffset.x * decay,
      y: this.localCorrectionOffset.y * decay,
      z: this.localCorrectionOffset.z * decay
    };

    return {
      ...preview,
      position: {
        x: preview.position.x + this.localCorrectionOffset.x,
        y: preview.position.y + this.localCorrectionOffset.y,
        z: preview.position.z + this.localCorrectionOffset.z
      }
    };
  }

  private fixedTick(now: number): void {
    if (
      !this.prediction ||
      !this.bridge ||
      this.paused ||
      useGameStore.getState().connectionStatus !== 'connected'
    ) {
      return;
    }

    const frameInput = this.input.getFrameInput();
    const predicted = this.prediction.getState();
    const command = this.input.buildInputCommand(++this.sequence, predicted.yaw, predicted.pitch);
    this.pendingInputSentAt.set(command.sequence, now);
    if (this.pendingInputSentAt.size > 256) {
      const staleSequences = Array.from(this.pendingInputSentAt.keys())
        .sort((left, right) => left - right)
        .slice(0, this.pendingInputSentAt.size - 256);
      for (const sequence of staleSequences) {
        this.pendingInputSentAt.delete(sequence);
      }
    }
    const localState = this.prediction.queueInput(command);
    useGameStore.getState().setLocalPlayer(localState);
    useGameStore.getState().setPredictionDebug(this.prediction.getDebugState());
    void this.bridge.submitInput(command).catch(() => undefined);

    if (frameInput.wantsReload) {
      this.startReload(now);
    }

    if (frameInput.wantsFire) {
      if (this.totalAmmo <= 0) {
        if (now >= this.nextDryFireAt) {
          this.audio.play('magEmpty', { volume: 0.6, playbackRateMin: 0.96, playbackRateMax: 1.05 });
          this.nextDryFireAt = now + GameRuntime.DRY_FIRE_COOLDOWN_MS;
        }
        return;
      }

      if (this.rifle.tryFire(now, this.bridge.getFireIntervalTicks())) {
        this.cancelReload();
        this.audio.play('shot', { volume: 0.75, playbackRateMin: 0.95, playbackRateMax: 1.05 });
        this.lastLocalShotAt = now;
        useGameStore.getState().triggerMuzzleFlash(this.rifle.getMuzzleFlashUntil(now));
        this.crosshairKick = Math.min(10, this.crosshairKick + (frameInput.scoped ? 0.7 : 1.4));
        void this.bridge
          .fireWeapon(localState.yaw, localState.pitch, frameInput.scoped)
          .catch(() => {
            useGameStore.getState().incrementRejectedShots();
          });
      }
    }
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
    if (sentAt === undefined) {
      return;
    }

    const measuredRttMs = Math.max(1, Math.min(999, performance.now() - sentAt));
    this.smoothedPingMs = this.smoothedPingMs * 0.8 + measuredRttMs * 0.2;
    const roundedPingMs = Math.max(1, Math.round(this.smoothedPingMs));
    const store = useGameStore.getState();
    store.setLocalPing(roundedPingMs);
    if (store.localIdentity) {
      store.setPlayerPing(store.localIdentity, roundedPingMs);
    }
  }

  private publishDebug(now: number): void {
    window.__vectorDriftDebug = {
      estimatedServerTimeMs: this.estimateServerTimeMs(now),
      prediction: this.prediction?.getDebugState() ?? null,
      rejectedShots: useGameStore.getState().rejectedShots,
      remoteBuffers: Object.fromEntries(
        Array.from(this.remoteBuffers.entries()).map(([identity, buffer]) => [
          identity,
          buffer.size()
        ])
      ),
      spamFire: async (count = 3) => {
        if (!this.bridge || !this.prediction) {
          return;
        }

        const state = this.prediction.getState();
        for (let index = 0; index < count; index += 1) {
          try {
            await this.bridge.fireWeapon(state.yaw, state.pitch, false);
          } catch {
            useGameStore.getState().incrementRejectedShots();
          }
        }
      }
    };
  }
}
