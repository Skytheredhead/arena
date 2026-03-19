import {
  MAX_PITCH,
  REMOTE_INTERPOLATION_DELAY_MS,
  RIFLE_MAGAZINE,
  SERVER_TICK_MS,
  simulatePlayerTick,
  type AmmoPackView,
  type HealthPackView,
  type LocalPlayerState,
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
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly rifle = new RifleController();
  private readonly remoteBuffers = new Map<string, SnapshotBuffer>();
  private prediction: PredictionController | null = null;
  private bridge: SpacetimeBridge | null = null;
  private frameHandle = 0;
  private lastFrameTime = performance.now();
  private accumulatorMs = 0;
  private sequence = 0;
  private lastRespawnTick = 0;
  private latestServerTimeMs = 0;
  private latestServerObservedAt = 0;
  private localCorrectionOffset = { x: 0, y: 0, z: 0 };
  private paused = false;
  private crosshairKick = 0;

  constructor(mount: HTMLElement) {
    this.renderer = new GameRenderer(mount);
    this.input = new InputController(this.renderer.getInputElement());
    const settings = useGameStore.getState();
    this.input.setLookSensitivity(settings.lookSensitivity);
    this.renderer.setGraphicsQuality(settings.graphicsQuality);
    this.renderer.setFov(settings.fov);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.bridge?.disconnect();
    this.input.dispose();
    this.renderer.dispose();
  }

  requestPointerLock(): void {
    this.input.requestPointerLock();
  }

  isPointerLocked(): boolean {
    return this.input.isPointerLocked();
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

  async connect(options: ConnectOptions): Promise<void> {
    this.disconnect();
    useGameStore.getState().resetRuntime();
    useGameStore.getState().setNickname(options.nickname);
    useGameStore.getState().setRoomCode(options.roomCode);

    this.bridge = new SpacetimeBridge({
      onLocalState: state => this.handleAuthoritativeLocalState(state),
      onRemoteState: state => this.handleRemoteState(state),
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
    this.prediction = null;
    this.sequence = 0;
    this.lastRespawnTick = 0;
    this.latestServerTimeMs = 0;
    this.latestServerObservedAt = 0;
    this.localCorrectionOffset = { x: 0, y: 0, z: 0 };
    if (resetStatus) {
      useGameStore.getState().setConnection('disconnected', null);
    }
    useGameStore.getState().resetRuntime();
    this.crosshairKick = 0;
  }

  private handleAuthoritativeLocalState(state: LocalPlayerState): void {
    this.observeServerTime(state.serverTimeMs);
    this.sequence = Math.max(this.sequence, state.lastProcessedInput);
    if (!this.prediction) {
      this.prediction = new PredictionController(state);
      this.localCorrectionOffset = { x: 0, y: 0, z: 0 };
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
    if (!this.prediction) {
      return;
    }

    this.prediction.setAmmo(ammo);
  }

  private setLocalAmmo(ammo: number): void {
    const clamped = Math.max(0, Math.min(RIFLE_MAGAZINE, ammo));
    if (this.prediction) {
      this.prediction.setAmmo(clamped);
    }
    useGameStore.getState().setLocalPlayer({ ammo: clamped });
  }

  private readonly frame = (now: number): void => {
    const deltaSeconds = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.accumulatorMs += deltaSeconds * 1000;
    this.rifle.update(deltaSeconds);
    this.crosshairKick = Math.max(0, this.crosshairKick - deltaSeconds * 18);

    const store = useGameStore.getState();
    store.pruneKillFeed(now);
    const frameInput = this.input.getFrameInput();
    store.setScoreboardOpen(frameInput.scoreboardHeld);
    store.setScoped(frameInput.scoped);

    if (this.prediction && !this.paused) {
      const look = this.input.consumeLook();
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
    this.publishDebug(now);
    this.renderer.render({
      localPlayer: currentLocal,
      remotePlayers,
      ammoPacks,
      healthPacks,
      scoped: frameInput.scoped,
      deltaSeconds,
      recoil: this.rifle.getRecoil(),
      muzzleFlashVisible: useGameStore.getState().muzzleFlashUntil > now
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
    const localState = this.prediction.queueInput(command);
    useGameStore.getState().setLocalPlayer(localState);
    useGameStore.getState().setPredictionDebug(this.prediction.getDebugState());
    void this.bridge.submitInput(command).catch(() => undefined);

    const currentAmmo = useGameStore.getState().localPlayer.ammo;
    if (
      frameInput.wantsFire &&
      currentAmmo > 0 &&
      this.rifle.tryFire(now, this.bridge.getFireIntervalTicks())
    ) {
      this.setLocalAmmo(currentAmmo - 1);
      useGameStore.getState().triggerMuzzleFlash(this.rifle.getMuzzleFlashUntil(now));
      this.crosshairKick = Math.min(10, this.crosshairKick + (frameInput.scoped ? 0.7 : 1.4));
      void this.bridge
        .fireWeapon(localState.yaw, localState.pitch, frameInput.scoped)
        .catch(() => {
          useGameStore.getState().incrementRejectedShots();
        });
    }

    const match = useGameStore.getState().match;
    if (
      match &&
      !localState.alive &&
      match.tick >= localState.respawnTick &&
      localState.respawnTick > this.lastRespawnTick
    ) {
      this.lastRespawnTick = localState.respawnTick;
      void this.bridge.requestRespawn().catch(() => undefined);
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
