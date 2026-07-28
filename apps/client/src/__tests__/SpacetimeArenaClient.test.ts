// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbConnection, tables } from '../generated/module_bindings';
import type {
  AccountSession,
  AccountStats,
  ChatEvent,
  ClientActionResult,
  MatchEvent,
  PickupState,
  PlayerView,
  Room,
  RoomBrowserView,
  ServerConfig,
  WeaponState,
} from '../generated/module_bindings/types';
import type {
  ArenaTransportEvent,
  SubmitInputPacket,
} from '../netcode/contracts';
import {
  DEFAULT_ARENA_DATABASE,
  DEFAULT_PRODUCTION_SPACETIME_URI,
  LEGACY_ARENA_TOKEN_STORAGE_KEY,
  identityTokenStorageKey,
} from '../netcode/endpoint';
import { SpacetimeArenaClient } from '../app/SpacetimeArenaClient';

type InsertHandler<Row> = (_context: object, row: Row) => void;
type UpdateHandler<Row> = (_context: object, oldRow: Row, row: Row) => void;
type DeleteHandler<Row> = (_context: object, row: Row) => void;

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

class FakeTable<Row> {
  readonly #rows: Row[] = [];
  readonly #insertHandlers: InsertHandler<Row>[] = [];
  readonly #updateHandlers: UpdateHandler<Row>[] = [];
  readonly #deleteHandlers: DeleteHandler<Row>[] = [];

  readonly id = {
    find: (id: unknown): Row | undefined =>
      this.#rows.find((row) => this.#rowId(row) === id),
  };

  iter(): IterableIterator<Row> {
    return this.#rows.values();
  }

  onInsert(handler: InsertHandler<Row>): void {
    this.#insertHandlers.push(handler);
  }

  onUpdate(handler: UpdateHandler<Row>): void {
    this.#updateHandlers.push(handler);
  }

  onDelete(handler: DeleteHandler<Row>): void {
    this.#deleteHandlers.push(handler);
  }

  seed(...rows: Row[]): void {
    this.#rows.push(...rows);
  }

  insert(row: Row): void {
    this.#rows.push(row);
    for (const handler of this.#insertHandlers) handler({}, row);
  }

  update(oldRow: Row, row: Row): void {
    const index = this.#findRowIndex(oldRow);
    if (index >= 0) this.#rows[index] = row;
    for (const handler of this.#updateHandlers) handler({}, oldRow, row);
  }

  remove(row: Row): void {
    const index = this.#findRowIndex(row);
    if (index >= 0) this.#rows.splice(index, 1);
    for (const handler of this.#deleteHandlers) handler({}, row);
  }

  #findRowIndex(row: Row): number {
    const id = this.#rowId(row);
    return this.#rows.findIndex(
      (candidate) =>
        candidate === row || (id != null && this.#rowId(candidate) === id)
    );
  }

  #rowId(row: Row): unknown {
    if (typeof row !== 'object' || row == null || !('id' in row)) {
      return undefined;
    }
    return (row as { id: unknown }).id;
  }
}

class FakeSubscription {
  readonly unsubscribe = vi.fn();
  queries: readonly unknown[] = [];
  #onApplied: (() => void) | null = null;
  #onError: (() => void) | null = null;

  onApplied(callback: () => void): this {
    this.#onApplied = callback;
    return this;
  }

  onError(callback: () => void): this {
    this.#onError = callback;
    return this;
  }

  subscribe(queries: readonly unknown[]): { unsubscribe(): void } {
    this.queries = [...queries];
    return { unsubscribe: this.unsubscribe };
  }

  apply(): void {
    this.#onApplied?.();
  }

