import { ARENA_MAP, weaponForSlot, type ArenaMapDefinition } from '@arena/shared';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { InputController } from '../input/InputController';
import {
  INPUT_BUTTON_FIRE,
  INPUT_BUTTON_SCOPE,
  INPUT_BUTTON_SPRINT,
  type ArenaTransport,
  type ArenaTransportEvent,
  type AuthoritativePlayerSnapshot,
  type CombatRuntimeEvent,
  type QualityPreset,
  type RuntimeSettings,
  type WeaponSlot,
  type WeaponSnapshot,
} from '../netcode/contracts';
import { PredictionController } from '../netcode/PredictionController';
import { ReliableInputQueue } from '../netcode/ReliableInputQueue';
import { SnapshotBufferSet } from '../netcode/SnapshotBuffer';
import {
  isAcknowledgedUint32,
  unwrapUint32Near,
} from '../netcode/serial';
import { GameRenderer } from '../rendering/GameRenderer';
import { RuntimeStore, type RuntimeFeedEntry } from '../state/RuntimeStore';
import { SharedMapCollisionResolver } from '../state/SharedMapCollisionResolver';
import { publishRuntimeHudFrame } from '../ui/runtimeHudFrame';

export interface ArenaRuntimeCallbacks {
  onPauseRequested?: () => void;
  onScoreboardChange?: (open: boolean) => void;
  onChatRequested?: () => void;
}

export interface ArenaRuntimeOptions extends ArenaRuntimeCallbacks {
  canvas: HTMLCanvasElement;
  transport: ArenaTransport;
  map?: ArenaMapDefinition;
  settings?: Partial<RuntimeSettings>;
  now?: () => number;
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  quality: 'high',
  sensitivity: 0.0021,
  fov: 80,
  sfxVolume: 0.8,
  musicVolume: 0.55,
};

const INITIAL_STATE = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  grounded: true,
  jumpHeld: false,
  lifeId: 0,
};

const weaponKey = (playerId: string, slot: WeaponSlot): string =>
  `${playerId}:${slot}`;

const tickProgress = (
  serverTick: number,
  startTick: number,
  endTick: number
): number => {
  const duration = (endTick - startTick) >>> 0;
  if (duration === 0) return 1;
  const elapsed = (serverTick - startTick) >>> 0;
  return Math.max(0, Math.min(1, elapsed / duration));
};

export class ArenaRuntime {
  readonly store: RuntimeStore;
  readonly input: InputController;
  readonly renderer: GameRenderer;
  readonly audio: ProceduralAudio;
  readonly map: ArenaMapDefinition;

