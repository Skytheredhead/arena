import { DbConnection, tables } from '../generated/module_bindings';
import RoomTable from '../generated/module_bindings/room_table';
import { SPACETIMEDB_DATABASE, getSpacetimeUriCandidates } from '../utils/env';
import type { Infer } from 'spacetimedb';

type RoomRow = Infer<typeof RoomTable>;

export interface RoomDirectoryEntry {
  code: string;
  playerCount: number;
  active: boolean;
}

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

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

export const fetchOpenRoomsSnapshot = async (): Promise<RoomDirectoryEntry[]> => {
  const endpointCandidates = getSpacetimeUriCandidates();
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