  fail(): void {
    this.#onError?.();
  }
}

class FakeConnection {
  isActive = true;
  readonly subscription = new FakeSubscription();
  readonly db = {
    server_config: new FakeTable<ServerConfig>(),
    open_rooms: new FakeTable<RoomBrowserView>(),
    my_room_state: new FakeTable<Room>(),
    my_room_players: new FakeTable<PlayerView>(),
    my_weapon_states: new FakeTable<WeaponState>(),
    my_room_pickups: new FakeTable<PickupState>(),
    my_room_match_events: new FakeTable<MatchEvent>(),
    my_room_chat_events: new FakeTable<ChatEvent>(),
    my_account_session: new FakeTable<AccountSession>(),
    my_account_stats: new FakeTable<AccountStats>(),
    my_action_result: new FakeTable<ClientActionResult>(),
  };

  readonly reducers = {
    submitInput: vi.fn(() => Promise.resolve()),
    quickPlay: vi.fn(() => Promise.resolve()),
    createRoom: vi.fn(() => Promise.resolve()),
    joinRoom: vi.fn(() => Promise.resolve()),
    leaveRoom: vi.fn(() => Promise.resolve()),
    sendChatMessage: vi.fn(() => Promise.resolve()),
    loginAccount: vi.fn(() => Promise.resolve()),
    registerAccount: vi.fn(() => Promise.resolve()),
    logoutAccount: vi.fn(() => Promise.resolve()),
    requestStatsRefresh: vi.fn(() => Promise.resolve()),
  };

  readonly disconnect = vi.fn(() => {
    this.isActive = false;
  });

  subscriptionBuilder(): FakeSubscription {
    return this.subscription;
  }
}

type ConnectHandler = (
  connection: FakeConnection,
  identity: { toHexString(): string },
  token: string
) => void;
type ConnectionErrorHandler = (_context: object, error: Error) => void;
type DisconnectHandler = (_context: object, error?: Error) => void;

class FakeBuilder {
  uri: string | null = null;
  database: string | null = null;
  token: string | undefined;
  compression: string | null = null;
  #connectHandler: ConnectHandler | null = null;
  #connectErrorHandler: ConnectionErrorHandler | null = null;
  #disconnectHandler: DisconnectHandler | null = null;

  constructor(readonly connection: FakeConnection) {}

  withUri(uri: string): this {
    this.uri = uri;
    return this;
  }

  withDatabaseName(database: string): this {
    this.database = database;
    return this;
  }

  withToken(token: string | undefined): this {
    this.token = token;
    return this;
  }

  withCompression(compression: string): this {
    this.compression = compression;
    return this;
  }

  onConnect(handler: ConnectHandler): this {
    this.#connectHandler = handler;
    return this;
  }

  onConnectError(handler: ConnectionErrorHandler): this {
    this.#connectErrorHandler = handler;
    return this;
  }

  onDisconnect(handler: DisconnectHandler): this {
    this.#disconnectHandler = handler;
    return this;
  }

  build(): FakeConnection {
    return this.connection;
  }

  connect(
    nextToken = 'next-session-token-123456',
    identity = 'ABCDEF0123456789'
  ): void {
    this.connection.isActive = true;
    this.#connectHandler?.(
      this.connection,
      {
        toHexString: () => identity,
      },
      nextToken
    );
  }

  connectError(error = new Error('connection refused')): void {
    this.connection.isActive = false;
    this.#connectErrorHandler?.({}, error);
  }

  disconnect(error = new Error('connection interrupted')): void {
    this.connection.isActive = false;
    this.#disconnectHandler?.({}, error);
  }
}

class FakeConnectionHarness {
  readonly builders: FakeBuilder[] = [];

  install(): void {
    vi.spyOn(DbConnection, 'builder').mockImplementation(() => {
      const builder = new FakeBuilder(new FakeConnection());
      this.builders.push(builder);
      return builder as unknown as ReturnType<typeof DbConnection.builder>;
    });
  }

  latest(): FakeBuilder {
    const builder = this.builders.at(-1);
    if (!builder) throw new Error('Expected a SpacetimeDB builder');
    return builder;
  }
}

