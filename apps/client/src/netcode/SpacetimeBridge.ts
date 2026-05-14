import {
  MAX_PITCH,
  MAX_HEALTH,
  RIFLE_CLIP_SIZE,
  RIFLE_CARRY_CAPACITY,
  RIFLE_FIRE_INTERVAL_TICKS,
  RIFLE_RESERVE_CAPACITY,
  SERVER_TICK_MS,
  SHOTGUN_FIRE_INTERVAL_TICKS,
  SNIPER_FIRE_INTERVAL_TICKS,
  WEAPON_SLOT_RIFLE,
  WEAPON_SLOT_SHOTGUN,
  WEAPON_SLOT_SNIPER,
  type WeaponSlot,
  type AmmoPackView,
  type DamageEvent,
  type HealthPackView,
  type ImpactMarkView,
  type InputCommand,
  type LocalPlayerState,
  type MatchView,
  type RemotePlayerState,
  type WeaponSnapshot,
} from '@arena/shared';
import { useGameStore } from '../state/gameStore';
import { SPACETIMEDB_DATABASE, getSpacetimeUriCandidates } from '../utils/env';
import { identityToString } from '../utils/identity';
import { readAuthSessionToken } from './authClient';
import { shouldAcceptDamageEventForRoom } from './damageEvents';
import {
  CONNECTION_STAGE_LABEL,
  type ConnectionStage,
} from './connectionProgress';
import { DbConnection, tables } from '../generated/module_bindings';
import AmmoPackTable from '../generated/module_bindings/ammo_pack_table';
import ChatEventTable from '../generated/module_bindings/chat_event_table';
import DamageEventTable from '../generated/module_bindings/damage_event_table';
import HealthPackTable from '../generated/module_bindings/health_pack_table';
import ImpactMarkTable from '../generated/module_bindings/impact_mark_table';
import KillFeedEventTable from '../generated/module_bindings/kill_feed_event_table';
import MatchStateTable from '../generated/module_bindings/match_state_table';
import PlayerTable from '../generated/module_bindings/player_table';
import PlayerStateTable from '../generated/module_bindings/player_state_table';
import RoomTable from '../generated/module_bindings/room_table';
import WeaponStateTable from '../generated/module_bindings/weapon_state_table';
import type { Infer } from 'spacetimedb';

const RECONNECT_RETRY_INTERVAL_MS = 500;
const RECONNECT_WINDOW_MS = 10_000;
const CONNECT_TIMEOUT_MS = 12_000;
const MAX_REASONABLE_PIPELINE_MS = 5_000;
const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
const shouldRetryWithoutStoredToken = (error: Error): boolean => {
  const message = error.message.toLowerCase();
  return (
    message.includes('token') ||
    message.includes('auth') ||
    message.includes('unauthor') ||
    message.includes('forbidden') ||
    message.includes('invalid identity')
  );
};
const isLikelyConnectionLossError = (error: Error): boolean => {
  const message = error.message.toLowerCase();
  return (
    message.includes('connection') ||
    message.includes('socket') ||
    message.includes('websocket') ||
    message.includes('transport') ||
    message.includes('network') ||
    message.includes('disconnect') ||
    message.includes('closed') ||
    message.includes('not connected')
  );
};

type RoomRow = Infer<typeof RoomTable>;
type PlayerRow = Infer<typeof PlayerTable>;
type PlayerStateRow = Infer<typeof PlayerStateTable>;
type WeaponStateRow = Infer<typeof WeaponStateTable>;
type MatchStateRow = Infer<typeof MatchStateTable>;
type KillFeedEventRow = Infer<typeof KillFeedEventTable>;
type AmmoPackRow = Infer<typeof AmmoPackTable>;
type ChatEventRow = Infer<typeof ChatEventTable>;
type HealthPackRow = Infer<typeof HealthPackTable>;
type DamageEventRow = Infer<typeof DamageEventTable>;
type ImpactMarkRow = Infer<typeof ImpactMarkTable>;

export interface ConnectOptions {
  nickname: string;
  roomCode: string;
  createRoom: boolean;
}

interface BridgeCallbacks {
  onLocalState: (state: LocalPlayerState) => void;
  onRemoteState: (state: RemotePlayerState) => void;
  onDamageEvent: (event: DamageEvent) => void;
  onImpactMark: (mark: ImpactMarkView) => void;
  onImpactMarkRemoved: (id: number) => void;
  onServerTick: (serverTimeMs: number) => void;
  onWeaponState: (weapon: WeaponSnapshot) => void;
  onReconnectStateChange: (state: {
    reconnecting: boolean;
    attempt: number;
    startedAtMs: number | null;
  }) => void;
  onConnectionStageChange?: (stage: ConnectionStage) => void;
  onDisconnected: (reason?: string) => void;
}

