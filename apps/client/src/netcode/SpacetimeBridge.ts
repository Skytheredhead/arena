import {
  RIFLE_FIRE_INTERVAL_TICKS,
  SERVER_TICK_MS,
  type AmmoPackView,
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
  private suppressDisconnectEvents = false;

  constructor(private readonly callbacks: BridgeCallbacks) {}

  async connect(options: ConnectOptions): Promise<void> {
    const store = useGameStore.getState();
    store.setConnection('connecting', null);
    this.latestWeaponTick = -1;
    this.latestWeaponAmmo = -1;
    const endpointCandidates = getSpacetimeUriCandidates(store.forceLocalBackend);
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

  private readStoredToken(): string | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private setStoredToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Ignore storage write failures; session can continue with in-memory auth.
    }
  }

  private clearStoredToken(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage write failures; retry still proceeds without explicit token.
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
    if (options.createRoom) {
      await connection.reducers.startMatch({ roomCode: options.roomCode });
    }
  }

  private handlePlayerRow(row: PlayerRow): void {
    const identity = identityToString(row.identity);
    useGameStore.getState().upsertPlayerMeta({
      identity,
      nickname: row.nickname,
      kills: row.kills,
      deaths: row.deaths,
      connected: row.connected,
      roomCode: row.roomCode ?? null
    });
  }

  private handlePlayerStateRow(row: PlayerStateRow): void {
    const identity = identityToString(row.identity);
    const currentAmmo = useGameStore.getState().localPlayer.ammo;
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
      this.callbacks.onLocalState(state);
      return;
    }

    const meta = useGameStore.getState().players[identity];
    this.callbacks.onRemoteState({
      identity,
      nickname: meta?.nickname ?? 'Pilot',
      kills: meta?.kills ?? 0,
      deaths: meta?.deaths ?? 0,
      roomCode: row.roomCode ?? null,
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

  private handleWeaponStateRow(row: WeaponStateRow): void {
    if (identityToString(row.identity) !== this.localIdentity) {
      return;
    }

    const store = useGameStore.getState();
    const currentAmmo = store.localPlayer.ammo;
    const tick = row.nextReadyTick;
    const previousTick = this.latestWeaponTick;
    const previousAmmo = this.latestWeaponAmmo;
    if (tick < previousTick) {
      return;
    }
    if (tick === previousTick && previousAmmo >= 0 && row.ammoInMag < previousAmmo) {
      return;
    }

    this.latestWeaponTick = tick;
    this.latestWeaponAmmo = row.ammoInMag;
    if (row.ammoInMag !== currentAmmo) {
      store.setLocalPlayer({ ammo: row.ammoInMag });
      this.callbacks.onWeaponAmmo(row.ammoInMag);
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
    if (connectedRoom && row.roomCode !== connectedRoom) {
      return;
    }

    useGameStore.getState().pushKillFeed({
      id: row.id,
      attackerNickname: row.attackerNickname,
      victimNickname: row.victimNickname,
      tick: row.tick
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
    if (identityToString(row.attackerIdentity) === this.localIdentity) {
      useGameStore.getState().triggerHitmarker(performance.now() + 180);
    }
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

  getFireIntervalTicks(): number {
    return RIFLE_FIRE_INTERVAL_TICKS;
  }
}
