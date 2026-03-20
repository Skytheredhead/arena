import {
  RIFLE_FIRE_INTERVAL_TICKS,
  RIFLE_MAGAZINE,
  SERVER_TICK_MS,
  type AmmoPackView,
  type DamageEvent,
  type HealthPackView,
  type ImpactMarkView,
  type InputCommand,
  type LocalPlayerState,
  type MatchView,
  type RemotePlayerState
} from '@arena/shared';
import { useGameStore } from '../state/gameStore';
import { SPACETIMEDB_DATABASE, getSpacetimeUriCandidates } from '../utils/env';
import { identityToString } from '../utils/identity';
import {
  DbConnection,
  tables
} from '../generated/module_bindings';
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

const TOKEN_STORAGE_KEY = 'vector-drift-token';
const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

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
  onWeaponAmmo: (ammo: number) => void;
  onDisconnected: (reason?: string) => void;
}

export class SpacetimeBridge {
  private connection: DbConnection | null = null;
  private localIdentity = '';
  private latestWeaponTick = -1;
  private latestWeaponAmmo = -1;
  private latestLocalState: LocalPlayerState | null = null;
  private suppressDisconnectEvents = false;
  private localArrivalOffsetMs = 0;
  private localArrivalOffsetInitialized = false;
  private readonly remoteArrivalOffsetMs = new Map<string, number>();
  private readonly chatBaselineTickByRoom = new Map<string, number>();
  private readonly killFeedBaselineTickByRoom = new Map<string, number>();

  constructor(private readonly callbacks: BridgeCallbacks) {}

  async connect(options: ConnectOptions): Promise<void> {
    const store = useGameStore.getState();
    store.setConnection('connecting', null);
    this.latestWeaponTick = -1;
    this.latestWeaponAmmo = -1;
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
    store.setConnection('error', message);
    throw new Error(message);
  }

  disconnect(): void {
    this.connection?.disconnect();
    this.connection = null;
    this.localIdentity = '';
    this.latestWeaponTick = -1;
    this.latestWeaponAmmo = -1;
    this.latestLocalState = null;
    this.localArrivalOffsetMs = 0;
    this.localArrivalOffsetInitialized = false;
    this.remoteArrivalOffsetMs.clear();
    this.chatBaselineTickByRoom.clear();
    this.killFeedBaselineTickByRoom.clear();
  }

