import { weaponForSlot } from '@arena/shared';
import {
  DbConnection,
  tables,
  type SubscriptionHandle,
} from '../generated/module_bindings';
import type {
  AccountStats,
  AccountSession,
  ChatEvent,
  ClientActionResult,
  MatchEvent,
  PickupState,
  PlayerView,
  Room,
  ServerConfig,
  WeaponState,
} from '../generated/module_bindings/types';
import type {
  ArenaTransport,
  ArenaTransportEvent,
  AuthoritativePlayerSnapshot,
  CombatRuntimeEvent,
  PickupSnapshot,
  RoomRuntimeSnapshot,
  ScoreboardEntry,
  SubmitInputPacket,
  WeaponSlot,
  WeaponSnapshot,
} from '../netcode/contracts';
import {
  ARENA_TOKEN_STORAGE_PREFIX,
  LEGACY_ARENA_TOKEN_STORAGE_KEY,
  ReconnectBackoff,
  identityTokenStorageKey,
  isTrustedProductionScope,
  loadIdentityToken,
  normalizeSpacetimeUri,
  saveIdentityToken,
} from '../netcode/endpoint';
import type { AccountStatsView, RoomView } from '../ui/models';

const ROOM_PHASE_ACTIVE = 1;
const ROOM_PHASE_INTERMISSION = 2;
const PICKUP_HEALTH = 2;
const EVENT_FIRE = 3;
const EVENT_HIT = 4;
const EVENT_KILL = 5;
const EVENT_RESPAWN = 6;
const EVENT_MATCH_END = 8;
const EVENT_MATCH_START = 9;
const EVENT_PICKUP = 10;
const ACTION_ROOM = 1;
const ACTION_CHAT = 3;
const UINT32_MASK = 0xffff_ffffn;
const UI_PUBLISH_INTERVAL_MS = 100;
const MAX_SEEN_EVENTS = 1_024;

export type BackendConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface BackendUiSnapshot {
  status: BackendConnectionStatus;
  reconnectAttempt: number;
  connectionError: string | null;
  actionBusy: boolean;
  authBusy: boolean;
  authError: string | null;
  chatBusy: boolean;
  chatError: string | null;
  identityHex: string | null;
  localPlayerId: string | null;
  currentRoomCode: string | null;
  rooms: RoomView[];
  authLoggedIn: boolean;
  accountsEnabled: boolean;
  authUsername: string | null;
  accountStats: AccountStatsView | null;
  tickRate: number;
  roomCapacity: number;
  scoreLimit: number;
  matchDurationTicks: number;
  intermissionTicks: number;
  mapVersion: string | null;
  pingMs: number | null;
  pingLowMs: number | null;
  pingJitterMs: number | null;
  serverPipelineMs: number | null;
}

const initialBackendSnapshot = (): BackendUiSnapshot => ({
  status: 'disconnected',
  reconnectAttempt: 0,
  connectionError: null,
  actionBusy: false,
  authBusy: false,
  authError: null,
  chatBusy: false,
  chatError: null,
  identityHex: null,
  localPlayerId: null,
  currentRoomCode: null,
  rooms: [],
  authLoggedIn: false,
  accountsEnabled: false,
  authUsername: null,
  accountStats: null,
  tickRate: 60,
  roomCapacity: 12,
  scoreLimit: 30,
  matchDurationTicks: 36_000,
  intermissionTicks: 600,
  mapVersion: null,
  pingMs: null,
  pingLowMs: null,
  pingJitterMs: null,
  serverPipelineMs: null,
});

const safeNumber = (value: bigint): number =>
  Number(
    value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value
  );

const tick32 = (value: bigint): number => Number(value & UINT32_MASK);

const weaponSlot = (value: number): WeaponSlot =>
  value === 2 || value === 3 ? value : 1;

const conciseError = (error: unknown, fallback: string): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;
  return raw.replace(/\s+/gu, ' ').trim().slice(0, 240) || fallback;
};

const sanitizeReconnectNickname = (raw: string): string | null => {
  const filtered = [...raw.trim()]
    .filter(
      (character) =>
        /[A-Za-z0-9]/u.test(character) ||
        character === '_' ||
        character === '-' ||
        character === ' '
    )
    .slice(0, 16)
    .join('');
  const collapsed = filtered.split(/\s+/u).filter(Boolean).join(' ');
  return collapsed.length >= 3 && collapsed.length <= 16 ? collapsed : null;
};

const sanitizeReconnectRoomCode = (raw: string): string | null => {
  const code = [...raw.trim()]
    .filter((character) => /[A-Za-z0-9]/u.test(character) || character === '-')
    .map((character) => character.toUpperCase())
    .slice(0, 12)
    .join('');
  return code.length >= 3 && code.length <= 12 ? code : null;
};

const identityHex = (value: { toHexString(): string }): string =>
  value.toHexString().toLowerCase();