const room = (overrides: Partial<Room> = {}): Room => ({
  id: 7n,
  code: 'NEON7',
  phase: 1,
  round: 3,
  createdTick: 20n,
  serverTick: 0x1_0000_0005n,
  matchTick: 1_250n,
  intermissionEndsTick: 0n,
  winnerPlayerId: 0n,
  humanCount: 2,
  botCount: 10,
  ...overrides,
});

const roomBrowser = (
  overrides: Partial<RoomBrowserView> = {}
): RoomBrowserView => ({
  id: 7n,
  code: 'NEON7',
  phase: 1,
  round: 3,
  humanCount: 2,
  botCount: 10,
  ...overrides,
});

const player = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  id: 101n,
  roomId: 7n,
  nickname: 'LocalPilot',
  isSelf: true,
  isBot: false,
  connected: true,
  x: 1,
  y: 2,
  z: 3,
  vx: 4,
  vy: 5,
  vz: 6,
  yaw: 0.25,
  pitch: -0.1,
  health: 87,
  maxHealth: 100,
  alive: true,
  lifeId: 9,
  spawnProtectedUntilTick: 0x1_0000_0002n,
  respawnAtTick: 0n,
  kills: 8,
  deaths: 4,
  selectedWeapon: 3,
  lastProcessedInputSeq: 44,
  lastProcessedFireCounter: 12,
  lastProcessedReloadCounter: 4,
  lastProcessedRespawnCounter: 2,
  ...overrides,
});

const serverConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  id: 0,
  tickRate: 60,
  roomCapacity: 12,
  scoreLimit: 30,
  matchDurationTicks: 36_000n,
  intermissionTicks: 600n,
  reconnectGraceTicks: 1_200n,
  lagCompensationTicks: 12n,
  mapVersion: 'map-content-hash',
  accountsEnabled: false,
  ...overrides,
});

const weapon = (overrides: Partial<WeaponState> = {}): WeaponState => ({
  key: 809n,
  playerId: 101n,
  slot: 3,
  magazineAmmo: 5,
  reserveAmmo: 24,
  nextFireTick: 0x1_0000_0010n,
  reloadCompleteTick: 0x1_0000_0050n,
  reloading: true,
  shotCounter: 17,
  ...overrides,
});

const pickup = (overrides: Partial<PickupState> = {}): PickupState => ({
  key: 701n,
  roomId: 7n,
  pickupIndex: 1,
  kind: 2,
  x: -3,
  y: 0.5,
  z: 12,
  available: true,
  respawnAtTick: 0n,
  ...overrides,
});

const accountSession = (
  overrides: Partial<AccountSession> = {}
): AccountSession => ({
  identity: {} as AccountSession['identity'],
  connectionId: {} as AccountSession['connectionId'],
  accountId: 0n,
  username: '',
  loggedIn: false,
  authRequestId: 1,
  authErrorCode: 0,
  retryAfterMicros: 0n,
  authExpiresTick: 0n,
  ...overrides,
});

const accountStats = (overrides: Partial<AccountStats> = {}): AccountStats => ({
  accountId: 55n,
  username: 'Sky',
  timesPlayed: 12n,
  totalPlayTimeTicks: 4_000n,
  totalLobbyTimeTicks: 500n,
  eliminations: 40n,
  kills: 40n,
  deaths: 10n,
  matchesPlayed: 8n,
  wins: 2n,
  shotsFired: 500n,
  shotsHit: 250n,
  damageDealt: 8_000n,
  damageTaken: 3_200n,
  ammoCollected: 14n,
  healthCollected: 9n,
  chatMessages: 3n,
  roomsCreated: 1n,
  roomsJoined: 11n,
  matchesStarted: 8n,
  respawns: 10n,
  bestStreak: 7,
  lastSeenTick: 9_000n,
  ...overrides,
});

const matchEvent = (overrides: Partial<MatchEvent> = {}): MatchEvent => ({
  id: 1n,
  roomId: 7n,
  tick: 1_250n,
  kind: 5,
  actorPlayerId: 101n,
  targetPlayerId: 202n,
  weaponSlot: 3,
  value: 0,
  text: 'authoritative kill',
  ...overrides,
});