  async submitInput(command: InputCommand): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.reducers.submitInput({
      sequence: command.sequence,
      moveX: command.moveX,
      moveZ: command.moveZ,
      yaw: command.yaw,
      pitch: command.pitch,
      jumping: command.jumping,
      sprinting: command.sprinting
    });
  }

  async fireWeapon(yaw: number, pitch: number, scoped: boolean): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.reducers.fireWeapon({ yaw, pitch, scoped });
  }

  async requestRespawn(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.reducers.requestRespawn({});
  }

  async sendChatMessage(message: string): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.reducers.sendChatMessage({ message });
  }

  private readStoredToken(): string | undefined {
    // Intentionally disabled so each tab/session gets an independent identity.
    // This avoids multi-tab identity collisions from shared persisted tokens.
    return undefined;
  }

  private setStoredToken(token: string): void {
    void token;
  }

  private clearStoredToken(): void {
    void TOKEN_STORAGE_KEY;
  }

  private resetActiveConnection(): void {
    if (this.connection) {
      this.suppressDisconnectEvents = true;
      this.connection.disconnect();
      this.suppressDisconnectEvents = false;
    }
    this.connection = null;
    this.localIdentity = '';
    this.latestLocalState = null;
    this.localArrivalOffsetMs = 0;
    this.localArrivalOffsetInitialized = false;
    this.remoteArrivalOffsetMs.clear();
    this.chatBaselineTickByRoom.clear();
    this.killFeedBaselineTickByRoom.clear();
  }

  private async connectWithUri(uri: string, options: ConnectOptions): Promise<void> {
    const storedToken = this.readStoredToken();

    try {
      await this.connectWithUriAttempt(uri, options, storedToken);
      return;
    } catch (error) {
      const initialError = normalizeError(error);
      if (!storedToken) {
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
      const fail = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(normalizeError(error));
      };

      const succeed = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      const builder = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(SPACETIMEDB_DATABASE)
        .withToken(token)
        .onConnect((connection, identity, token) => {
          established = true;
          this.connection = connection;
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
                    tables.damage_event
                  ])
              );

              await this.bootstrap(connection, options);
              useGameStore.getState().setConnection('connected', null);
              useGameStore.getState().setConnectedRoomCode(options.roomCode);
              succeed();
            } catch (error) {
              fail(error);
            }
          })();
        })
        .onConnectError((_ctx, error) => {
          fail(error);
        })
        .onDisconnect((_ctx, error) => {
          if (!established || this.suppressDisconnectEvents) {
            return;
          }
          useGameStore.getState().setConnection(
            error ? 'error' : 'disconnected',
            error?.message ?? null
          );
          this.callbacks.onDisconnected(error?.message);
        });

      try {
        builder.build();
      } catch (error) {
        fail(error);
      }
    });
  }

  private installListeners(connection: DbConnection): void {
    connection.db.room.onInsert((_ctx, row) => this.handleRoomRow(row));
    connection.db.room.onUpdate((_ctx, row) => this.handleRoomRow(row));
    connection.db.room.onDelete((_ctx, row) => useGameStore.getState().removeRoom(row.code));
    connection.db.player.onInsert((_ctx, row) => this.handlePlayerRow(row));
    connection.db.player.onUpdate((_ctx, row) => this.handlePlayerRow(row));
    connection.db.player.onDelete((_ctx, row) => this.handlePlayerDeleteRow(row));
    connection.db.player_state.onInsert((_ctx, row) => this.handlePlayerStateRow(row));
    connection.db.player_state.onUpdate((_ctx, row) => this.handlePlayerStateRow(row));
    connection.db.weapon_state.onInsert((_ctx, row) => this.handleWeaponStateRow(row));
    connection.db.weapon_state.onUpdate((_ctx, row) => this.handleWeaponStateRow(row));
    connection.db.match_state.onInsert((_ctx, row) => this.handleMatchStateRow(row));
    connection.db.match_state.onUpdate((_ctx, row) => this.handleMatchStateRow(row));
    connection.db.match_state.onDelete((_ctx, row) => {
      const store = useGameStore.getState();
      if (store.connectedRoomCode === row.roomCode) {
        store.setMatch(null);
      }
    });
    connection.db.ammo_pack.onInsert((_ctx, row) => this.handleAmmoPackRow(row));
    connection.db.ammo_pack.onUpdate((_ctx, row) => this.handleAmmoPackRow(row));
    connection.db.ammo_pack.onDelete((_ctx, row) => useGameStore.getState().removeAmmoPack(row.id));
    connection.db.chat_event.onInsert((_ctx, row) => this.handleChatEventRow(row));
    connection.db.chat_event.onUpdate((_ctx, row) => this.handleChatEventRow(row));
    connection.db.health_pack.onInsert((_ctx, row) => this.handleHealthPackRow(row));
    connection.db.health_pack.onUpdate((_ctx, row) => this.handleHealthPackRow(row));
    connection.db.health_pack.onDelete((_ctx, row) =>
      useGameStore.getState().removeHealthPack(row.id)
    );
    connection.db.impact_mark.onInsert((_ctx, row) => this.handleImpactMarkRow(row));
    connection.db.impact_mark.onUpdate((_ctx, row) => this.handleImpactMarkRow(row));
    connection.db.impact_mark.onDelete((_ctx, row) => this.callbacks.onImpactMarkRemoved(row.id));
    connection.db.kill_feed_event.onInsert((_ctx, row) => this.handleKillFeedRow(row));
    connection.db.damage_event.onInsert((_ctx, row) => this.handleDamageEventRow(row));
  }

  private handleRoomRow(row: RoomRow): void {
    useGameStore.getState().upsertRoom({
      code: row.code,
      playerCount: row.playerCount,
      active: row.active
    });
  }

  private async bootstrap(connection: DbConnection, options: ConnectOptions): Promise<void> {
    await connection.reducers.setNickname({ nickname: options.nickname || 'Pilot' });
    if (options.createRoom) {
      await connection.reducers.createRoom({ roomCode: options.roomCode });
    }
    await connection.reducers.joinRoom({ roomCode: options.roomCode });
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
        Array.from(connection.db.kill_feed_event.iter() as Iterable<KillFeedEventRow>),
        options.roomCode
      )
    );
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
      roomCode: row.roomCode ?? null
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
    const identity = identityToString(row.identity);
    const currentAmmo = Math.max(0, Math.min(RIFLE_MAGAZINE, useGameStore.getState().localPlayer.ammo));
    const nowMs = performance.now();
    const state = {
      identity,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.velX, y: row.velY, z: row.velZ },
      serverTick: row.serverTick,
      serverTimeMs: row.serverTick * SERVER_TICK_MS,
      yaw: row.yaw,
      pitch: row.pitch,
      onGround: row.onGround,
      alive: row.alive,
      health: row.health,
      ammo: currentAmmo,
      lastProcessedInput: row.lastProcessedInput,
      respawnTick: row.respawnTick
    } satisfies LocalPlayerState;

    if (identity === this.localIdentity) {
      this.updateLocalArrivalOffset(state.serverTimeMs, nowMs);
      if (!this.shouldAcceptLocalState(state)) {
        return;
      }
      this.latestLocalState = state;
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
      alive: state.alive,
      health: state.health
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
    this.localArrivalOffsetMs = this.localArrivalOffsetMs * 0.88 + sample * 0.12;
  }

  private updateRemotePingEstimate(identity: string, serverTimeMs: number, nowMs: number): void {
    const sample = nowMs - serverTimeMs;
    if (!Number.isFinite(sample)) {
      return;
    }
    const previous = this.remoteArrivalOffsetMs.get(identity);
    const smoothed = previous == null ? sample : previous * 0.88 + sample * 0.12;
    this.remoteArrivalOffsetMs.set(identity, smoothed);

    if (!this.localArrivalOffsetInitialized) {
      return;
    }
    const store = useGameStore.getState();
    const localPing = store.localPingMs ?? 48;
    const relativeDelta = smoothed - this.localArrivalOffsetMs;
    const estimatedPing = Math.round(Math.max(8, Math.min(380, localPing + relativeDelta)));
    store.setPlayerPing(identity, estimatedPing);
  }

  private handleWeaponStateRow(row: WeaponStateRow): void {
    if (identityToString(row.identity) !== this.localIdentity) {
      return;
    }

    const store = useGameStore.getState();
    const currentAmmo = Math.max(0, Math.min(RIFLE_MAGAZINE, store.localPlayer.ammo));
    const tick = row.nextReadyTick;
    const previousTick = this.latestWeaponTick;
    const normalizedAmmo = Math.max(0, Math.min(RIFLE_MAGAZINE, row.ammoInMag));
    const previousAmmo = this.latestWeaponAmmo;
    if (tick < previousTick) {
      return;
    }
    if (tick === previousTick && previousAmmo === normalizedAmmo) {
      return;
    }

    this.latestWeaponTick = tick;
    this.latestWeaponAmmo = normalizedAmmo;
    if (normalizedAmmo !== currentAmmo) {
      store.setLocalPlayer({ ammo: normalizedAmmo });
      this.callbacks.onWeaponAmmo(normalizedAmmo);
    }
  }

  private handleMatchStateRow(row: MatchStateRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (connectedRoom && row.roomCode !== connectedRoom) {
      return;
    }

    const match: MatchView = {
      roomCode: row.roomCode,
      active: row.active,
      tick: row.tick,
      remainingMs: row.remainingMs,
      round: row.round
    };
    this.callbacks.onServerTick(row.tick * SERVER_TICK_MS);
    useGameStore.getState().setMatch(match);
  }

  private handleKillFeedRow(row: KillFeedEventRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (!connectedRoom || row.roomCode !== connectedRoom) {
      return;
    }
    const baselineTick = this.killFeedBaselineTickByRoom.get(connectedRoom) ?? 0;
    if (row.tick <= baselineTick) {
      return;
    }

    useGameStore.getState().pushKillFeed({
      id: row.id,
      kind: 'kill',
      senderNickname: row.attackerNickname,
      message: `eliminated ${row.victimNickname}`,
      tick: performance.now()
    });
  }

  private handleChatEventRow(row: ChatEventRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (!connectedRoom || row.roomCode !== connectedRoom) {
      return;
    }
    const baselineTick = this.chatBaselineTickByRoom.get(connectedRoom) ?? 0;
    if (row.tick <= baselineTick) {
      return;
    }

    const id = 1_000_000_000 + row.id;
    useGameStore.getState().pushKillFeed({
      id,
      kind: 'chat',
      senderNickname: row.senderNickname,
      message: row.message,
      tick: performance.now()
    });
  }

  private handleAmmoPackRow(row: AmmoPackRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (connectedRoom && row.roomCode !== connectedRoom) {
      return;
    }

    const view: AmmoPackView = {
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      active: row.active,
      respawnTick: row.respawnTick
    };
    useGameStore.getState().upsertAmmoPack(view);
  }

  private handleHealthPackRow(row: HealthPackRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (connectedRoom && row.roomCode !== connectedRoom) {
      return;
    }

    const view: HealthPackView = {
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      active: row.active,
      respawnTick: row.respawnTick
    };
    useGameStore.getState().upsertHealthPack(view);
  }

  private handleDamageEventRow(row: DamageEventRow): void {
    const event: DamageEvent = {
      id: row.id,
      attackerIdentity: identityToString(row.attackerIdentity),
      victimIdentity: identityToString(row.victimIdentity),
      amount: row.amount,
      tick: row.tick,
      causedDeath: row.causedDeath
    };

    if (event.attackerIdentity === this.localIdentity) {
      useGameStore.getState().triggerHitmarker(performance.now() + 180);
    }
    this.callbacks.onDamageEvent(event);
  }

  private handleImpactMarkRow(row: ImpactMarkRow): void {
    const connectedRoom = useGameStore.getState().connectedRoomCode;
    if (connectedRoom && row.roomCode !== connectedRoom) {
      return;
    }

    this.callbacks.onImpactMark({
      id: row.id,
      roomCode: row.roomCode,
      position: { x: row.x, y: row.y, z: row.z },
      normal: { x: row.normalX, y: row.normalY, z: row.normalZ },
      tick: row.tick
    });
  }

  private getRoomEventBaselineTick<
    T extends {
      roomCode: string;
      tick: number;
    }
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
    if (next.serverTick < previous.serverTick) {
      return false;
    }
    if (next.serverTick > previous.serverTick) {
      return true;
    }
    const deathTransition = previous.alive && !next.alive;
    if (deathTransition) {
      return true;
    }

    const respawnTransition =
      !previous.alive && next.alive && next.respawnTick > previous.respawnTick;
    if (respawnTransition) {
      return true;
    }

    if (!previous.alive && next.alive) {
      return false;
    }

    if (next.health > previous.health && !next.alive) {
      return false;
    }

    return next.lastProcessedInput >= previous.lastProcessedInput;
  }

  getFireIntervalTicks(): number {
    return RIFLE_FIRE_INTERVAL_TICKS;
  }
}