interface RoomReclaimIntent {
  nickname: string;
  roomCode: string;
}

interface RoomReclaimOutcome {
  success: boolean;
  error: string | null;
}

class BackendStore {
  readonly #listeners = new Set<() => void>();
  #working = initialBackendSnapshot();
  #published = this.#working;
  #timer: number | null = null;
  #lastPublishedAt = performance.now();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): BackendUiSnapshot => this.#published;

  patch(
    patch:
      | Partial<BackendUiSnapshot>
      | ((current: BackendUiSnapshot) => Partial<BackendUiSnapshot>),
    urgent = false
  ): void {
    const resolved = typeof patch === 'function' ? patch(this.#working) : patch;
    this.#working = { ...this.#working, ...resolved };
    const elapsed = performance.now() - this.#lastPublishedAt;
    if (urgent || elapsed >= UI_PUBLISH_INTERVAL_MS) {
      this.flush();
      return;
    }
    if (this.#timer != null) return;
    this.#timer = window.setTimeout(
      () => {
        this.#timer = null;
        this.flush();
      },
      Math.max(0, UI_PUBLISH_INTERVAL_MS - elapsed)
    );
  }

  flush(): void {
    if (this.#timer != null) window.clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#published === this.#working) return;
    this.#published = this.#working;
    this.#lastPublishedAt = performance.now();
    for (const listener of this.#listeners) listener();
  }

  dispose(): void {
    if (this.#timer != null) window.clearTimeout(this.#timer);
    this.#timer = null;
    this.#listeners.clear();
  }
}

export interface SpacetimeArenaClientOptions {
  endpointUri: string;
  database: string;
  storage?: Storage;
  now?: () => number;
}

/**
 * The only bridge between generated SpacetimeDB bindings and the render
 * runtime. React subscribes to the throttled UI store; high-frequency player
 * rows flow directly to ArenaRuntime.
 */
export class SpacetimeArenaClient implements ArenaTransport {
  readonly ui = new BackendStore();
  readonly endpointUri: string;
  readonly database: string;

  readonly #listeners = new Set<(event: ArenaTransportEvent) => void>();
  readonly #storage: Storage;
  readonly #now: () => number;
  readonly #trustedAccountScope: boolean;
  readonly #backoff = new ReconnectBackoff();
  readonly #seenEvents = new Set<string>();
  readonly #seenEventOrder: string[] = [];
  readonly #knownPlayerIds = new Set<string>();
  readonly #pendingPlayerRemovals = new Map<string, number>();

  #connection: DbConnection | null = null;
  #subscription: SubscriptionHandle | null = null;
  #identityHex: string | null = null;
  #status: BackendConnectionStatus = 'disconnected';
  #reconnectTimer: number | null = null;
  #shouldReconnect = true;
  #subscriptionReady = false;
  #latencyEwma: number | null = null;
  #latencyLow: number | null = null;
  #latencyJitter = 0;
  #lastLatencySample: number | null = null;
  // Deliberately memory-only: a full page load must not persist or auto-submit
  // a player's nickname or room code.
  #roomReclaimIntent: RoomReclaimIntent | null = null;
  #roomReclaimConnection: DbConnection | null = null;
  #roomReclaimOutcome: RoomReclaimOutcome | null = null;

  constructor(options: SpacetimeArenaClientOptions) {
    this.endpointUri = normalizeSpacetimeUri(options.endpointUri);
    this.database = options.database.trim();
    if (!this.database || this.database.length > 255) {
      throw new Error('Arena database name is invalid.');
    }
    this.#storage = options.storage ?? window.sessionStorage;
    this.#now = options.now ?? (() => performance.now());
    this.#trustedAccountScope = isTrustedProductionScope({
      endpointUri: this.endpointUri,
      database: this.database,
    });
    this.#removePersistentLegacyToken();
  }

  get connected(): boolean {
    return this.#status === 'connected' && this.#connection?.isActive === true;
  }

  connect(): void {
    if (
      this.#status === 'connecting' ||
      this.#status === 'connected' ||
      this.#status === 'reconnecting'
    ) {
      return;
    }
    this.#shouldReconnect = true;
    this.#openConnection(false);
  }

  readonly subscribe = (
    listener: (event: ArenaTransportEvent) => void
  ): (() => void) => {
    this.#listeners.add(listener);
    listener({
      type: 'connection',
      status: this.#status,
      attempt: this.#backoff.attempt,
      error: this.ui.getSnapshot().connectionError,
    });
    return () => this.#listeners.delete(listener);
  };

  async sendInput(packet: SubmitInputPacket): Promise<void> {
    const connection = this.#requireConnection();
    const startedAt = this.#now();
    await connection.reducers.submitInput({
      seq: packet.seq,
      clientTick: packet.clientTick,
      moveX: packet.moveX,
      moveZ: packet.moveZ,
      yaw: packet.yaw,
      pitch: packet.pitch,
      buttons: packet.buttons,
      desiredWeapon: packet.desiredWeapon,
      fireCounter: packet.fireCounter,
      reloadCounter: packet.reloadCounter,
      respawnCounter: packet.respawnCounter,
    });
    this.#observeLatency(this.#now() - startedAt);
  }

  async quickPlay(nickname: string): Promise<void> {
    this.#roomReclaimIntent = null;
    await this.#runRoomAction(() =>
      this.#requireConnection().reducers.quickPlay({ nickname })
    );
  }

  async createRoom(nickname: string, requestedCode: string): Promise<void> {
    this.#roomReclaimIntent = null;
    await this.#runRoomAction(() =>
      this.#requireConnection().reducers.createRoom({
        nickname,
        requestedCode,
      })
    );
  }

  async joinRoom(nickname: string, roomCode: string): Promise<void> {
    this.#roomReclaimIntent = null;
    await this.#runRoomAction(() =>
      this.#requireConnection().reducers.joinRoom({ nickname, roomCode })
    );
  }

  async leaveRoom(): Promise<void> {
    this.#roomReclaimIntent = null;
    await this.#runRoomAction(() =>
      this.#requireConnection().reducers.leaveRoom({})
    );
  }

  async sendChat(message: string): Promise<void> {
    this.ui.patch({ chatBusy: true, chatError: null }, true);
    try {
      await this.#requireConnection().reducers.sendChatMessage({ message });
    } catch (error) {
      this.ui.patch(
        {
          chatError: conciseError(error, 'Unable to send that message.'),
        },
        true
      );
      throw error;
    } finally {
      this.ui.patch({ chatBusy: false }, true);
    }
  }

  async login(identifier: string, password: string): Promise<void> {
    this.#requireAccountsEnabled();
    await this.#runAuthAction(() =>
      this.#requireConnection().reducers.loginAccount({
        usernameOrEmail: identifier,
        password,
      })
    );
  }

  async register(
    email: string,
    username: string,
    password: string
  ): Promise<void> {
    this.#requireAccountsEnabled();
    await this.#runAuthAction(() =>
      this.#requireConnection().reducers.registerAccount({
        email,
        username,
        password,
      })
    );
  }

  async logout(): Promise<void> {
    this.#requireAccountsEnabled();
    await this.#runAuthAction(() =>
      this.#requireConnection().reducers.logoutAccount({})
    );
  }

  async refreshStats(): Promise<void> {
    this.#requireAccountsEnabled();
    try {
      await this.#requireConnection().reducers.requestStatsRefresh({});
    } catch (error) {
      this.ui.patch(
        { authError: conciseError(error, 'Unable to refresh account stats.') },
        true
      );
    }
  }

  diagnostics(): string {
    const snapshot = this.ui.getSnapshot();
    const metric = (value: number | null): string =>
      value == null ? 'unavailable' : `${Math.round(value)} ms`;
    return [
      `Arena endpoint: ${this.endpointUri}`,
      `Database: ${this.database}`,
      `Connection: ${snapshot.status}`,
      `Round-trip: ${metric(snapshot.pingMs)}`,
      `Round-trip low: ${metric(snapshot.pingLowMs)}`,
      `Jitter: ${metric(snapshot.pingJitterMs)}`,
      'Server pipeline: unavailable (not exposed by SpacetimeDB 2.1)',
    ].join('\n');
  }

  dispose(): void {
    this.#shouldReconnect = false;
    this.#roomReclaimIntent = null;
    this.#roomReclaimConnection = null;
    this.#roomReclaimOutcome = null;
    if (this.#reconnectTimer != null) {
      window.clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#subscription?.unsubscribe();
    this.#subscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    for (const timer of this.#pendingPlayerRemovals.values()) {
      window.clearTimeout(timer);
    }
    this.#pendingPlayerRemovals.clear();
    this.#subscriptionReady = false;
    this.#setStatus('disconnected', null, true);
    this.#listeners.clear();
    this.ui.dispose();
  }

  #openConnection(reconnecting: boolean): void {
    this.#subscriptionReady = false;
    this.#setStatus(reconnecting ? 'reconnecting' : 'connecting', null, true);
    const token = loadIdentityToken(this.#storage, {
      endpointUri: this.endpointUri,
      database: this.database,
    });
    try {
      this.#connection = DbConnection.builder()
        .withUri(this.endpointUri)
        .withDatabaseName(this.database)
        .withToken(token)
        .withCompression('gzip')
        .onConnect((connection, identity, nextToken) => {
          if (connection !== this.#connection || !this.#shouldReconnect) return;
          this.#identityHex = identityHex(identity);
          saveIdentityToken(
            this.#storage,
            { endpointUri: this.endpointUri, database: this.database },
            nextToken
          );
          this.#backoff.reset();
          this.#attachTableHandlers(connection);
          this.#subscription = connection
            .subscriptionBuilder()
            .onApplied(() => {
              if (connection !== this.#connection) return;
              void this.#completeSubscription(connection, reconnecting);
            })
            .onError(() => {
              if (connection !== this.#connection) return;
              this.#setStatus(
                'disconnected',
                'Arena data subscription failed.',
                true
              );
            })
            .subscribe([
              tables.server_config,
              tables.open_rooms,
              tables.my_room_state,
              tables.my_room_players,
              tables.my_weapon_states,
              tables.my_room_pickups,
              tables.my_room_match_events,
              tables.my_room_chat_events,
              tables.my_account_session,
              tables.my_account_stats,
              tables.my_action_result,
            ]);
        })
        .onConnectError((_context, error) => {
          if (!this.#shouldReconnect) return;
          this.#handleDisconnect(error);
        })
        .onDisconnect((_context, error) => {
          if (!this.#shouldReconnect) return;
          this.#handleDisconnect(error);
        })
        .build();
    } catch (error) {
      this.#handleDisconnect(
        error instanceof Error ? error : new Error('Connection setup failed.')
      );
    }
  }

  #handleDisconnect(error?: Error): void {
    this.#connection = null;
    this.#subscription = null;
    this.#subscriptionReady = false;
    this.#roomReclaimConnection = null;
    this.#roomReclaimOutcome = null;
    if (!this.#shouldReconnect) return;
    const message = conciseError(error, 'Connection to Arena was interrupted.');
    const delay = this.#backoff.nextDelay();
    this.#setStatus('reconnecting', message, true);
    if (this.#reconnectTimer != null) window.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#shouldReconnect) this.#openConnection(true);
    }, delay);
  }

  async #completeSubscription(
    connection: DbConnection,
    reconnecting: boolean
  ): Promise<void> {
    this.#subscriptionReady = true;
    this.#hydrate(connection);
    if (connection !== this.#connection || !this.#shouldReconnect) return;
    const reclaimIntent = reconnecting ? this.#roomReclaimIntent : null;
    if (!reclaimIntent) {
      this.#setStatus('connected', null, true);
      return;
    }

    this.#roomReclaimConnection = connection;
    this.#roomReclaimOutcome = null;
    try {
      await connection.reducers.joinRoom({
        nickname: reclaimIntent.nickname,
        roomCode: reclaimIntent.roomCode,
      });
    } catch (error) {
      if (connection !== this.#connection || !this.#shouldReconnect) return;
      this.#roomReclaimOutcome = {
        success: false,
        error: conciseError(error, 'Unable to reclaim the previous room.'),
      };
    }
    if (connection !== this.#connection || !this.#shouldReconnect) return;

    const outcome = this.#roomReclaimOutcome;
    this.#roomReclaimConnection = null;
    this.#roomReclaimOutcome = null;
    if (outcome?.success === false) {
      this.#roomReclaimIntent = null;
    }
    this.#setStatus(
      'connected',
      outcome?.success === false ? outcome.error : null,
      true
    );
  }

  #attachTableHandlers(connection: DbConnection): void {
    connection.db.my_room_players.onInsert((_context, row) => {
      if (!this.#subscriptionReady) return;
      const pendingRemoval = this.#pendingPlayerRemovals.get(row.id.toString());
      if (pendingRemoval != null) window.clearTimeout(pendingRemoval);
      this.#pendingPlayerRemovals.delete(row.id.toString());
      this.#emitPlayer(row);
      this.#refreshUi(connection, true);
    });
    connection.db.my_room_players.onUpdate((_context, _oldRow, row) => {
      if (!this.#subscriptionReady) return;
      this.#emitPlayer(row);
    });
    connection.db.my_room_players.onDelete((_context, row) => {
      if (!this.#subscriptionReady) return;
      const playerId = row.id.toString();
      const existing = this.#pendingPlayerRemovals.get(playerId);
      if (existing != null) window.clearTimeout(existing);
      this.#pendingPlayerRemovals.set(
        playerId,
        window.setTimeout(() => {
          this.#pendingPlayerRemovals.delete(playerId);
          const replacement = [...connection.db.my_room_players.iter()].find(
            (candidate) => candidate.id === row.id
          );
          if (replacement) return;
          this.#knownPlayerIds.delete(playerId);
          if (row.isSelf) {
            this.#emit({ type: 'local-player-cleared' });
            this.#refreshUi(connection, true);
          } else {
            this.#emit({ type: 'player-removed', playerId });
          }
        }, 0)
      );
    });
    connection.db.my_room_state.onInsert((_context, row) => {
      if (!this.#subscriptionReady) return;
      this.#emitRoom(connection, row);
      this.#refreshUi(connection, true);
    });
    connection.db.my_room_state.onUpdate((_context, oldRow, row) => {
      if (!this.#subscriptionReady) return;
      this.#emitRoom(connection, row);
      const meaningful =
        oldRow.phase !== row.phase ||
        oldRow.round !== row.round ||
        oldRow.humanCount !== row.humanCount ||
        oldRow.botCount !== row.botCount ||
        oldRow.winnerPlayerId !== row.winnerPlayerId;
      this.#refreshUi(connection, meaningful);
    });
    connection.db.my_room_state.onDelete(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.open_rooms.onInsert(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.open_rooms.onUpdate(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.open_rooms.onDelete(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_weapon_states.onInsert((_context, row) => {
      if (this.#subscriptionReady) this.#emitWeapon(row);
    });
    connection.db.my_weapon_states.onUpdate((_context, _oldRow, row) => {
      if (this.#subscriptionReady) this.#emitWeapon(row);
    });
    connection.db.my_room_pickups.onInsert((_context, row) => {
      if (this.#subscriptionReady) this.#emitPickup(row);
    });
    connection.db.my_room_pickups.onUpdate((_context, _oldRow, row) => {
      if (this.#subscriptionReady) this.#emitPickup(row);
    });
    connection.db.my_room_match_events.onInsert((_context, row) => {
      if (this.#subscriptionReady) this.#emitMatchEvent(connection, row);
    });
    connection.db.my_room_chat_events.onInsert((_context, row) => {
      if (this.#subscriptionReady) this.#emitChatEvent(connection, row);
    });
    connection.db.my_account_session.onInsert(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_account_session.onUpdate(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_account_session.onDelete(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_account_stats.onInsert(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_account_stats.onUpdate(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, false);
    });
    connection.db.my_account_stats.onDelete(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.my_action_result.onInsert((_context, row) => {
      if (this.#subscriptionReady) this.#applyActionResult(row);
    });
    connection.db.my_action_result.onUpdate((_context, _oldRow, row) => {
      if (this.#subscriptionReady) this.#applyActionResult(row);
    });
    connection.db.my_action_result.onDelete(() => {
      if (this.#subscriptionReady) {
        this.ui.patch({ chatError: null }, true);
      }
    });
    connection.db.server_config.onInsert(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
    connection.db.server_config.onUpdate(() => {
      if (this.#subscriptionReady) this.#refreshUi(connection, true);
    });
  }

  #hydrate(connection: DbConnection): void {
    const currentIds = new Set<string>();
    for (const player of connection.db.my_room_players.iter()) {
      currentIds.add(player.id.toString());
      this.#emitPlayer(player);
    }
    for (const priorId of this.#knownPlayerIds) {
      if (!currentIds.has(priorId)) {
        this.#emit({ type: 'player-removed', playerId: priorId });
      }
    }
    this.#knownPlayerIds.clear();
    for (const playerId of currentIds) this.#knownPlayerIds.add(playerId);

    for (const room of connection.db.my_room_state.iter()) {
      this.#emitRoom(connection, room);
    }
    for (const weapon of connection.db.my_weapon_states.iter()) {
      this.#emitWeapon(weapon);
    }
    for (const pickup of connection.db.my_room_pickups.iter()) {
      this.#emitPickup(pickup);
    }
    const matchEvents = [...connection.db.my_room_match_events.iter()].sort(
      (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    for (const event of matchEvents) this.#emitMatchEvent(connection, event);
    const chatEvents = [...connection.db.my_room_chat_events.iter()].sort(
      (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    for (const event of chatEvents) this.#emitChatEvent(connection, event);
    const actionResult = [...connection.db.my_action_result.iter()][0];
    if (actionResult) this.#applyActionResult(actionResult);
    this.#refreshUi(connection, true);
  }

  #emitPlayer(player: PlayerView): void {
    const room = this.#connection
      ? this.#currentRoom(this.#connection)
      : undefined;
    if (!room || room.id !== player.roomId) return;
    const snapshot: AuthoritativePlayerSnapshot = {
      id: player.id.toString(),
      roomId: player.roomId.toString(),
      nickname: player.nickname,
      isBot: player.isBot,
      connected: player.connected,
      position: { x: player.x, y: player.y, z: player.z },
      velocity: { x: player.vx, y: player.vy, z: player.vz },
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      alive: player.alive,
      protectedUntilTick: tick32(player.spawnProtectedUntilTick),
      respawnAtTick: tick32(player.respawnAtTick),
      kills: player.kills,
      deaths: player.deaths,
      selectedWeapon: weaponSlot(player.selectedWeapon),
      serverTick: tick32(room.serverTick),
      ackInputSeq: player.lastProcessedInputSeq,
      ackFireCounter: player.lastProcessedFireCounter,
      ackReloadCounter: player.lastProcessedReloadCounter,
      ackRespawnCounter: player.lastProcessedRespawnCounter,
      lifeId: player.lifeId,
    };
    this.#knownPlayerIds.add(snapshot.id);
    this.#emit({
      type: player.isSelf ? 'local-player' : 'remote-player',
      snapshot,
    });
  }

  #emitWeapon(row: WeaponState): void {
    const slot = weaponSlot(row.slot);
    const definition = weaponForSlot(slot);
    const reloadEndsTick = row.reloading
      ? tick32(row.reloadCompleteTick)
      : null;
    const snapshot: WeaponSnapshot = {
      playerId: row.playerId.toString(),
      slot,
      loadedAmmo: row.magazineAmmo,
      reserveAmmo: row.reserveAmmo,
      clipCapacity: definition.magazineSize,
      reloadStartedTick:
        reloadEndsTick == null
          ? null
          : (reloadEndsTick - definition.reloadTicks) >>> 0,
      reloadEndsTick,
      nextFireTick: tick32(row.nextFireTick),
      shotCounter: row.shotCounter,
    };
    this.#emit({ type: 'weapon', snapshot });
  }

  #emitPickup(row: PickupState): void {
    const snapshot: PickupSnapshot = {
      id: row.key.toString(),
      kind: row.kind === PICKUP_HEALTH ? 'health' : 'ammo',
      position: { x: row.x, y: row.y, z: row.z },
      active: row.available,
      respawnAtTick:
        row.respawnAtTick === 0n ? null : tick32(row.respawnAtTick),
    };
    this.#emit({ type: 'pickup', snapshot });
  }

  #emitRoom(connection: DbConnection, row: Room): void {
    const config = this.#serverConfig(connection);
    const snapshot: RoomRuntimeSnapshot = {
      id: row.id.toString(),
      code: row.code,
      phase: row.phase === ROOM_PHASE_INTERMISSION ? 'intermission' : 'active',
      round: row.round,
      serverTick: tick32(row.serverTick),
      matchTick: safeNumber(row.matchTick),
      intermissionEndsTick: tick32(row.intermissionEndsTick),
      killLimit: config?.scoreLimit ?? 30,
      winnerPlayerId:
        row.winnerPlayerId === 0n ? null : row.winnerPlayerId.toString(),
    };
    this.#emit({ type: 'room', snapshot });
    const local = this.#localPlayer(connection);
    if (local?.roomId === row.id) this.#emitScoreboard(connection, row.id);
  }

  #emitScoreboard(connection: DbConnection, roomId: bigint): void {
    const entries: ScoreboardEntry[] = [...connection.db.my_room_players.iter()]
      .filter((player) => player.roomId === roomId)
      .map((player) => ({
        playerId: player.id.toString(),
        nickname: player.nickname,
        isBot: player.isBot,
        connected: player.connected,
        kills: player.kills,
        deaths: player.deaths,
        pingMs: player.isSelf ? this.ui.getSnapshot().pingMs : null,
      }))
      .sort(
        (left, right) =>
          right.kills - left.kills ||
          left.deaths - right.deaths ||
          left.nickname.localeCompare(right.nickname)
      );
    this.#emit({ type: 'scoreboard', entries });
  }

  #emitMatchEvent(connection: DbConnection, row: MatchEvent): void {
    if (!this.#eventBelongsToLocalRoom(connection, row.roomId)) return;
    const eventId = `match:${row.id.toString()}`;
    if (!this.#rememberEvent(eventId)) return;
    const players = [...connection.db.my_room_players.iter()];
    const actor = players.find((player) => player.id === row.actorPlayerId);
    const target = players.find((player) => player.id === row.targetPlayerId);
    let kind: CombatRuntimeEvent['kind'] | null = null;
    if (row.kind === EVENT_FIRE) kind = 'shot';
    if (row.kind === EVENT_HIT) kind = 'damage';
    if (row.kind === EVENT_KILL) kind = 'kill';
    if (row.kind === EVENT_RESPAWN) kind = 'respawn';
    if (row.kind === EVENT_MATCH_END) kind = 'match-ended';
    if (row.kind === EVENT_MATCH_START) kind = 'match-reset';
    if (row.kind === EVENT_PICKUP) kind = 'pickup';
    if (!kind) return;
    const event: CombatRuntimeEvent = {
      id: eventId,
      roomId: row.roomId.toString(),
      serverTick: tick32(row.tick),
      kind,
      actorId:
        row.actorPlayerId === 0n ? undefined : row.actorPlayerId.toString(),
      targetId:
        row.targetPlayerId === 0n ? undefined : row.targetPlayerId.toString(),
      weapon: row.weaponSlot === 0 ? undefined : weaponSlot(row.weaponSlot),
      amount: row.value === 0 ? undefined : row.value,
      nickname: actor?.nickname,
      message:
        kind === 'kill'
          ? `eliminated ${target?.nickname ?? 'an opponent'}`
          : row.text || undefined,
    };
    this.#emit({ type: 'combat', event });
  }

  #emitChatEvent(connection: DbConnection, row: ChatEvent): void {
    if (!this.#eventBelongsToLocalRoom(connection, row.roomId)) return;
    const eventId = `chat:${row.id.toString()}`;
    if (!this.#rememberEvent(eventId)) return;
    this.#emit({
      type: 'combat',
      event: {
        id: eventId,
        roomId: row.roomId.toString(),
        serverTick: tick32(row.tick),
        kind: 'chat',
        actorId: row.playerId.toString(),
        nickname: row.nickname,
        message: row.message,
      },
    });
  }

  #refreshUi(connection: DbConnection, urgent: boolean): void {
    const localPlayer = this.#localPlayer(connection);
    const currentRoom =
      localPlayer == null ? undefined : this.#currentRoom(connection);
    this.#captureRoomReclaimIntent(localPlayer, currentRoom);
    const config = this.#serverConfig(connection);
    const rooms: RoomView[] = [...connection.db.open_rooms.iter()]
      .map<RoomView>((room) => ({
        code: room.code,
        playerCount: room.humanCount,
        botCount: room.botCount,
        capacity: config?.roomCapacity ?? 12,
        active: room.phase === ROOM_PHASE_ACTIVE,
        phase:
          room.phase === ROOM_PHASE_INTERMISSION ? 'intermission' : 'playing',
      }))
      .sort(
        (left, right) =>
          right.playerCount - left.playerCount ||
          left.code.localeCompare(right.code)
      );
    const session = this.#accountSession(connection);
    const stats =
      session?.loggedIn && session.accountId !== 0n
        ? [...connection.db.my_account_stats.iter()].find(
            (candidate) => candidate.accountId === session.accountId
          )
        : undefined;
    this.ui.patch(
      {
        identityHex: this.#identityHex,
        localPlayerId: localPlayer?.id.toString() ?? null,
        currentRoomCode: currentRoom?.code ?? null,
        rooms,
        authLoggedIn: session?.loggedIn ?? false,
        accountsEnabled:
          this.#trustedAccountScope && (config?.accountsEnabled ?? false),
        authUsername:
          session?.loggedIn && session.username ? session.username : null,
        accountStats: stats ? this.#accountStatsView(stats) : null,
        authError: this.#authErrorMessage(session),
        tickRate: config?.tickRate ?? 60,
        roomCapacity: config?.roomCapacity ?? 12,
        scoreLimit: config?.scoreLimit ?? 30,
        matchDurationTicks: config
          ? safeNumber(config.matchDurationTicks)
          : 36_000,
        intermissionTicks: config ? safeNumber(config.intermissionTicks) : 600,
        mapVersion: config?.mapVersion ?? null,
      },
      urgent
    );
  }

  #accountStatsView(row: AccountStats): AccountStatsView {
    const kills = safeNumber(row.kills);
    const deaths = safeNumber(row.deaths);
    return {
      accountId: safeNumber(row.accountId),
      username: row.username,
      timesPlayed: safeNumber(row.timesPlayed),
      totalPlayTimeTicks: safeNumber(row.totalPlayTimeTicks),
      totalLobbyTimeTicks: safeNumber(row.totalLobbyTimeTicks),
      kills,
      deaths,
      kdr: deaths === 0 ? kills : kills / deaths,
      shotsFired: safeNumber(row.shotsFired),
      shotsHit: safeNumber(row.shotsHit),
      damageDealt: safeNumber(row.damageDealt),
      damageTaken: safeNumber(row.damageTaken),
      ammoCollected: safeNumber(row.ammoCollected),
      healthCollected: safeNumber(row.healthCollected),
      chatMessages: safeNumber(row.chatMessages),
      roomsCreated: safeNumber(row.roomsCreated),
      roomsJoined: safeNumber(row.roomsJoined),
      matchesStarted: safeNumber(row.matchesStarted),
      respawns: safeNumber(row.respawns),
      lastSeenTick: safeNumber(row.lastSeenTick),
    };
  }

  #serverConfig(connection: DbConnection): ServerConfig | undefined {
    return connection.db.server_config.id.find(0) ?? undefined;
  }

  #currentRoom(connection: DbConnection): Room | undefined {
    return [...connection.db.my_room_state.iter()][0];
  }

  #localPlayer(connection: DbConnection): PlayerView | undefined {
    return [...connection.db.my_room_players.iter()].find(
      (player) => player.isSelf
    );
  }

  #accountSession(connection: DbConnection): AccountSession | undefined {
    return [...connection.db.my_account_session.iter()][0];
  }

  #authErrorMessage(session: AccountSession | undefined): string | null {
    if (!session || session.authErrorCode === 0) return null;
    if (session.authErrorCode === 2) {
      return 'Too many authentication attempts. Try again shortly.';
    }
    if (session.authErrorCode === 4) {
      return 'Your account session expired. Sign in again to continue tracking stats.';
    }
    if (session.authErrorCode === 5) {
      return 'Accounts are unavailable until verified OIDC identity is configured.';
    }
    return 'Authentication failed. Check the supplied details and try again.';
  }

  #eventBelongsToLocalRoom(connection: DbConnection, roomId: bigint): boolean {
    return this.#currentRoom(connection)?.id === roomId;
  }

  #applyActionResult(result: ClientActionResult): void {
    if (result.actionKind === ACTION_ROOM) {
      const error = result.success
        ? null
        : conciseError(result.message, 'Arena room action failed.');
      if (this.#roomReclaimConnection === this.#connection) {
        this.#roomReclaimOutcome = {
          success: result.success,
          error,
        };
        if (!result.success) this.#roomReclaimIntent = null;
      }
      this.ui.patch(
        {
          connectionError: error,
        },
        true
      );
      return;
    }
    if (result.actionKind === ACTION_CHAT) {
      this.ui.patch(
        {
          chatError: result.success
            ? null
            : conciseError(result.message, 'Unable to send that message.'),
        },
        true
      );
    }
  }

  #captureRoomReclaimIntent(
    localPlayer: PlayerView | undefined,
    currentRoom: Room | undefined
  ): void {
    if (
      !localPlayer ||
      !currentRoom ||
      localPlayer.isBot ||
      !localPlayer.connected ||
      localPlayer.roomId !== currentRoom.id
    ) {
      return;
    }
    const nickname = sanitizeReconnectNickname(localPlayer.nickname);
    const roomCode = sanitizeReconnectRoomCode(currentRoom.code);
    if (!nickname || !roomCode) return;
    this.#roomReclaimIntent = { nickname, roomCode };
  }

  #rememberEvent(id: string): boolean {
    if (this.#seenEvents.has(id)) return false;
    this.#seenEvents.add(id);
    this.#seenEventOrder.push(id);
    while (this.#seenEventOrder.length > MAX_SEEN_EVENTS) {
      const expired = this.#seenEventOrder.shift();
      if (expired) this.#seenEvents.delete(expired);
    }
    return true;
  }

  #observeLatency(sample: number): void {
    if (!Number.isFinite(sample) || sample < 0) return;
    const bounded = Math.min(30_000, sample);
    const difference =
      this.#lastLatencySample == null
        ? 0
        : Math.abs(bounded - this.#lastLatencySample);
    this.#lastLatencySample = bounded;
    this.#latencyEwma =
      this.#latencyEwma == null
        ? bounded
        : this.#latencyEwma * 0.82 + bounded * 0.18;
    this.#latencyJitter = this.#latencyJitter * 0.82 + difference * 0.18;
    this.#latencyLow =
      this.#latencyLow == null ? bounded : Math.min(this.#latencyLow, bounded);
    const pingMs = this.#latencyEwma;
    this.ui.patch({
      pingMs,
      pingLowMs: this.#latencyLow,
      pingJitterMs: this.#latencyJitter,
      serverPipelineMs: null,
    });
    this.#emit({
      type: 'latency',
      pingMs,
      jitterMs: this.#latencyJitter,
      lowMs: this.#latencyLow,
      serverPipelineMs: null,
    });
  }

  async #runRoomAction(action: () => Promise<void>): Promise<void> {
    this.ui.patch(
      { actionBusy: true, connectionError: null, authError: null },
      true
    );
    try {
      await action();
    } catch (error) {
      const message = conciseError(error, 'Arena room action failed.');
      this.ui.patch({ connectionError: message }, true);
      throw error;
    } finally {
      this.ui.patch({ actionBusy: false }, true);
    }
  }

  async #runAuthAction(action: () => Promise<void>): Promise<void> {
    this.ui.patch({ authBusy: true, authError: null }, true);
    try {
      await action();
    } catch (error) {
      const message = conciseError(error, 'Authentication failed.');
      this.ui.patch({ authError: message }, true);
      throw error;
    } finally {
      this.ui.patch({ authBusy: false }, true);
    }
  }

  #requireAccountsEnabled(): void {
    if (this.ui.getSnapshot().accountsEnabled) return;
    throw new Error(
      'Accounts are unavailable until secure sign-in is configured.'
    );
  }

  #requireConnection(): DbConnection {
    if (!this.connected || !this.#connection) {
      throw new Error('Arena backend is not connected.');
    }
    return this.#connection;
  }

  #setStatus(
    status: BackendConnectionStatus,
    error: string | null,
    urgent: boolean
  ): void {
    this.#status = status;
    const attempt = status === 'reconnecting' ? this.#backoff.attempt : 0;
    this.ui.patch(
      {
        status,
        reconnectAttempt: attempt,
        connectionError: error,
      },
      urgent
    );
    this.#emit({
      type: 'connection',
      status,
      attempt,
      error,
    });
  }

  #emit(event: ArenaTransportEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #removePersistentLegacyToken(): void {
    try {
      const scope = {
        endpointUri: this.endpointUri,
        database: this.database,
      };
      window.localStorage.removeItem(LEGACY_ARENA_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(identityTokenStorageKey(scope));
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(`${ARENA_TOKEN_STORAGE_PREFIX}:`)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }
}