const chatEvent = (overrides: Partial<ChatEvent> = {}): ChatEvent => ({
  id: 2n,
  roomId: 7n,
  tick: 1_251n,
  playerId: 202n,
  nickname: 'RemotePilot',
  message: 'gg',
  ...overrides,
});

const actionResult = (
  overrides: Partial<ClientActionResult> = {}
): ClientActionResult => ({
  identity: {} as ClientActionResult['identity'],
  connectionId: {} as ClientActionResult['connectionId'],
  requestId: 1,
  actionKind: 1,
  success: true,
  errorCode: 0,
  message: '',
  updatedTick: 1_250n,
  ...overrides,
});

const connectAndApply = (
  client: SpacetimeArenaClient,
  harness: FakeConnectionHarness,
  nextToken?: string
): FakeBuilder => {
  client.connect();
  const builder = harness.latest();
  builder.connect(nextToken);
  builder.connection.subscription.apply();
  return builder;
};

let harness: FakeConnectionHarness;
let client: SpacetimeArenaClient | null;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
  harness = new FakeConnectionHarness();
  harness.install();
  client = null;
});

afterEach(() => {
  client?.dispose();
  client = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SpacetimeArenaClient caller-scoped row mapping', () => {
  it('subscribes to final scoped views and maps authoritative rows only', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    const events: ArenaTransportEvent[] = [];
    client.subscribe((event) => events.push(event));
    client.connect();
    const builder = harness.latest();
    const connection = builder.connection;
    const local = player();
    const remote = player({
      id: 202n,
      nickname: 'RemotePilot',
      isSelf: false,
      isBot: true,
      kills: 3,
      deaths: 7,
      selectedWeapon: 2,
    });
    connection.db.server_config.seed(serverConfig());
    connection.db.open_rooms.seed(roomBrowser());
    connection.db.my_room_state.seed(room());
    connection.db.my_room_players.seed(local, remote);
    connection.db.my_weapon_states.seed(weapon());
    connection.db.my_room_pickups.seed(pickup());
    connection.db.my_room_match_events.seed(
      matchEvent(),
      matchEvent({ id: 99n, roomId: 99n })
    );
    connection.db.my_room_chat_events.seed(chatEvent());

    builder.connect();
    connection.subscription.apply();

    expect(connection.subscription.queries).toEqual([
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
    const localEvent = events.find((event) => event.type === 'local-player');
    expect(localEvent).toMatchObject({
      type: 'local-player',
      snapshot: {
        id: '101',
        roomId: '7',
        nickname: 'LocalPilot',
        isBot: false,
        position: { x: 1, y: 2, z: 3 },
        velocity: { x: 4, y: 5, z: 6 },
        health: 87,
        protectedUntilTick: 2,
        selectedWeapon: 3,
        serverTick: 5,
        ackInputSeq: 44,
        ackFireCounter: 12,
        ackReloadCounter: 4,
        ackRespawnCounter: 2,
      },
    });
    expect(
      events.find(
        (event) => event.type === 'remote-player' && event.snapshot.id === '202'
      )
    ).toMatchObject({
      type: 'remote-player',
      snapshot: { nickname: 'RemotePilot', isBot: true, selectedWeapon: 2 },
    });
    expect(events.find((event) => event.type === 'weapon')).toMatchObject({
      type: 'weapon',
      snapshot: {
        playerId: '101',
        slot: 3,
        loadedAmmo: 5,
        reserveAmmo: 24,
        clipCapacity: 8,
        reloadEndsTick: 80,
        nextFireTick: 16,
      },
    });
    expect(events.find((event) => event.type === 'pickup')).toMatchObject({
      type: 'pickup',
      snapshot: {
        id: '701',
        kind: 'health',
        active: true,
        respawnAtTick: null,
      },
    });
    expect(events.find((event) => event.type === 'room')).toMatchObject({
      type: 'room',
      snapshot: {
        id: '7',
        code: 'NEON7',
        serverTick: 5,
        matchTick: 1_250,
        killLimit: 30,
      },
    });
    expect(
      events.filter(
        (event) => event.type === 'combat' && event.event.kind === 'kill'
      )
    ).toHaveLength(1);
    expect(
      events.find(
        (event) => event.type === 'combat' && event.event.kind === 'chat'
      )
    ).toMatchObject({
      type: 'combat',
      event: {
        actorId: '202',
        nickname: 'RemotePilot',
        message: 'gg',
      },
    });
    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'connected',
      identityHex: 'abcdef0123456789',
      localPlayerId: '101',
      currentRoomCode: 'NEON7',
      rooms: [
        {
          code: 'NEON7',
          playerCount: 2,
          botCount: 10,
          capacity: 12,
          active: true,
          phase: 'playing',
        },
      ],
      tickRate: 60,
      roomCapacity: 12,
      scoreLimit: 30,
      mapVersion: 'map-content-hash',
    });
  });

  it('keeps an empty scoped database free of hard-coded players and rooms', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    const events: ArenaTransportEvent[] = [];
    client.subscribe((event) => events.push(event));
    connectAndApply(client, harness);

    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'connected',
      localPlayerId: null,
      currentRoomCode: null,
      rooms: [],
      authLoggedIn: false,
      authUsername: null,
      accountStats: null,
    });
    expect(
      events.some((event) =>
        [
          'local-player',
          'remote-player',
          'room',
          'scoreboard',
          'weapon',
          'pickup',
          'combat',
        ].includes(event.type)
      )
    ).toBe(false);
  });
});

