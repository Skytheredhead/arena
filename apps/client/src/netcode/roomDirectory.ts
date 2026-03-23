import { DbConnection, tables } from '../generated/module_bindings';
import RoomTable from '../generated/module_bindings/room_table';
import {
  SPACETIMEDB_DATABASE,
  SPACETIMEDB_REMOTE_URI,
  getSpacetimeUriCandidates,
  getSpacetimeUriForTarget,
  type BackendTarget
} from '../utils/env';
import type { Infer } from 'spacetimedb';

type RoomRow = Infer<typeof RoomTable>;

export interface RoomDirectoryEntry {
  code: string;
  playerCount: number;
  active: boolean;
}

export interface RoomDirectoryLiveCallbacks {
  onSnapshot: (rows: RoomDirectoryEntry[]) => void;
  onPingSample: (rttMs: number) => void;
  onStateChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

export interface RoomDirectoryLiveHandle {
  stop: () => void;
}

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const LIVE_RECONNECT_RETRY_MS = 900;
const LIVE_BACKGROUND_PING_INTERVAL_MS = 1000;
const LIVE_FOREGROUND_PING_INTERVAL_MS = 250;

const getEndpointCandidates = (preferredTarget?: BackendTarget): string[] => {
  if (!preferredTarget) {
    return getSpacetimeUriCandidates();
  }
  const selected = getSpacetimeUriForTarget(preferredTarget);
  if (selected === SPACETIMEDB_REMOTE_URI) {
    return [selected];
  }
  return Array.from(new Set([selected, SPACETIMEDB_REMOTE_URI]));
};

const fetchSnapshotFromUri = async (uri: string): Promise<RoomDirectoryEntry[]> => {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let connection: DbConnection | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = (error?: unknown, rows?: RoomDirectoryEntry[]): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (connection) {
        connection.disconnect();
        connection = null;
      }
      if (error) {
        reject(normalizeError(error));
        return;
      }
      resolve(rows ?? []);
    };

    timeoutId = setTimeout(() => {
      finish(new Error(`Room directory timeout for ${uri}`));
    }, 5000);

    const builder = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(SPACETIMEDB_DATABASE)
      .onConnect(connected => {
        connection = connected;
        void (async () => {
          try {
            await Promise.resolve(
              connected
                .subscriptionBuilder()
                .subscribe([tables.room])
            );
            const rows = Array.from(connected.db.room.iter() as Iterable<RoomRow>).map(row => ({
              code: row.code,
              playerCount: row.playerCount,
              active: row.active
            }));
            finish(undefined, rows);
          } catch (error) {
            finish(error);
          }
        })();
      })
      .onConnectError((_ctx, error) => {
        finish(error);
      })
      .onDisconnect((_ctx, error) => {
        if (!settled && error) {
          finish(error);
        }
      });

    try {
      builder.build();
    } catch (error) {
      finish(error);
    }
  });
};

export const fetchOpenRoomsSnapshot = async (
  preferredTarget?: BackendTarget
): Promise<RoomDirectoryEntry[]> => {
  const endpointCandidates = getEndpointCandidates(preferredTarget);
  let lastError: Error | null = null;
  for (const uri of endpointCandidates) {
    try {
      return await fetchSnapshotFromUri(uri);
    } catch (error) {
      lastError = normalizeError(error);
    }
  }
  if (lastError) {
    throw lastError;
  }
  return [];
};

class LiveRoomDirectory implements RoomDirectoryLiveHandle {
  private connection: DbConnection | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInFlight = false;
  private endpointCursor = 0;
  private readonly rows = new Map<string, RoomDirectoryEntry>();

  constructor(
    private readonly preferredTarget: BackendTarget | undefined,
    private readonly callbacks: RoomDirectoryLiveCallbacks
  ) {}

  start(): void {
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  private emitSnapshot(): void {
    const rows = Array.from(this.rows.values()).sort((left, right) =>
      left.code.localeCompare(right.code)
    );
    this.callbacks.onSnapshot(rows);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.callbacks.onStateChange?.(false);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, LIVE_RECONNECT_RETRY_MS);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    this.pingInFlight = false;
  }

