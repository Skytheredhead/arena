import { type Infer } from 'spacetimedb';
import {
  DbConnection,
  tables
} from '../generated/module_bindings';
import AccountStatsTable from '../generated/module_bindings/account_stats_table';
import PlayerAuthTable from '../generated/module_bindings/player_auth_table';
import { SPACETIMEDB_DATABASE, getSpacetimeUriCandidates } from '../utils/env';
import { identityToString } from '../utils/identity';

type PlayerAuthRow = Infer<typeof PlayerAuthTable>;
type AccountStatsRow = Infer<typeof AccountStatsTable>;

const AUTH_SESSION_COOKIE = 'arena_auth_session';
const AUTH_DB_TOKEN_COOKIE = 'arena_auth_db_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface AccountStatsView {
  accountId: number;
  username: string;
  timesPlayed: number;
  totalPlayTimeTicks: number;
  totalLobbyTimeTicks: number;
  kills: number;
  deaths: number;
  kdr: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  ammoCollected: number;
  healthCollected: number;
  chatMessages: number;
  roomsCreated: number;
  roomsJoined: number;
  matchesStarted: number;
  respawns: number;
  lastSeenTick: number;
}

export interface AuthSnapshot {
  connected: boolean;
  identity: string | null;
  loggedIn: boolean;
  username: string | null;
  accountId: number | null;
  sessionToken: string | null;
  stats: AccountStatsView | null;
}

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const pairs = document.cookie.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
};