describe('SpacetimeArenaClient committed action outcomes', () => {
  it('surfaces scoped room/chat failures without mislabeling input failures', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    const builder = connectAndApply(client, harness);
    const results = builder.connection.db.my_action_result;

    const roomFailure = actionResult({
      requestId: 10,
      actionKind: 1,
      success: false,
      errorCode: 2,
      message: 'Room is\n full.',
    });
    results.insert(roomFailure);
    expect(client.ui.getSnapshot()).toMatchObject({
      connectionError: 'Room is full.',
      chatError: null,
    });

    const roomSuccess = actionResult({
      requestId: 11,
      actionKind: 1,
    });
    results.update(roomFailure, roomSuccess);
    expect(client.ui.getSnapshot().connectionError).toBeNull();

    const chatFailure = actionResult({
      requestId: 12,
      actionKind: 3,
      success: false,
      errorCode: 2,
      message: 'Chat is temporarily unavailable.',
    });
    results.update(roomSuccess, chatFailure);
    expect(client.ui.getSnapshot()).toMatchObject({
      connectionError: null,
      chatError: 'Chat is temporarily unavailable.',
    });

    const chatSuccess = actionResult({
      requestId: 13,
      actionKind: 3,
    });
    results.update(chatFailure, chatSuccess);
    expect(client.ui.getSnapshot().chatError).toBeNull();

    const inputFailure = actionResult({
      requestId: 14,
      actionKind: 2,
      success: false,
      errorCode: 3,
      message: 'Input rate limit reached.',
    });
    results.update(chatSuccess, inputFailure);
    expect(client.ui.getSnapshot()).toMatchObject({
      connectionError: null,
      chatError: null,
    });
  });
});