  private startPingLoop(connection: DbConnection): void {
    this.stopPingLoop();
    const loop = (): void => {
      if (this.stopped || this.connection !== connection) {
        return;
      }
      const active =
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        document.hasFocus();
      const nextDelay = active
        ? LIVE_FOREGROUND_PING_INTERVAL_MS
        : LIVE_BACKGROUND_PING_INTERVAL_MS;
      if (this.pingInFlight) {
        this.pingTimer = setTimeout(loop, nextDelay);
        return;
      }
      this.pingInFlight = true;
      const startedAt = performance.now();
      void connection.reducers
        .ping({})
        .then(() => {
          if (this.stopped || this.connection !== connection) {
            return;
          }
          this.callbacks.onPingSample(Math.max(1, performance.now() - startedAt));
        })
        .catch(error => {
          if (this.stopped || this.connection !== connection) {
            return;
          }
          this.callbacks.onError?.(normalizeError(error));
        })
        .finally(() => {
          this.pingInFlight = false;
          if (this.stopped || this.connection !== connection) {
            return;
          }
          this.pingTimer = setTimeout(loop, nextDelay);
        });
    };
    loop();
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const uris = getEndpointCandidates(this.preferredTarget);
    if (uris.length === 0) {
      this.scheduleReconnect();
      return;
    }

    for (let offset = 0; offset < uris.length; offset += 1) {
      const uri = uris[(this.endpointCursor + offset) % uris.length];
      if (!uri) {
        continue;
      }
      try {
        await this.connectToUri(uri);
        this.endpointCursor = (this.endpointCursor + offset + 1) % uris.length;
        return;
      } catch (error) {
        this.callbacks.onError?.(normalizeError(error));
      }
    }
    this.scheduleReconnect();
  }

  private async connectToUri(uri: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.stopped) {
        resolve();
        return;
      }
      let settled = false;
      const finishResolve = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const finishReject = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(normalizeError(error));
      };

      const builder = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(SPACETIMEDB_DATABASE)
        .onConnect(connection => {
          if (this.stopped) {
            connection.disconnect();
            finishResolve();
            return;
          }
          this.connection = connection;
          this.rows.clear();
          connection.db.room.onInsert((_ctx, row) => {
            this.rows.set(row.code, {
              code: row.code,
              playerCount: row.playerCount,
              active: row.active
            });
            this.emitSnapshot();
          });
          connection.db.room.onUpdate((_ctx, row) => {
            this.rows.set(row.code, {
              code: row.code,
              playerCount: row.playerCount,
              active: row.active
            });
            this.emitSnapshot();
          });
          connection.db.room.onDelete((_ctx, row) => {
            this.rows.delete(row.code);
            this.emitSnapshot();
          });

          void (async () => {
            try {
              await Promise.resolve(connection.subscriptionBuilder().subscribe([tables.room]));
              for (const row of connection.db.room.iter() as Iterable<RoomRow>) {
                this.rows.set(row.code, {
                  code: row.code,
                  playerCount: row.playerCount,
                  active: row.active
                });
              }
              this.emitSnapshot();
              this.callbacks.onStateChange?.(true);
              this.startPingLoop(connection);
              finishResolve();
            } catch (error) {
              connection.disconnect();
              this.connection = null;
              finishReject(error);
            }
          })();
        })
        .onConnectError((_ctx, error) => {
          finishReject(error);
        })
        .onDisconnect((_ctx, error) => {
          if (this.connection) {
            this.connection = null;
          }
          this.stopPingLoop();
          if (this.stopped) {
            return;
          }
          if (error) {
            this.callbacks.onError?.(normalizeError(error));
          }
          this.scheduleReconnect();
        });

      try {
        builder.build();
      } catch (error) {
        finishReject(error);
      }
    });
  }
}

export const startLiveRoomDirectory = (
  callbacks: RoomDirectoryLiveCallbacks,
  preferredTarget?: BackendTarget
): RoomDirectoryLiveHandle => {
  const live = new LiveRoomDirectory(preferredTarget, callbacks);
  live.start();
  return {
    stop: () => live.stop()
  };
};
