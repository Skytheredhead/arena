import type {
  QualityPreset,
  RoomRuntimeSnapshot,
  ScoreboardEntry,
  WeaponSlot,
} from '../netcode/contracts';

export interface RuntimeFeedEntry {
  id: string;
  kind: 'kill' | 'chat';
  senderNickname: string;
  message: string;
  receivedAtMs: number;
}

export interface RuntimeSnapshot {
  connectionStatus:
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected';
  connectionError: string | null;
  reconnectAttempt: number;
  reconnectStartedAtMs: number | null;
  localPlayerId: string | null;
  room: RoomRuntimeSnapshot | null;
  health: number;
  ammo: number;
  reserveAmmo: number;
  clipCapacity: number;
  kills: number;
  deaths: number;
  alive: boolean;
  respawnAtTick: number | null;
  lastKillerNickname: string | null;
  selectedWeapon: WeaponSlot;
  scoped: boolean;
  reloading: boolean;
  reloadProgress: number;
  scoreboard: ScoreboardEntry[];
  feed: RuntimeFeedEntry[];
  pingMs: number | null;
  pingLowMs: number | null;
  pingJitterMs: number | null;
  serverPipelineMs: number | null;
  hitmarkerToken: number;
  damageFlashToken: number;
  pointerLocked: boolean;
  paused: boolean;
  quality: QualityPreset;
  crosshairSpread: number;
  sniperCooldownReady: number;
}

export type RuntimeStoreListener = () => void;
export type RuntimeStorePatch =
  | Partial<RuntimeSnapshot>
  | ((current: RuntimeSnapshot) => Partial<RuntimeSnapshot>);

export interface RuntimeStoreOptions {
  publishHz?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => number;
  cancel?: (id: number) => void;
}

const defaultNow = (): number => performance.now();
const defaultSchedule = (callback: () => void, delayMs: number): number =>
  window.setTimeout(callback, delayMs);
const defaultCancel = (id: number): void => window.clearTimeout(id);

export const createInitialRuntimeSnapshot = (): RuntimeSnapshot => ({
  connectionStatus: 'idle',
  connectionError: null,
  reconnectAttempt: 0,
  reconnectStartedAtMs: null,
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
  pingMs: null,
  pingLowMs: null,
  pingJitterMs: null,
  serverPipelineMs: null,
  hitmarkerToken: 0,
  damageFlashToken: 0,
  pointerLocked: false,
  paused: false,
  quality: 'high',
  crosshairSpread: 0,
  sniperCooldownReady: 1,
});

export class RuntimeStore {
  readonly #listeners = new Set<RuntimeStoreListener>();
  readonly #intervalMs: number;
  readonly #now: () => number;
  readonly #schedule: (callback: () => void, delayMs: number) => number;
  readonly #cancel: (id: number) => void;

  #working: RuntimeSnapshot;
  #published: RuntimeSnapshot;
  #lastPublishedAt: number;
  #timer: number | null = null;
  #disposed = false;

  constructor(
    initial: RuntimeSnapshot = createInitialRuntimeSnapshot(),
    options: RuntimeStoreOptions = {}
  ) {
    this.#working = initial;
    this.#published = initial;
    this.#intervalMs = 1000 / Math.max(1, options.publishHz ?? 12);
    this.#now = options.now ?? defaultNow;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#cancel = options.cancel ?? defaultCancel;
    this.#lastPublishedAt = this.#now();
  }

  readonly subscribe = (listener: RuntimeStoreListener): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): RuntimeSnapshot => this.#published;

  patch(patch: RuntimeStorePatch, options: { urgent?: boolean } = {}): void {
    if (this.#disposed) return;
    const resolved = typeof patch === 'function' ? patch(this.#working) : patch;
    this.#working = { ...this.#working, ...resolved };

    const now = this.#now();
    if (options.urgent || now - this.#lastPublishedAt >= this.#intervalMs) {
      this.flush();
      return;
    }
    if (this.#timer != null) return;
    this.#timer = this.#schedule(
      () => {
        this.#timer = null;
        this.flush();
      },
      Math.max(0, this.#intervalMs - (now - this.#lastPublishedAt))
    );
  }

  flush(): void {
    if (this.#disposed) return;
    if (this.#timer != null) {
      this.#cancel(this.#timer);
      this.#timer = null;
    }
    if (this.#published === this.#working) return;
    this.#published = this.#working;
    this.#lastPublishedAt = this.#now();
    for (const listener of this.#listeners) listener();
  }

  dispose(): void {
    if (this.#timer != null) this.#cancel(this.#timer);
    this.#timer = null;
    this.#listeners.clear();
    this.#disposed = true;
  }
}