describe('SpacetimeArenaClient local-player lifecycle', () => {
  it('coalesces view replacement churn and clears a genuinely removed local row', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    const events: ArenaTransportEvent[] = [];
    client.subscribe((event) => events.push(event));
    client.connect();
    const builder = harness.latest();
    const connection = builder.connection;
    const original = player();
    connection.db.my_room_state.seed(room());
    connection.db.my_room_players.seed(original);
    builder.connect();
    connection.subscription.apply();
    events.length = 0;

    connection.db.my_room_players.remove(original);
    const replacement = player({ health: 63, lifeId: 10 });
    connection.db.my_room_players.insert(replacement);
    vi.runOnlyPendingTimers();
    expect(events.some((event) => event.type === 'local-player-cleared')).toBe(
      false
    );
    expect(events.find((event) => event.type === 'local-player')).toMatchObject(
      {
        type: 'local-player',
        snapshot: { health: 63, lifeId: 10 },
      }
    );

    events.length = 0;
    connection.db.my_room_players.remove(replacement);
    vi.runOnlyPendingTimers();
    expect(events).toContainEqual({ type: 'local-player-cleared' });
    expect(client.ui.getSnapshot()).toMatchObject({
      localPlayerId: null,
      currentRoomCode: null,
    });
  });

  it('emits player-removed for a remote scoped row deletion', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    const events: ArenaTransportEvent[] = [];
    client.subscribe((event) => events.push(event));
    client.connect();
    const builder = harness.latest();
    const connection = builder.connection;
    const local = player();
    const remote = player({ id: 202n, isSelf: false });
    connection.db.my_room_state.seed(room());
    connection.db.my_room_players.seed(local, remote);
    builder.connect();
    connection.subscription.apply();
    events.length = 0;

    connection.db.my_room_players.remove(remote);
    vi.runOnlyPendingTimers();
    expect(events).toContainEqual({
      type: 'player-removed',
      playerId: '202',
    });
  });
});

describe('SpacetimeArenaClient authentication mapping', () => {
  it('maps caller-scoped auth status, errors, and persistent stats', () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    client.connect();
    const builder = harness.latest();
    const connection = builder.connection;
    connection.db.server_config.seed(serverConfig({ accountsEnabled: true }));
    const throttled = accountSession({ authErrorCode: 2 });
    connection.db.my_account_session.seed(throttled);
    connection.db.my_account_stats.seed(accountStats());
    builder.connect();
    connection.subscription.apply();
    expect(client.ui.getSnapshot()).toMatchObject({
      accountsEnabled: true,
      authLoggedIn: false,
      authError: 'Too many authentication attempts. Try again shortly.',
    });

    const expired = accountSession({ authRequestId: 2, authErrorCode: 4 });
    connection.db.my_account_session.update(throttled, expired);
    expect(client.ui.getSnapshot().authError).toBe(
      'Your account session expired. Sign in again to continue tracking stats.'
    );

    const authenticated = accountSession({
      accountId: 55n,
      username: 'Sky',
      loggedIn: true,
      authRequestId: 3,
      authErrorCode: 0,
      authExpiresTick: 50_000n,
    });
    connection.db.my_account_session.update(expired, authenticated);
    expect(client.ui.getSnapshot()).toMatchObject({
      authLoggedIn: true,
      authUsername: 'Sky',
      authError: null,
      accountStats: {
        accountId: 55,
        username: 'Sky',
        kills: 40,
        deaths: 10,
        kdr: 4,
        shotsFired: 500,
        shotsHit: 250,
      },
    });
  });

  it('surfaces reducer auth failures and always releases busy state', async () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    client.connect();
    const builder = harness.latest();
    builder.connection.db.server_config.seed(
      serverConfig({ accountsEnabled: true })
    );
    builder.connect();
    builder.connection.subscription.apply();
    builder.connection.reducers.loginAccount.mockRejectedValueOnce(
      new Error('Invalid\n credentials supplied')
    );
    const login = client.login('sky@example.com', 'incorrect');
    expect(client.ui.getSnapshot().authBusy).toBe(true);
    await expect(login).rejects.toThrow('Invalid');
    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'connected',
      authBusy: false,
      authError: 'Invalid credentials supplied',
    });
  });

  it('rejects account actions for a custom endpoint even when its flag is true', async () => {
    client = new SpacetimeArenaClient({
      endpointUri: 'https://malicious.example',
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    client.connect();
    const builder = harness.latest();
    builder.connection.db.server_config.seed(
      serverConfig({ accountsEnabled: true })
    );
    builder.connect();
    builder.connection.subscription.apply();

    expect(client.ui.getSnapshot().accountsEnabled).toBe(false);
    await expect(
      client.login('sky@example.com', 'password123')
    ).rejects.toThrow('Accounts are unavailable');
    await expect(
      client.register('sky@example.com', 'Sky', 'password123')
    ).rejects.toThrow('Accounts are unavailable');

    expect(builder.connection.reducers.loginAccount).not.toHaveBeenCalled();
    expect(builder.connection.reducers.registerAccount).not.toHaveBeenCalled();
  });
});