const writeCookie = (name: string, value: string): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; samesite=lax`;
};

const clearCookie = (name: string): void => {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
};

export const readAuthSessionToken = (): string | null => readCookie(AUTH_SESSION_COOKIE);

const readDbToken = (): string | null => readCookie(AUTH_DB_TOKEN_COOKIE);

const storeTokens = (dbToken: string | null, sessionToken: string | null): void => {
  if (dbToken) {
    writeCookie(AUTH_DB_TOKEN_COOKIE, dbToken);
  }
  if (sessionToken) {
    writeCookie(AUTH_SESSION_COOKIE, sessionToken);
  }
};

const clearStoredTokens = (): void => {
  clearCookie(AUTH_DB_TOKEN_COOKIE);
  clearCookie(AUTH_SESSION_COOKIE);
};

const rowIdentityEquals = (
  rowIdentity: PlayerAuthRow['identity'],
  identity: string
): boolean => identityToString(rowIdentity) === identity;

const statsFromRow = (row: AccountStatsRow): AccountStatsView => ({
  accountId: toSafeNumber(row.accountId),
  username: row.username,
  timesPlayed: toSafeNumber(row.timesPlayed),
  totalPlayTimeTicks: toSafeNumber(row.totalPlayTimeTicks),
  totalLobbyTimeTicks: toSafeNumber(row.totalLobbyTimeTicks),
  kills: toSafeNumber(row.kills),
  deaths: toSafeNumber(row.deaths),
  kdr: Number(row.kdr),
  shotsFired: toSafeNumber(row.shotsFired),
  shotsHit: toSafeNumber(row.shotsHit),
  damageDealt: toSafeNumber(row.damageDealt),
  damageTaken: toSafeNumber(row.damageTaken),
  ammoCollected: toSafeNumber(row.ammoCollected),
  healthCollected: toSafeNumber(row.healthCollected),
  chatMessages: toSafeNumber(row.chatMessages),
  roomsCreated: toSafeNumber(row.roomsCreated),
  roomsJoined: toSafeNumber(row.roomsJoined),
  matchesStarted: toSafeNumber(row.matchesStarted),
  respawns: toSafeNumber(row.respawns),
  lastSeenTick: toSafeNumber(row.lastSeenTick)
});

const extractSnapshot = (
  connection: DbConnection,
  identity: string,
  dbToken: string
): AuthSnapshot => {
  const authRow = Array.from(connection.db.player_auth.iter() as Iterable<PlayerAuthRow>).find(row =>
    rowIdentityEquals(row.identity, identity)
  );

  if (!authRow || !authRow.loggedIn || authRow.accountId == null) {
    return {
      connected: true,
      identity,
      loggedIn: false,
      username: null,
      accountId: null,
      sessionToken: null,
      stats: null
    };
  }

  const accountId = toSafeNumber(authRow.accountId);
  const statsRow = Array.from(connection.db.account_stats.iter() as Iterable<AccountStatsRow>).find(
    row => toSafeNumber(row.accountId) === accountId
  );

  const sessionToken = authRow.sessionToken ?? null;
  storeTokens(dbToken, sessionToken);

  return {
    connected: true,
    identity,
    loggedIn: true,
    username: authRow.username ?? null,
    accountId,
    sessionToken,
    stats: statsRow ? statsFromRow(statsRow) : null
  };
};

const withConnection = async <T>(
  run: (connection: DbConnection, identity: string, dbToken: string) => Promise<T>,
  preferredDbToken?: string | null
): Promise<T> => {
  const endpoints = getSpacetimeUriCandidates();
  let lastError: Error | null = null;

  for (const uri of endpoints) {
    const attemptTokens = [preferredDbToken ?? readDbToken(), null] as const;
    for (const token of attemptTokens) {
      try {
        return await new Promise<T>((resolve, reject) => {
          let settled = false;
          let connection: DbConnection | null = null;

          const finish = (result?: T, error?: unknown): void => {
            if (settled) {
              return;
            }
            settled = true;
            if (connection) {
              connection.disconnect();
              connection = null;
            }
            if (error) {
              reject(normalizeError(error));
              return;
            }
            resolve(result as T);
          };

          try {
            DbConnection.builder()
              .withUri(uri)
              .withDatabaseName(SPACETIMEDB_DATABASE)
              .withToken(token ?? undefined)
              .onConnect((connected, identityValue, issuedDbToken) => {
                connection = connected;
                const identity = identityToString(identityValue);
                void (async () => {
                  try {
                    await Promise.resolve(
                      connected
                        .subscriptionBuilder()
                        .subscribe([tables.player_auth, tables.account_stats])
                    );
                    const result = await run(connected, identity, issuedDbToken);
                    finish(result);
                  } catch (error) {
                    finish(undefined, error);
                  }
                })();
              })
              .onConnectError((_ctx, error) => {
                finish(undefined, error);
              })
              .onDisconnect((_ctx, error) => {
                if (!settled && error) {
                  finish(undefined, error);
                }
              })
              .build();
          } catch (error) {
            finish(undefined, error);
          }
        });
      } catch (error) {
        lastError = normalizeError(error);
      }
    }
  }

  throw lastError ?? new Error('Unable to reach backend');
};

export const fetchAuthSnapshot = async (): Promise<AuthSnapshot> => {
  const sessionToken = readAuthSessionToken();
  return await withConnection(async (connection, identity, dbToken) => {
    if (sessionToken) {
      await connection.reducers.loginWithSession({ sessionToken }).catch(() => undefined);
    }
    const snapshot = extractSnapshot(connection, identity, dbToken);
    if (!snapshot.loggedIn) {
      storeTokens(dbToken, null);
    }
    return snapshot;
  });
};

export const loginAccount = async (
  identifier: string,
  password: string
): Promise<AuthSnapshot> => {
  return await withConnection(async (connection, identity, dbToken) => {
    await connection.reducers.loginAccount({ identifier, password });
    return extractSnapshot(connection, identity, dbToken);
  });
};

export const registerAccount = async (
  email: string,
  username: string,
  password: string
): Promise<AuthSnapshot> => {
  return await withConnection(async (connection, identity, dbToken) => {
    await connection.reducers.registerAccount({ email, username, password });
    return extractSnapshot(connection, identity, dbToken);
  });
};

export const logoutAccount = async (): Promise<AuthSnapshot> => {
  return await withConnection(async (connection, identity, dbToken) => {
    await connection.reducers.logoutAccount({});
    const snapshot = extractSnapshot(connection, identity, dbToken);
    clearCookie(AUTH_SESSION_COOKIE);
    return {
      ...snapshot,
      loggedIn: false,
      username: null,
      accountId: null,
      sessionToken: null,
      stats: null
    };
  });
};

export const clearAuthCookies = (): void => {
  clearStoredTokens();
};