export class SpacetimeBridge {
  private connection: DbConnection | null = null;
  private localIdentity = '';
  private activeRoomCode: string | null = null;
  private latestWeaponTick = -1;
  private latestWeaponSignature = '';
  private latestLocalState: LocalPlayerState | null = null;
  private suppressDisconnectEvents = false;
  private localArrivalOffsetMs = 0;
  private localArrivalOffsetInitialized = false;
  private readonly remoteArrivalOffsetMs = new Map<string, number>();
  private readonly chatBaselineTickByRoom = new Map<string, number>();
  private readonly killFeedBaselineTickByRoom = new Map<string, number>();
  private readonly damageBaselineTickByRoom = new Map<string, number>();
  private autoReconnectEnabled = false;
  private reconnectLoopId = 0;
  private lastConnectOptions: ConnectOptions | null = null;
  private connectionStage: ConnectionStage = 'idle';
  private schemaMismatchDetected = false;
  private connectionToken: string | undefined;
  private malformedPlayerStateWarningReported = false;

  constructor(private readonly callbacks: BridgeCallbacks) {}

  async connect(options: ConnectOptions): Promise<void> {
    this.setConnectionStage('opening_socket');
    this.autoReconnectEnabled = true;
    this.reconnectLoopId += 1;
    this.lastConnectOptions = {
      nickname: options.nickname,
      roomCode: options.roomCode,
      createRoom: false,
    };
    this.callbacks.onReconnectStateChange({
      reconnecting: false,
      attempt: 0,
      startedAtMs: null,
    });
    await this.connectInternal(options, {
      setConnectingStatus: true,
      setErrorStatusOnFailure: true,
    });
  }

  disconnect(): void {
    this.setConnectionStage('idle');
    this.autoReconnectEnabled = false;
    this.reconnectLoopId += 1;
    this.lastConnectOptions = null;
    this.callbacks.onReconnectStateChange({
      reconnecting: false,
      attempt: 0,
      startedAtMs: null,
    });
    if (this.connection) {
      this.suppressDisconnectEvents = true;
      this.connection.disconnect();
      this.suppressDisconnectEvents = false;
    }
    this.connection = null;
    this.localIdentity = '';
    this.activeRoomCode = null;
    this.latestWeaponTick = -1;
    this.latestWeaponSignature = '';
    this.latestLocalState = null;
    this.localArrivalOffsetMs = 0;
    this.localArrivalOffsetInitialized = false;
    this.remoteArrivalOffsetMs.clear();
    this.chatBaselineTickByRoom.clear();
    this.killFeedBaselineTickByRoom.clear();
    this.damageBaselineTickByRoom.clear();
    this.schemaMismatchDetected = false;
    this.malformedPlayerStateWarningReported = false;
    this.clearStoredToken();
  }

  private async connectInternal(
    options: ConnectOptions,
    {
      setConnectingStatus,
      setErrorStatusOnFailure,
    }: {
      setConnectingStatus: boolean;
      setErrorStatusOnFailure: boolean;
    }
  ): Promise<void> {
    const store = useGameStore.getState();
    if (setConnectingStatus) {
      store.setConnection('connecting', null);
    }
    this.activeRoomCode = options.roomCode;
    this.latestWeaponTick = -1;
    this.latestWeaponSignature = '';
    this.latestLocalState = null;
    const endpointCandidates = getSpacetimeUriCandidates();
    const failures: string[] = [];

    for (const uri of endpointCandidates) {
      try {
        await this.connectWithUri(uri, options);
        return;
      } catch (error) {
        const normalized = normalizeError(error);
        failures.push(`${uri} (${normalized.message})`);
        this.resetActiveConnection();
      }
    }

    const message = `Unable to connect to backend. Tried: ${failures.join(' -> ')}`;
    if (setErrorStatusOnFailure) {
      store.setConnection('error', message);
    }
    throw new Error(message);
  }

  async submitInput(command: InputCommand): Promise<void> {
    await this.runReducer((connection) =>
      connection.reducers.submitInput({
        sequence: command.sequence,
        moveX: command.moveX,
        moveZ: command.moveZ,
        yaw: command.yaw,
        pitch: command.pitch,
        jumping: command.jumpHeld,
        sprinting: command.sprintHeld,
        crouching: command.crouchHeld,
        scoped: command.scoped,
        fireHeld: command.fireHeld,
        reloadPressed: command.reloadPressed,
        weaponSlot: command.weaponSlot,
      })
    );
  }

  async requestRespawn(): Promise<void> {
    await this.runReducer((connection) =>
      connection.reducers.requestRespawn({})
    );
  }

  async sendChatMessage(message: string): Promise<void> {
    await this.runReducer((connection) =>
      connection.reducers.sendChatMessage({ message })
    );
  }

  async ping(): Promise<void> {
    await this.runReducer((connection) => connection.reducers.ping({}));
  }