describe('SpacetimeArenaClient reconnect and session token handling', () => {
  it('loads, rotates, and reconnects with only the scoped session token', () => {
    const storage = new MemoryStorage();
    const scope = {
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
    };
    const storageKey = identityTokenStorageKey(scope);
    const firstToken = 'initial-session-token-123456';
    const rotatedToken = 'rotated-session-token-123456';
    storage.setItem(storageKey, firstToken);
    window.localStorage.setItem(storageKey, 'persistent-token-must-be-removed');
    window.localStorage.setItem(
      LEGACY_ARENA_TOKEN_STORAGE_KEY,
      'legacy-persistent-token-must-be-removed'
    );
    client = new SpacetimeArenaClient({
      endpointUri: scope.endpointUri,
      database: scope.database,
      storage,
    });
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(
      window.localStorage.getItem(LEGACY_ARENA_TOKEN_STORAGE_KEY)
    ).toBeNull();

    client.connect();
    const firstBuilder = harness.latest();
    expect(firstBuilder.token).toBe(firstToken);
    firstBuilder.connect(rotatedToken);
    firstBuilder.connection.subscription.apply();
    expect(storage.getItem(storageKey)).toBe(rotatedToken);

    firstBuilder.disconnect(new Error('test packet interruption'));
    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'reconnecting',
      reconnectAttempt: 1,
      connectionError: 'test packet interruption',
    });
    vi.runOnlyPendingTimers();
    expect(harness.builders).toHaveLength(2);
    const reconnectBuilder = harness.latest();
    expect(reconnectBuilder.token).toBe(rotatedToken);
    reconnectBuilder.connect('second-rotated-session-token');
    reconnectBuilder.connection.subscription.apply();
    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'connected',
      reconnectAttempt: 0,
      connectionError: null,
    });
  });

  it('reclaims an authoritative room only after a transient reconnect', async () => {
    const storage = new MemoryStorage();
    const scope = {
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
    };
    client = new SpacetimeArenaClient({
      endpointUri: scope.endpointUri,
      database: scope.database,
      storage,
    });

    client.connect();
    const initialBuilder = harness.latest();
    initialBuilder.connection.db.my_room_state.seed(room({ code: ' neo$n7 ' }));
    initialBuilder.connection.db.my_room_players.seed(
      player({ nickname: ' Pilot<script> ' })
    );
    initialBuilder.connect('initial-session-token-123456');
    initialBuilder.connection.subscription.apply();

    expect(initialBuilder.connection.reducers.joinRoom).not.toHaveBeenCalled();
    expect(client.ui.getSnapshot().status).toBe('connected');

    initialBuilder.disconnect(new Error('transient socket interruption'));
    vi.runOnlyPendingTimers();
    const reconnectBuilder = harness.latest();
    reconnectBuilder.connection.db.my_room_state.seed(room());
    reconnectBuilder.connection.db.my_room_players.seed(
      player({
        nickname: 'BOT-101',
        isBot: true,
      })
    );
    reconnectBuilder.connect('rotated-session-token-123456');
    reconnectBuilder.connection.subscription.apply();

    expect(client.ui.getSnapshot().status).toBe('reconnecting');
    await Promise.resolve();
    await Promise.resolve();

    expect(
      reconnectBuilder.connection.reducers.joinRoom
    ).toHaveBeenCalledOnce();
    expect(reconnectBuilder.connection.reducers.joinRoom).toHaveBeenCalledWith({
      nickname: 'Pilotscript',
      roomCode: 'NEON7',
    });
    expect(client.ui.getSnapshot()).toMatchObject({
      status: 'connected',
      connectionError: null,
    });

    const storageKey = identityTokenStorageKey(scope);
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe(storageKey);
    expect(storage.getItem(storageKey)).toBe('rotated-session-token-123456');
    expect(window.localStorage.length).toBe(0);
  });

  it('does not reclaim a room after the player explicitly leaves', async () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    client.connect();
    const initialBuilder = harness.latest();
    initialBuilder.connection.db.my_room_state.seed(room());
    initialBuilder.connection.db.my_room_players.seed(player());
    initialBuilder.connect();
    initialBuilder.connection.subscription.apply();

    await client.leaveRoom();
    initialBuilder.disconnect(new Error('disconnect after leave'));
    vi.runOnlyPendingTimers();
    const reconnectBuilder = harness.latest();
    reconnectBuilder.connection.db.my_room_state.seed(room());
    reconnectBuilder.connection.db.my_room_players.seed(
      player({ nickname: 'BOT-101', isBot: true })
    );
    reconnectBuilder.connect();
    reconnectBuilder.connection.subscription.apply();
    await Promise.resolve();

    expect(
      reconnectBuilder.connection.reducers.joinRoom
    ).not.toHaveBeenCalled();
    expect(client.ui.getSnapshot().status).toBe('connected');
  });
});