  readonly #transport: ArenaTransport;
  readonly #settings: RuntimeSettings;
  readonly #now: () => number;
  readonly #inputQueue = new ReliableInputQueue();
  readonly #snapshots = new SnapshotBufferSet({
    maxSnapshots: 48,
    maxExtrapolationTicks: 6,
    teleportDistance: 7,
  });
  readonly #weaponSnapshots = new Map<string, WeaponSnapshot>();

  #prediction: PredictionController | null = null;
  #localPlayerId: string | null = null;
  #localLifeId: number | null = null;
  #latestServerTickWrapped: number | null = null;
  #latestServerTickUnwrapped: number | null = null;
  #transportUnsubscribe: (() => void) | null = null;
  #animationFrame: number | null = null;
  #running = false;
  #disposed = false;
  #paused = false;
  #inputCaptured = false;
  #clientTick = 0n;
  #inputAccumulator = 0;
  #lastFrameAt = 0;
  #elapsedSeconds = 0;
  readonly #lastPredictedShotAt = new Map<WeaponSlot, number>();
  #lastFeedSequence = 0;
  #lastHealth = 100;
  #lastAlive = false;

  constructor(options: ArenaRuntimeOptions) {
    this.map = options.map ?? ARENA_MAP;
    this.#transport = options.transport;
    this.#settings = { ...DEFAULT_SETTINGS, ...options.settings };
    this.#now = options.now ?? (() => performance.now());
    this.store = new RuntimeStore();
    this.store.patch(
      {
        quality: this.#settings.quality,
        connectionStatus: this.#transport.connected ? 'connected' : 'idle',
      },
      { urgent: true }
    );
    this.renderer = new GameRenderer({
      canvas: options.canvas,
      map: this.map,
      quality: this.#settings.quality,
      fov: this.#settings.fov,
    });
    this.audio = new ProceduralAudio({
      sfxVolume: this.#settings.sfxVolume,
      ambienceVolume: this.#settings.musicVolume,
    });
    this.input = new InputController(options.canvas, {
      sensitivity: this.#settings.sensitivity,
      onPointerLockChange: (locked) => {
        this.store.patch({ pointerLocked: locked }, { urgent: true });
        if (locked) void this.audio.unlock();
      },
      onPauseRequested: options.onPauseRequested,
      onScoreboardChange: options.onScoreboardChange,
      onChatRequested: options.onChatRequested,
      onWeaponChange: (slot) => {
        this.renderer.setWeapon(slot);
        this.#publishWeaponState(slot);
        this.store.patch({ selectedWeapon: slot }, { urgent: true });
      },
    });
  }

  start(): void {
    if (this.#disposed || this.#running) return;
    this.#running = true;
    this.#lastFrameAt = this.#now();
    this.#transportUnsubscribe = this.#transport.subscribe(
      this.#onTransportEvent
    );
    this.input.attach();
    this.#animationFrame = window.requestAnimationFrame(this.#frame);
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    if (this.#animationFrame != null) {
      window.cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = null;
    }
    this.#transportUnsubscribe?.();
    this.#transportUnsubscribe = null;
    this.input.detach();
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    this.#refreshInputEnabled();
    this.store.patch({ paused }, { urgent: true });
  }

  setInputCaptured(captured: boolean): void {
    this.#inputCaptured = captured;
    this.#refreshInputEnabled();
  }

  async requestPointerLock(): Promise<boolean> {
    await this.audio.unlock();
    return this.input.requestPointerLock();
  }

  requestFullscreen(): Promise<boolean> {
    return this.input.requestFullscreen();
  }

  requestRespawn(): void {
    this.input.requestRespawn();
  }

  setMobileMove(x: number, z: number): void {
    this.input.setMobileMove(x, z);
  }

  addMobileLookDelta(x: number, y: number): void {
    this.input.addMobileLookDelta(x, y);
  }

  setMobileFire(firing: boolean): void {
    this.input.setMobileFire(firing);
  }

  setQuality(quality: QualityPreset): void {
    this.#settings.quality = quality;
    this.renderer.setQuality(quality);
    this.store.patch({ quality }, { urgent: true });
  }

  setSensitivity(sensitivity: number): void {
    this.#settings.sensitivity = sensitivity;
    this.input.setSensitivity(sensitivity);
  }

  setFov(fov: number): void {
    this.#settings.fov = fov;
    this.renderer.setFov(fov);
  }

  setVolumes(sfxVolume: number, musicVolume: number): void {
    this.#settings.sfxVolume = sfxVolume;
    this.#settings.musicVolume = musicVolume;
    this.audio.setVolumes(sfxVolume, musicVolume);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    this.store.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.#snapshots.clear();
    this.#weaponSnapshots.clear();
  }

  readonly #frame = (timestamp: number): void => {
    if (!this.#running || this.#disposed) return;
    const deltaSeconds = Math.max(
      0,
      Math.min(0.1, (timestamp - this.#lastFrameAt) / 1000)
    );
    this.#lastFrameAt = timestamp;
    this.#elapsedSeconds += deltaSeconds;
    this.#inputAccumulator += deltaSeconds;

    const fixedDelta = 1 / this.map.tickRate;
    let steps = 0;
    while (this.#inputAccumulator >= fixedDelta && steps < 5) {
      this.#stepInput();
      this.#inputAccumulator -= fixedDelta;
      steps += 1;
    }
    if (steps === 5) this.#inputAccumulator = 0;

    const now = this.#now();
    if (this.#transport.connected && this.#inputQueue.isDue(now)) {
      void this.#inputQueue
        .flush((packet) => this.#transport.sendInput(packet), now)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Input transport failed';
          this.store.patch({ connectionError: message }, { urgent: true });
        });
    }

    const jitter = this.store.getSnapshot().pingJitterMs ?? 0;
    const interpolationTicks = 6 + Math.min(6, Math.ceil(jitter / 16.67));
    const renderTick =
      (this.#latestServerTickUnwrapped ?? 0) - interpolationTicks;
    const remotePlayers = this.#snapshots.sampleAll(renderTick);
    const localState = this.#prediction?.getPresentationState(
      deltaSeconds * 1000
    ) ?? null;
    const latestInput = this.#inputQueue.getLatestPacket();
    const selectedWeapon = latestInput?.desiredWeapon ?? this.input.desiredWeapon;
    const localWeapon = this.#localPlayerId
      ? this.#weaponSnapshots.get(weaponKey(this.#localPlayerId, selectedWeapon))
      : undefined;
    const serverTick = this.#latestServerTickWrapped ?? 0;
    const reloading =
      localWeapon?.reloadEndsTick != null &&
      !isAcknowledgedUint32(localWeapon.reloadEndsTick, serverTick);
    const reloadProgress =
      reloading &&
      localWeapon?.reloadStartedTick != null &&
      localWeapon.reloadEndsTick != null
        ? tickProgress(
            serverTick,
            localWeapon.reloadStartedTick,
            localWeapon.reloadEndsTick
          )
        : reloading
          ? 0
          : 1;
    const scoped =
      selectedWeapon === 2 &&
      ((latestInput?.buttons ?? 0) & INPUT_BUTTON_SCOPE) !== 0 &&
      !this.#paused &&
      this.#lastAlive;
    const speed = localState
      ? Math.hypot(localState.velocity.x, localState.velocity.z)
      : 0;
    const metrics = this.renderer.render({
      deltaSeconds,
      elapsedSeconds: this.#elapsedSeconds,
      localPlayerId: this.#localPlayerId,
      localState,
      remotePlayers,
      motion: {
        speed,
        grounded: localState?.grounded ?? true,
        sprinting:
          ((latestInput?.buttons ?? 0) & INPUT_BUTTON_SPRINT) !== 0,
        scoped,
        reloading,
        reloadProgress,
      },
    });
    this.audio.updateRain(1, metrics.indoorMix);

    const sniperCooldownReady =
      selectedWeapon !== 2 || !localWeapon
        ? 1
        : isAcknowledgedUint32(localWeapon.nextFireTick, serverTick)
          ? 1
          : 0;
    this.store.patch({
      scoped: metrics.scoped,
      crosshairSpread: metrics.crosshairSpread,
      sniperCooldownReady,
      reloading,
      reloadProgress,
    });
    publishRuntimeHudFrame({
      crosshairSpread: metrics.crosshairSpread,
      sniperCooldownReady,
    });
    this.#animationFrame = window.requestAnimationFrame(this.#frame);
  };

  #stepInput(): void {
    if (!this.#localPlayerId) return;
    this.#clientTick += 1n;
    const intent = this.input.sample(this.#clientTick);
    const edges = this.input.consumeActionEdges();
    const packet = this.#inputQueue.record(intent, edges);
    this.#prediction?.predict(packet);

    const now = this.#now();
    const definition = weaponForSlot(packet.desiredWeapon);
    const fireHeld = (packet.buttons & INPUT_BUTTON_FIRE) !== 0;
    const cadenceMs = (definition.fireIntervalTicks / this.map.tickRate) * 1000;
    const lastShotAt =
      this.#lastPredictedShotAt.get(packet.desiredWeapon) ?? -Infinity;
    const shouldPresentShot =
      this.#lastAlive &&
      (edges.fire > 0 || (definition.automatic && fireHeld)) &&
      now - lastShotAt >= cadenceMs * 0.88;
    if (shouldPresentShot) {
      this.#lastPredictedShotAt.set(packet.desiredWeapon, now);
      this.renderer.triggerFire(packet.desiredWeapon);
      this.audio.playWeapon(packet.desiredWeapon);
    }
    if (edges.reload > 0) {
      this.renderer.triggerReload();
      this.audio.playReload(packet.desiredWeapon);
    }
  }

  readonly #onTransportEvent = (event: ArenaTransportEvent): void => {
    if (event.type === 'connection') {
      this.store.patch(
        {
          connectionStatus: event.status,
          connectionError: event.error,
          reconnectAttempt: event.attempt,
          reconnectStartedAtMs:
            event.status === 'reconnecting'
              ? (this.store.getSnapshot().reconnectStartedAtMs ?? this.#now())
              : null,
        },
        { urgent: true }
      );
      if (event.status !== 'connected') {
        this.#inputQueue.markDisconnected(this.#now());
      }
      return;
    }
    if (event.type === 'local-player') {
      this.#applyLocalSnapshot(event.snapshot);
      return;
    }
    if (event.type === 'local-player-cleared') {
      this.#clearLocalPlayer();
      return;
    }
    if (event.type === 'remote-player') {
      this.#observeServerTick(event.snapshot.serverTick);
      this.#snapshots.push(event.snapshot);
      return;
    }
    if (event.type === 'player-removed') {
      if (event.playerId === this.#localPlayerId) {
        this.#clearLocalPlayer();
        return;
      }
      this.#snapshots.remove(event.playerId);
      this.renderer.removeRemotePlayer(event.playerId);
      return;
    }
    if (event.type === 'weapon') {
      this.#applyWeaponSnapshot(event.snapshot);
      return;
    }
    if (event.type === 'pickup') {
      this.renderer.applyPickup(event.snapshot);
      return;
    }
    if (event.type === 'room') {
      this.#observeServerTick(event.snapshot.serverTick);
      this.store.patch({ room: event.snapshot }, { urgent: true });
      return;
    }
    if (event.type === 'scoreboard') {
      this.store.patch({ scoreboard: event.entries });
      return;
    }
    if (event.type === 'combat') {
      this.#applyCombatEvent(event.event);
      return;
    }
    if (event.type === 'latency') {
      this.store.patch({
        pingMs: event.pingMs,
        pingLowMs: event.lowMs,
        pingJitterMs: event.jitterMs,
        serverPipelineMs: event.serverPipelineMs,
      });
    }
  };

  #applyLocalSnapshot(snapshot: AuthoritativePlayerSnapshot): void {
    this.#localPlayerId = snapshot.id;
    this.#observeServerTick(snapshot.serverTick);
    this.#inputQueue.acknowledge({
      inputSeq: snapshot.ackInputSeq,
      fireCounter: snapshot.ackFireCounter,
      reloadCounter: snapshot.ackReloadCounter,
      respawnCounter: snapshot.ackRespawnCounter,
    });

    const lifeChanged =
      this.#localLifeId != null && this.#localLifeId !== snapshot.lifeId;
    const authoritativeState = {
      position: { ...snapshot.position },
      velocity: { ...snapshot.velocity },
      yaw: snapshot.yaw,
      pitch: snapshot.pitch,
      grounded: Math.abs(snapshot.velocity.y) < 0.01,
      jumpHeld: false,
      lifeId: snapshot.lifeId,
    };
    if (!this.#prediction) {
      this.#prediction = new PredictionController(
        authoritativeState,
        new SharedMapCollisionResolver(this.map)
      );
      this.input.setView(snapshot.yaw, snapshot.pitch);
      this.input.synchronizeWeapon(snapshot.selectedWeapon);
      this.renderer.setWeapon(snapshot.selectedWeapon);
    } else if (lifeChanged) {
      this.#prediction.reset(authoritativeState);
      this.input.setView(snapshot.yaw, snapshot.pitch);
      this.input.synchronizeWeapon(snapshot.selectedWeapon);
      this.renderer.setWeapon(snapshot.selectedWeapon);
    } else {
      this.#prediction.reconcile(snapshot);
    }
    if (lifeChanged) {
      this.#inputQueue.resetForRespawn({
        inputSeq: snapshot.ackInputSeq,
        fireCounter: snapshot.ackFireCounter,
        reloadCounter: snapshot.ackReloadCounter,
        respawnCounter: snapshot.ackRespawnCounter,
      });
      this.#lastPredictedShotAt.clear();
    }
    this.#localLifeId = snapshot.lifeId;

    const tookDamage = snapshot.health < this.#lastHealth && snapshot.alive;
    const died = this.#lastAlive && !snapshot.alive;
    if (tookDamage) this.audio.playHurt();
    if (died) this.audio.playDeath();
    this.#lastHealth = snapshot.health;
    this.#lastAlive = snapshot.alive;
    this.#refreshInputEnabled();

    this.store.patch(
      (current) => ({
        localPlayerId: snapshot.id,
        health: snapshot.health,
        kills: snapshot.kills,
        deaths: snapshot.deaths,
        alive: snapshot.alive,
        respawnAtTick: snapshot.alive ? null : snapshot.respawnAtTick,
        lastKillerNickname:
          snapshot.alive && lifeChanged
            ? null
            : current.lastKillerNickname,
        selectedWeapon: this.input.desiredWeapon,
        damageFlashToken: tookDamage
          ? current.damageFlashToken + 1
          : current.damageFlashToken,
      }),
      { urgent: tookDamage || died || lifeChanged }
    );
  }

  #applyWeaponSnapshot(snapshot: WeaponSnapshot): void {
    const key = weaponKey(snapshot.playerId, snapshot.slot);
    this.#weaponSnapshots.set(key, snapshot);
    if (snapshot.playerId !== this.#localPlayerId) return;

    if (snapshot.slot === this.input.desiredWeapon) {
      this.#publishWeaponState(snapshot.slot);
    }
  }

  #applyCombatEvent(event: CombatRuntimeEvent): void {
    this.#observeServerTick(event.serverTick);
    this.renderer.applyCombatEvent(event);
    if (event.kind === 'impact' && event.position) {
      const listener = this.#prediction?.getSimulationState().position;
      this.audio.playImpact(
        event.targetId ? 'body' : 'concrete',
        event.position,
        listener
      );
    }
    if (event.kind === 'damage' && event.actorId === this.#localPlayerId) {
      this.audio.playHitmarker(event.headshot);
      this.store.patch(
        (current) => ({ hitmarkerToken: current.hitmarkerToken + 1 }),
        { urgent: true }
      );
    }
    if (event.kind === 'kill' || event.kind === 'chat') {
      const feedEntry: RuntimeFeedEntry = {
        id: event.id || `local-${this.#lastFeedSequence++}`,
        kind: event.kind,
        senderNickname: event.nickname ?? 'OPERATOR',
        message:
          event.message ??
          (event.kind === 'kill' ? 'eliminated an opponent' : ''),
        receivedAtMs: this.#now(),
      };
      this.store.patch((current) => ({
        feed: [...current.feed.slice(-7), feedEntry],
        lastKillerNickname:
          event.kind === 'kill' && event.targetId === this.#localPlayerId
            ? event.nickname ?? null
            : current.lastKillerNickname,
      }));
    }
  }

  #observeServerTick(tick: number): void {
    const wrapped = tick >>> 0;
    if (
      this.#latestServerTickWrapped == null ||
      this.#latestServerTickUnwrapped == null
    ) {
      this.#latestServerTickWrapped = wrapped;
      this.#latestServerTickUnwrapped = wrapped;
      return;
    }
    const unwrapped = unwrapUint32Near(
      wrapped,
      this.#latestServerTickWrapped,
      this.#latestServerTickUnwrapped
    );
    if (unwrapped >= this.#latestServerTickUnwrapped) {
      this.#latestServerTickWrapped = wrapped;
      this.#latestServerTickUnwrapped = unwrapped;
    }
  }

  #publishWeaponState(slot: WeaponSlot): void {
    if (!this.#localPlayerId) return;
    const weapon = this.#weaponSnapshots.get(
      weaponKey(this.#localPlayerId, slot)
    );
    if (!weapon) return;
    this.store.patch({
      ammo: weapon.loadedAmmo,
      reserveAmmo: weapon.reserveAmmo,
      clipCapacity: weapon.clipCapacity,
    });
  }

  #refreshInputEnabled(): void {
    this.input.setEnabled(
      this.#lastAlive && !this.#paused && !this.#inputCaptured
    );
  }

  #clearLocalPlayer(): void {
    this.#localPlayerId = null;
    this.#localLifeId = null;
    this.#prediction = null;
    this.#latestServerTickWrapped = null;
    this.#latestServerTickUnwrapped = null;
    this.#lastAlive = false;
    this.#lastHealth = 100;
    this.#paused = false;
    this.#inputCaptured = false;
    this.#clientTick = 0n;
    this.#inputAccumulator = 0;
    this.#lastPredictedShotAt.clear();
    this.#inputQueue.resetForRespawn({
      inputSeq: 0,
      fireCounter: 0,
      reloadCounter: 0,
      respawnCounter: 0,
    });
    this.#snapshots.clear();
    this.#weaponSnapshots.clear();
    this.renderer.clearRuntimeEntities();
    this.renderer.setWeapon(1);
    this.input.synchronizeWeapon(1);
    this.input.setEnabled(false);
    publishRuntimeHudFrame({
      crosshairSpread: 0,
      sniperCooldownReady: 1,
    });
    this.store.patch(
      {
        localPlayerId: null,
        room: null,
        health: 100,
        ammo: 0,
        reserveAmmo: 0,
        clipCapacity: 0,
        kills: 0,
        deaths: 0,
        alive: false,
        respawnAtTick: null,
        lastKillerNickname: null,
        selectedWeapon: 1,
        scoped: false,
        reloading: false,
        reloadProgress: 0,
        scoreboard: [],
        feed: [],
        pointerLocked: false,
        paused: false,
        crosshairSpread: 0,
        sniperCooldownReady: 1,
      },
      { urgent: true }
    );
  }
}

export const createIdlePredictionState = (): typeof INITIAL_STATE => ({
  ...INITIAL_STATE,
  position: { ...INITIAL_STATE.position },
  velocity: { ...INITIAL_STATE.velocity },
});