  private readStoredToken(): string | undefined {
    // Keep identity stable across socket reconnects without sharing it across tabs.
    return this.connectionToken;
  }

  private setStoredToken(token: string): void {
    this.connectionToken = token || undefined;
  }

  private clearStoredToken(): void {
    this.connectionToken = undefined;
  }

  private async runReducer(
    operation: (connection: DbConnection) => Promise<unknown>
  ): Promise<void> {
    const connection = this.connection;
    if (!connection) {
      return;
    }

    try {
      await operation(connection);
    } catch (error) {
      const normalized = normalizeError(error);
      if (
        this.connection === connection &&
        this.autoReconnectEnabled &&
        isLikelyConnectionLossError(normalized)
      ) {
        this.connection = null;
        void this.handleUnexpectedDisconnect(normalized.message);
      }
      throw normalized;
    }
  }

  private resetActiveConnection(): void {
    if (this.connection) {
      this.suppressDisconnectEvents = true;
      this.connection.disconnect();
      this.suppressDisconnectEvents = false;
    }
    this.connection = null;
    this.localIdentity = '';
    this.activeRoomCode = null;
    this.latestLocalState = null;
    this.localArrivalOffsetMs = 0;
    this.localArrivalOffsetInitialized = false;
    this.remoteArrivalOffsetMs.clear();
    this.chatBaselineTickByRoom.clear();
    this.killFeedBaselineTickByRoom.clear();
    this.damageBaselineTickByRoom.clear();
  }

  private async connectWithUri(
    uri: string,
    options: ConnectOptions
  ): Promise<void> {
    const storedToken = this.readStoredToken();

    try {
      await this.connectWithUriAttempt(uri, options, storedToken);
      return;
    } catch (error) {
      const initialError = normalizeError(error);
      if (!storedToken || !shouldRetryWithoutStoredToken(initialError)) {
        throw initialError;
      }

      this.clearStoredToken();
      this.resetActiveConnection();

      try {
        await this.connectWithUriAttempt(uri, options, undefined);
      } catch (retryError) {
        const normalizedRetryError = normalizeError(retryError);
        throw new Error(
          `${normalizedRetryError.message} (retry without stored token also failed; initial error: ${initialError.message})`
        );
      }
    }
  }