describe('SpacetimeArenaClient reducer invocation', () => {
  it('calls room, chat, account, stats, and input reducers with exact arguments', async () => {
    client = new SpacetimeArenaClient({
      endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
      database: DEFAULT_ARENA_DATABASE,
      storage: new MemoryStorage(),
    });
    client.connect();
    const builder = harness.latest();
    builder.connection.db.server_config.seed(
      serverConfig({ accountsEnabled: true })
    );
    builder.connect();
    builder.connection.subscription.apply();
    const reducers = builder.connection.reducers;

    const quickPlay = client.quickPlay('Pilot');
    expect(client.ui.getSnapshot().actionBusy).toBe(true);
    await quickPlay;
    expect(client.ui.getSnapshot().actionBusy).toBe(false);
    await client.createRoom('Pilot', 'NOVA7');
    await client.joinRoom('Pilot', 'NOVA7');
    await client.leaveRoom();
    await client.sendChat('hello arena');
    await client.login('sky@example.com', 'password123');
    await client.register('sky@example.com', 'Sky', 'password123');
    await client.logout();
    await client.refreshStats();

    const input: SubmitInputPacket = {
      seq: 12,
      clientTick: 900n,
      moveX: 0.25,
      moveZ: -0.5,
      yaw: 1.2,
      pitch: -0.3,
      buttons: 65,
      desiredWeapon: 2,
      fireCounter: 4,
      reloadCounter: 2,
      respawnCounter: 1,
    };
    await client.sendInput(input);

    expect(reducers.quickPlay).toHaveBeenCalledWith({ nickname: 'Pilot' });
    expect(reducers.createRoom).toHaveBeenCalledWith({
      nickname: 'Pilot',
      requestedCode: 'NOVA7',
    });
    expect(reducers.joinRoom).toHaveBeenCalledWith({
      nickname: 'Pilot',
      roomCode: 'NOVA7',
    });
    expect(reducers.leaveRoom).toHaveBeenCalledWith({});
    expect(reducers.sendChatMessage).toHaveBeenCalledWith({
      message: 'hello arena',
    });
    expect(reducers.loginAccount).toHaveBeenCalledWith({
      usernameOrEmail: 'sky@example.com',
      password: 'password123',
    });
    expect(reducers.registerAccount).toHaveBeenCalledWith({
      email: 'sky@example.com',
      username: 'Sky',
      password: 'password123',
    });
    expect(reducers.logoutAccount).toHaveBeenCalledWith({});
    expect(reducers.requestStatsRefresh).toHaveBeenCalledWith({});
    expect(reducers.submitInput).toHaveBeenCalledWith(input);
  });
});