  private async connectWithUriAttempt(
    uri: string,
    options: ConnectOptions,
    token?: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let established = false;
      let connectedRef: DbConnection | null = null;
      const timeoutId = window.setTimeout(() => {
        if (connectedRef) {
          connectedRef.disconnect();
        }
        finishReject(
          new Error(
            `Connection timed out during ${CONNECTION_STAGE_LABEL[this.connectionStage].toLowerCase()}.`
          )
        );
      }, CONNECT_TIMEOUT_MS);
      const finishResolve = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      };
      const fail = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        reject(normalizeError(error));
      };
      const finishReject = (error: unknown): void => {
        fail(error);
      };

      const builder = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(SPACETIMEDB_DATABASE)
        .withToken(token)
        .onConnect((connection, identity, token) => {
          established = true;
          connectedRef = connection;
          this.connection = connection;
          this.setConnectionStage('subscribing');
          this.localIdentity = identityToString(identity);
          this.setStoredToken(token);
          useGameStore.getState().setLocalIdentity(this.localIdentity);
          this.installListeners(connection);
          void (async () => {
            try {
              await Promise.resolve(
                connection
                  .subscriptionBuilder()
                  .subscribe([
                    tables.room,
                    tables.player,
                    tables.player_state,
                    tables.weapon_state,
                    tables.match_state,
                    tables.ammo_pack,
                    tables.chat_event,
                    tables.health_pack,
                    tables.impact_mark,
                    tables.kill_feed_event,
                    tables.damage_event,
                  ])
              );

              await this.bootstrap(connection, options);
              for (const row of connection.db.player.iter() as Iterable<PlayerRow>) {
                this.handlePlayerRow(row);
              }
              for (const row of connection.db.player_state.iter() as Iterable<PlayerStateRow>) {
                this.handlePlayerStateRow(row);
              }
              for (const row of connection.db.weapon_state.iter() as Iterable<WeaponStateRow>) {
                this.handleWeaponStateRow(row);
              }
              this.setConnectionStage('waiting_for_player');
              useGameStore.getState().setConnection('connected', null);
              useGameStore.getState().setConnectedRoomCode(options.roomCode);
              finishResolve();
            } catch (error) {
              fail(error);
            }
          })();
        })
        .onConnectError((_ctx, error) => {
          fail(error);
        })
        .onDisconnect((_ctx, error) => {
          if (
            !established ||
            this.suppressDisconnectEvents ||
            !this.autoReconnectEnabled ||
            !connectedRef ||
            this.connection !== connectedRef
          ) {
            return;
          }
          this.connection = null;
          void this.handleUnexpectedDisconnect(error?.message);
        });

      try {
        builder.build();
      } catch (error) {
        fail(error);
      }
    });
  }

  private async handleUnexpectedDisconnect(reason?: string): Promise<void> {
    if (!this.autoReconnectEnabled) {
      return;
    }
    const reconnectOptions = this.lastConnectOptions;
    if (!reconnectOptions) {
      useGameStore
        .getState()
        .setConnection(reason ? 'error' : 'disconnected', reason ?? null);
      this.callbacks.onDisconnected(reason);
      return;
    }

    const loopId = ++this.reconnectLoopId;
    const startedAtMs = performance.now();
    let attempt = 0;
    this.callbacks.onReconnectStateChange({
      reconnecting: true,
      attempt,
      startedAtMs,
    });

    while (this.autoReconnectEnabled && loopId === this.reconnectLoopId) {
      if (performance.now() - startedAtMs >= RECONNECT_WINDOW_MS) {
        break;
      }
      attempt += 1;
      this.callbacks.onReconnectStateChange({
        reconnecting: true,
        attempt,
        startedAtMs,
      });
      try {
        await this.connectInternal(reconnectOptions, {
          setConnectingStatus: false,
          setErrorStatusOnFailure: false,
        });
        if (!this.autoReconnectEnabled || loopId !== this.reconnectLoopId) {
          return;
        }
        this.callbacks.onReconnectStateChange({
          reconnecting: false,
          attempt: 0,
          startedAtMs: null,
        });
        return;
      } catch {
        if (performance.now() - startedAtMs >= RECONNECT_WINDOW_MS) {
          break;
        }
        await new Promise((resolve) =>
          window.setTimeout(resolve, RECONNECT_RETRY_INTERVAL_MS)
        );
      }
    }

    if (!this.autoReconnectEnabled || loopId !== this.reconnectLoopId) {
      return;
    }
    this.callbacks.onReconnectStateChange({
      reconnecting: false,
      attempt: 0,
      startedAtMs: null,
    });
    const message = reason
      ? `Disconnected from server (${reason}). Unable to reconnect.`
      : 'Disconnected from server. Unable to reconnect.';
    useGameStore.getState().setConnection('error', message);
    this.callbacks.onDisconnected(message);
  }

  private installListeners(connection: DbConnection): void {
    connection.db.room.onInsert((_ctx, row) => this.handleRoomRow(row));
    connection.db.room.onUpdate((_ctx, row) => this.handleRoomRow(row));
    connection.db.room.onDelete((_ctx, row) =>
      useGameStore.getState().removeRoom(row.code)
    );
    connection.db.player.onInsert((_ctx, row) => this.handlePlayerRow(row));
    connection.db.player.onUpdate((_ctx, row) => this.handlePlayerRow(row));
    connection.db.player.onDelete((_ctx, row) =>
      this.handlePlayerDeleteRow(row)
    );
    connection.db.player_state.onInsert((_ctx, row) =>
      this.handlePlayerStateRow(row)
    );
    connection.db.player_state.onUpdate((_ctx, row) =>
      this.handlePlayerStateRow(row)
    );
    connection.db.weapon_state.onInsert((_ctx, row) =>
      this.handleWeaponStateRow(row)
    );
    connection.db.weapon_state.onUpdate((_ctx, row) =>
      this.handleWeaponStateRow(row)
    );
    connection.db.match_state.onInsert((_ctx, row) =>
      this.handleMatchStateRow(row)
    );
    connection.db.match_state.onUpdate((_ctx, row) =>
      this.handleMatchStateRow(row)
    );
    connection.db.match_state.onDelete((_ctx, row) => {
      if (!this.isTrackedRoom(row.roomCode)) return;
      useGameStore.getState().setMatch(null);
    });
    connection.db.ammo_pack.onInsert((_ctx, row) =>
      this.handleAmmoPackRow(row)
    );
    connection.db.ammo_pack.onUpdate((_ctx, row) =>
      this.handleAmmoPackRow(row)
    );
    connection.db.ammo_pack.onDelete((_ctx, row) =>
      useGameStore.getState().removeAmmoPack(row.id)
    );
    connection.db.chat_event.onInsert((_ctx, row) =>
      this.handleChatEventRow(row)
    );
    connection.db.chat_event.onUpdate((_ctx, row) =>
      this.handleChatEventRow(row)
    );
    connection.db.health_pack.onInsert((_ctx, row) =>
      this.handleHealthPackRow(row)
    );
    connection.db.health_pack.onUpdate((_ctx, row) =>
      this.handleHealthPackRow(row)
    );
    connection.db.health_pack.onDelete((_ctx, row) =>
      useGameStore.getState().removeHealthPack(row.id)
    );
    connection.db.impact_mark.onInsert((_ctx, row) =>
      this.handleImpactMarkRow(row)
    );
    connection.db.impact_mark.onUpdate((_ctx, row) =>
      this.handleImpactMarkRow(row)
    );
    connection.db.impact_mark.onDelete((_ctx, row) =>
      this.callbacks.onImpactMarkRemoved(row.id)
    );
    connection.db.kill_feed_event.onInsert((_ctx, row) =>
      this.handleKillFeedRow(row)
    );
    connection.db.damage_event.onInsert((_ctx, row) =>
      this.handleDamageEventRow(row)
    );
  }

  private handleRoomRow(row: RoomRow): void {
    useGameStore.getState().upsertRoom({
      code: row.code,
      playerCount: row.playerCount,
      active: row.active,
    });
  }

  private async bootstrap(
    connection: DbConnection,
    options: ConnectOptions
  ): Promise<void> {
    this.chatBaselineTickByRoom.set(
      options.roomCode,
      this.getRoomEventBaselineTick(
        Array.from(connection.db.chat_event.iter() as Iterable<ChatEventRow>),
        options.roomCode
      )
    );
    this.killFeedBaselineTickByRoom.set(
      options.roomCode,
      this.getRoomEventBaselineTick(
        Array.from(
          connection.db.kill_feed_event.iter() as Iterable<KillFeedEventRow>
        ),
        options.roomCode
      )
    );
    this.damageBaselineTickByRoom.set(
      options.roomCode,
      this.getRoomEventBaselineTick(
        Array.from(
          connection.db.damage_event.iter() as Iterable<DamageEventRow>
        ),
        options.roomCode
      )
    );

    const sessionToken = readAuthSessionToken();
    if (sessionToken) {
      this.setConnectionStage('authenticating');
      await connection.reducers
        .loginWithSession({ sessionToken })
        .catch(() => undefined);
    }
    this.setConnectionStage('joining_room');
    await connection.reducers.setNickname({
      nickname: options.nickname || 'Pilot',
    });
    if (options.createRoom) {
      await connection.reducers.createRoom({ roomCode: options.roomCode });
    }
    await connection.reducers.joinRoom({ roomCode: options.roomCode });
    if (options.createRoom) {
      await connection.reducers.startMatch({ roomCode: options.roomCode });
    }
  }

  private handlePlayerRow(row: PlayerRow): void {
    const identity = identityToString(row.identity);
    const store = useGameStore.getState();
    store.upsertPlayerMeta({
      identity,
      nickname: row.nickname,
      kills: row.kills,
      deaths: row.deaths,
      connected: row.connected,
      roomCode: row.roomCode ?? null,
    });

    if (identity !== this.localIdentity && (!row.connected || !row.roomCode)) {
      store.removeRemotePlayer(identity);
      store.setPlayerPing(identity, null);
      this.remoteArrivalOffsetMs.delete(identity);
    }
  }

  private handlePlayerDeleteRow(row: PlayerRow): void {
    const identity = identityToString(row.identity);
    if (identity === this.localIdentity) {
      return;
    }
    const store = useGameStore.getState();
    store.removeRemotePlayer(identity);
    store.setPlayerPing(identity, null);
    this.remoteArrivalOffsetMs.delete(identity);
  }

  private handlePlayerStateRow(row: PlayerStateRow): void {
    const normalized = this.normalizePlayerStateRow(row);
    const identity = identityToString(row.identity);
    const currentAmmo = Math.max(
      0,
      Math.min(RIFLE_CARRY_CAPACITY, useGameStore.getState().localPlayer.ammo)
    );
    const nowMs = performance.now();
    const state = {
      identity,
      position: normalized.position,
      velocity: normalized.velocity,
      serverTick: normalized.serverTick,
      serverTimeMs: normalized.serverTick * SERVER_TICK_MS,
      inputPipelineMs: normalized.inputPipelineMs,
      yaw: normalized.yaw,
      pitch: normalized.pitch,
      onGround: normalized.onGround,
      sprinting: normalized.sprinting,
      crouching: normalized.crouching,
      alive: normalized.alive,
      health: normalized.health,
      ammo: currentAmmo,
      lastProcessedInput: normalized.lastProcessedInput,
      respawnTick: normalized.respawnTick,
    } satisfies LocalPlayerState;

    if (identity === this.localIdentity) {
      this.updateLocalArrivalOffset(state.serverTimeMs, nowMs);
      if (!this.shouldAcceptLocalState(state)) {
        return;
      }
      this.latestLocalState = state;
      this.setConnectionStage('ready');
      this.callbacks.onLocalState(state);
      return;
    }

    this.updateRemotePingEstimate(identity, state.serverTimeMs, nowMs);

    const meta = useGameStore.getState().players[identity];
    const remoteRoomCode = meta?.roomCode ?? row.roomCode ?? null;
    this.callbacks.onRemoteState({
      identity,
      nickname: meta?.nickname ?? 'Pilot',
      kills: meta?.kills ?? 0,
      deaths: meta?.deaths ?? 0,
      roomCode: remoteRoomCode,
      position: state.position,
      velocity: state.velocity,
      serverTick: state.serverTick,
      serverTimeMs: state.serverTimeMs,
      yaw: state.yaw,
      pitch: state.pitch,
      sprinting: state.sprinting,
      crouching: state.crouching,
      alive: state.alive,
      health: state.health,
    });
  }

  private updateLocalArrivalOffset(serverTimeMs: number, nowMs: number): void {
    const sample = nowMs - serverTimeMs;
    if (!Number.isFinite(sample)) {
      return;
    }
    if (!this.localArrivalOffsetInitialized) {
      this.localArrivalOffsetMs = sample;
      this.localArrivalOffsetInitialized = true;
      return;
    }
    this.localArrivalOffsetMs =
      this.localArrivalOffsetMs * 0.88 + sample * 0.12;
  }

  private updateRemotePingEstimate(
    identity: string,
    serverTimeMs: number,
    nowMs: number
  ): void {
    const sample = nowMs - serverTimeMs;
    if (!Number.isFinite(sample)) {
      return;
    }
    const previous = this.remoteArrivalOffsetMs.get(identity);
    const smoothed =
      previous == null ? sample : previous * 0.88 + sample * 0.12;
    this.remoteArrivalOffsetMs.set(identity, smoothed);

    if (!this.localArrivalOffsetInitialized) {
      return;
    }
    const store = useGameStore.getState();
    const localPing = store.localPingMs ?? 48;
    const relativeDelta = smoothed - this.localArrivalOffsetMs;
    const estimatedPing = Math.round(
      Math.max(8, Math.min(380, localPing + relativeDelta))
    );
    store.setPlayerPing(identity, estimatedPing);
  }

  private handleWeaponStateRow(row: WeaponStateRow): void {
    if (identityToString(row.identity) !== this.localIdentity) {
      return;
    }

    const store = useGameStore.getState();
    const tick = row.nextReadyTick;
    const previousTick = this.latestWeaponTick;
    const snapshot: WeaponSnapshot = {
      selectedWeaponSlot:
        row.selectedWeaponSlot === WEAPON_SLOT_SNIPER ||
        row.selectedWeaponSlot === WEAPON_SLOT_SHOTGUN
          ? row.selectedWeaponSlot
          : WEAPON_SLOT_RIFLE,
      ammoInMag: Math.max(0, Math.min(RIFLE_CLIP_SIZE, row.ammoInMag)),
      reserveAmmo: Math.max(
        0,
        Math.min(RIFLE_RESERVE_CAPACITY, row.reserveAmmo)
      ),
      reloading: row.reloading,
      reloadStartedTick: row.reloadStartedTick,
      reloadCompleteTick: row.reloadCompleteTick,
      nextReadyTick: row.nextReadyTick,
    };
    const signature = JSON.stringify(snapshot);
    const isStaleTick = tick < previousTick;

    if (isStaleTick && signature === this.latestWeaponSignature) {
      return;
    }
    if (
      !isStaleTick &&
      tick === previousTick &&
      this.latestWeaponSignature === signature
    ) {
      return;
    }

    this.latestWeaponTick = Math.max(previousTick, tick);
    this.latestWeaponSignature = signature;
    const totalAmmo = snapshot.ammoInMag + snapshot.reserveAmmo;
    const currentAmmo = Math.max(
      0,
      Math.min(RIFLE_CARRY_CAPACITY, store.localPlayer.ammo)
    );
    if (totalAmmo !== currentAmmo) {
      store.setLocalPlayer({ ammo: totalAmmo });
    }
    this.callbacks.onWeaponState(snapshot);
  }

  private handleMatchStateRow(row: MatchStateRow): void {
    if (!this.isTrackedRoom(row.roomCode)) {
      return;
    }

    const match: MatchView = {
      roomCode: row.roomCode,
      active: row.active,
      tick: row.tick,
      remainingMs: row.remainingMs,
      round: row.round,
    };
    this.callbacks.onServerTick(row.tick * SERVER_TICK_MS);
    useGameStore.getState().setMatch(match);
  }

  private handleKillFeedRow(row: KillFeedEventRow): void {
    const trackedRoom = this.getTrackedRoomCode();
    if (!trackedRoom || row.roomCode !== trackedRoom) {
      return;
    }
    const baselineTick = this.killFeedBaselineTickByRoom.get(trackedRoom);
    if (baselineTick == null) {
      return;
    }
    if (row.tick <= baselineTick) {
      return;
    }

    useGameStore.getState().pushKillFeed({
      id: row.id,
      kind: 'kill',
      senderNickname: row.attackerNickname,
      message: `eliminated ${row.victimNickname}`,
      tick: performance.now(),
    });

    if (identityToString(row.victimIdentity) === this.localIdentity) {
      this.forceLocalDeath(row.tick);
    }
  }

  private handleChatEventRow(row: ChatEventRow): void {
    const trackedRoom = this.getTrackedRoomCode();
    if (!trackedRoom || row.roomCode !== trackedRoom) {
      return;
    }
    const baselineTick = this.chatBaselineTickByRoom.get(trackedRoom);
    if (baselineTick == null) {
      return;
    }
    if (row.tick <= baselineTick) {
      return;
    }

    const id = 1_000_000_000 + row.id;
    useGameStore.getState().pushKillFeed({
      id,
      kind: 'chat',
      senderNickname: row.senderNickname,
      message: row.message,
      tick: performance.now(),
    });
  }

  private handleAmmoPackRow(row: AmmoPackRow): void {
    if (!this.isTrackedRoom(row.roomCode)) {
      return;
    }

    const view: AmmoPackView = {
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      active: row.active,
      respawnTick: row.respawnTick,
    };
    useGameStore.getState().upsertAmmoPack(view);
  }

  private handleHealthPackRow(row: HealthPackRow): void {
    if (!this.isTrackedRoom(row.roomCode)) {
      return;
    }

    const view: HealthPackView = {
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      active: row.active,
      respawnTick: row.respawnTick,
    };
    useGameStore.getState().upsertHealthPack(view);
  }

  private handleDamageEventRow(row: DamageEventRow): void {
    const trackedRoom = this.getTrackedRoomCode();
    if (
      !shouldAcceptDamageEventForRoom({
        roomCode: row.roomCode,
        tick: row.tick,
        trackedRoomCode: trackedRoom,
        baselineTick: trackedRoom
          ? this.damageBaselineTickByRoom.get(trackedRoom)
          : undefined,
      })
    ) {
      return;
    }

    const event: DamageEvent = {
      id: row.id,
      roomCode: row.roomCode,
      attackerIdentity: identityToString(row.attackerIdentity),
      victimIdentity: identityToString(row.victimIdentity),
      amount: row.amount,
      tick: row.tick,
      causedDeath: row.causedDeath,
    };

    if (event.attackerIdentity === this.localIdentity) {
      useGameStore.getState().triggerHitmarker(performance.now() + 180);
    }
    if (event.victimIdentity === this.localIdentity && event.causedDeath) {
      this.forceLocalDeath(event.tick);
    }
    this.callbacks.onDamageEvent(event);
  }

  private handleImpactMarkRow(row: ImpactMarkRow): void {
    if (!this.isTrackedRoom(row.roomCode)) {
      return;
    }

    this.callbacks.onImpactMark({
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      normal: { x: row.normalX, y: row.normalY, z: row.normalZ },
      tick: row.tick,
    });
  }

  private getTrackedRoomCode(): string | null {
    const storeRoom = useGameStore.getState().connectedRoomCode;
    return storeRoom ?? this.activeRoomCode;
  }

  private isTrackedRoom(roomCode: string | null | undefined): boolean {
    const trackedRoom = this.getTrackedRoomCode();
    return trackedRoom != null && roomCode === trackedRoom;
  }

  private getRoomEventBaselineTick<
    T extends {
      roomCode: string;
      tick: number;
    },
  >(events: T[], roomCode: string): number {
    let baseline = 0;
    for (const event of events) {
      if (event.roomCode !== roomCode) {
        continue;
      }
      if (event.tick > baseline) {
        baseline = event.tick;
      }
    }
    return baseline;
  }

  private shouldAcceptLocalState(next: LocalPlayerState): boolean {
    const previous = this.latestLocalState;
    if (!previous) {
      return true;
    }
    const deathTransition =
      previous.alive && !next.alive && next.respawnTick >= previous.respawnTick;
    if (deathTransition) {
      return true;
    }

    if (!previous.alive) {
      const respawnTransition =
        next.alive &&
        ((next.respawnTick > previous.respawnTick &&
          next.health >= previous.health) ||
          (next.respawnTick === previous.respawnTick &&
            next.serverTick > previous.serverTick &&
            next.health >= MAX_HEALTH));
      if (respawnTransition) {
        return true;
      }
      if (next.alive) {
        return false;
      }
      if (next.serverTick < previous.serverTick) {
        return false;
      }
      if (next.serverTick > previous.serverTick) {
        return true;
      }
      return next.lastProcessedInput >= previous.lastProcessedInput;
    }

    if (next.serverTick < previous.serverTick) {
      return false;
    }
    if (next.serverTick > previous.serverTick) {
      return true;
    }

    if (next.health > previous.health && !next.alive) {
      return false;
    }

    return next.lastProcessedInput >= previous.lastProcessedInput;
  }

  private forceLocalDeath(tick: number): void {
    const previous = this.latestLocalState;
    if (previous && !previous.alive && previous.respawnTick >= tick) {
      return;
    }

    const store = useGameStore.getState();
    const source = previous ?? store.localPlayer;
    const serverTick = Math.max(source.serverTick, tick);
    const forcedState: LocalPlayerState = {
      ...source,
      identity: this.localIdentity || source.identity,
      alive: false,
      health: 0,
      velocity: { x: 0, y: 0, z: 0 },
      serverTick,
      serverTimeMs: serverTick * SERVER_TICK_MS,
      respawnTick: Math.max(source.respawnTick, tick),
    };
    this.latestLocalState = forcedState;
    this.callbacks.onLocalState(forcedState);
  }

  getFireIntervalTicks(weaponSlot: WeaponSlot): number {
    if (weaponSlot === WEAPON_SLOT_SNIPER) {
      return SNIPER_FIRE_INTERVAL_TICKS;
    }
    if (weaponSlot === WEAPON_SLOT_SHOTGUN) {
      return SHOTGUN_FIRE_INTERVAL_TICKS;
    }
    return RIFLE_FIRE_INTERVAL_TICKS;
  }

  private setConnectionStage(stage: ConnectionStage): void {
    if (this.connectionStage === stage) {
      return;
    }
    this.connectionStage = stage;
    this.callbacks.onConnectionStageChange?.(stage);
  }

  private normalizePlayerStateRow(row: PlayerStateRow): {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    serverTick: number;
    inputPipelineMs: number;
    yaw: number;
    pitch: number;
    onGround: boolean;
    sprinting: boolean;
    crouching: boolean;
    alive: boolean;
    health: number;
    lastProcessedInput: number;
    respawnTick: number;
  } {
    const fallback = useGameStore.getState().localPlayer;
    let sanitized = false;
    const numberOr = (value: unknown, fallbackValue: number): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      sanitized = true;
      return fallbackValue;
    };
    const boolOr = (value: unknown, fallbackValue: boolean): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      sanitized = true;
      return fallbackValue;
    };
    const intOr = (
      value: unknown,
      fallbackValue: number,
      max = Number.MAX_SAFE_INTEGER
    ): number => Math.max(0, Math.min(max, Math.round(numberOr(value, fallbackValue))));

    const normalized = {
      position: {
        x: numberOr(row.x, fallback.position.x),
        y: numberOr(row.y, fallback.position.y),
        z: numberOr(row.z, fallback.position.z),
      },
      velocity: {
        x: numberOr(row.velX, fallback.velocity.x),
        y: numberOr(row.velY, fallback.velocity.y),
        z: numberOr(row.velZ, fallback.velocity.z),
      },
      serverTick: intOr(row.serverTick, fallback.serverTick),
      inputPipelineMs: intOr(
        row.inputPipelineMs,
        fallback.inputPipelineMs,
        MAX_REASONABLE_PIPELINE_MS
      ),
      yaw: numberOr(row.yaw, fallback.yaw),
      pitch: Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, numberOr(row.pitch, fallback.pitch))
      ),
      onGround: boolOr(row.onGround, fallback.onGround),
      sprinting: boolOr(row.sprinting, false),
      crouching: boolOr(row.crouching, false),
      alive: boolOr(row.alive, fallback.alive),
      health: intOr(row.health, fallback.health, MAX_HEALTH),
      lastProcessedInput: intOr(row.lastProcessedInput, fallback.lastProcessedInput),
      respawnTick: intOr(row.respawnTick, fallback.respawnTick),
    };

    if (sanitized && !this.malformedPlayerStateWarningReported) {
      this.malformedPlayerStateWarningReported = true;
      console.warn(
        'Received partial or malformed player_state data; sanitized row instead of blocking gameplay.',
        row
      );
    }

    return normalized;
  }

  private failSchemaMismatch(row: PlayerStateRow): void {
    if (this.schemaMismatchDetected) {
      return;
    }
    this.schemaMismatchDetected = true;
    this.autoReconnectEnabled = false;
    this.callbacks.onReconnectStateChange({
      reconnecting: false,
      attempt: 0,
      startedAtMs: null,
    });
    const message =
      'Received invalid player_state data from the backend. Frontend bindings are out of sync with the published SpacetimeDB schema. Regenerate bindings and redeploy the client.';
    useGameStore.getState().setConnection('error', message);
    console.error('Schema mismatch detected while decoding player_state', row);
    if (this.connection) {
      this.suppressDisconnectEvents = true;
      this.connection.disconnect();
      this.suppressDisconnectEvents = false;
    }
    this.connection = null;
    this.callbacks.onDisconnected(message);
  }
}
