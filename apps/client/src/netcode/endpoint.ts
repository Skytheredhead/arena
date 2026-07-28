export const LEGACY_ARENA_TOKEN_STORAGE_KEY = 'arena.spacetimedb.token.v2';
export const ARENA_TOKEN_STORAGE_PREFIX = 'arena.spacetimedb.token.v3';
export const DEFAULT_PRODUCTION_SPACETIME_URI =
  'https://arenaapi.skylarenns.com';
export const DEFAULT_ARENA_DATABASE = 'arena-fps-slice';

export interface EndpointResolutionOptions {
  configuredUri?: string;
  currentLocation?: Pick<Location, 'protocol' | 'hostname' | 'port'>;
  productionUri?: string;
  localPort?: number;
}

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const normalizeSpacetimeUri = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('SpacetimeDB endpoint is empty');
  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported SpacetimeDB endpoint scheme: ${url.protocol}`);
  }
  url.hash = '';
  url.search = '';
  return stripTrailingSlash(url.toString());
};

export const resolveSpacetimeUri = (
  options: EndpointResolutionOptions = {}
): string => {
  if (options.configuredUri?.trim()) {
    return normalizeSpacetimeUri(options.configuredUri);
  }

  const location = options.currentLocation;
  if (
    location &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ) {
    return `http://${location.hostname}:${options.localPort ?? 4789}`;
  }
  return normalizeSpacetimeUri(
    options.productionUri ?? DEFAULT_PRODUCTION_SPACETIME_URI
  );
};

const validToken = (value: string | null): value is string =>
  value != null && value.length >= 16 && value.length <= 16_384;

export interface IdentityTokenScope {
  endpointUri: string;
  database: string;
}

type IdentityTokenStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

const normalizeDatabase = (database: string): string => {
  const normalized = database.trim();
  if (!normalized || normalized.length > 255) {
    throw new Error('SpacetimeDB database name is invalid');
  }
  return normalized;
};

export const identityTokenStorageKey = (
  scope: IdentityTokenScope
): string => {
  const endpoint = normalizeSpacetimeUri(scope.endpointUri);
  const database = normalizeDatabase(scope.database);
  return `${ARENA_TOKEN_STORAGE_PREFIX}:${encodeURIComponent(endpoint)}:${encodeURIComponent(database)}`;
};

export const isTrustedProductionScope = (
  scope: IdentityTokenScope
): boolean =>
  normalizeSpacetimeUri(scope.endpointUri) ===
    normalizeSpacetimeUri(DEFAULT_PRODUCTION_SPACETIME_URI) &&
  normalizeDatabase(scope.database) === DEFAULT_ARENA_DATABASE;

export const loadIdentityToken = (
  storage: IdentityTokenStorage,
  scope: IdentityTokenScope
): string | undefined => {
  try {
    const storageKey = identityTokenStorageKey(scope);
    const scopedToken = storage.getItem(storageKey);
    if (validToken(scopedToken)) return scopedToken;

    // The only global-token migration allowed is the original production
    // Arena database. A user-entered backend can never receive that credential.
    if (!isTrustedProductionScope(scope)) return undefined;
    const legacyToken = storage.getItem(LEGACY_ARENA_TOKEN_STORAGE_KEY);
    if (!validToken(legacyToken)) return undefined;
    storage.setItem(storageKey, legacyToken);
    storage.removeItem(LEGACY_ARENA_TOKEN_STORAGE_KEY);
    return legacyToken;
  } catch {
    return undefined;
  }
};

export const saveIdentityToken = (
  storage: IdentityTokenStorage,
  scope: IdentityTokenScope,
  token: string | undefined
): boolean => {
  try {
    const storageKey = identityTokenStorageKey(scope);
    if (validToken(token ?? null)) {
      storage.setItem(storageKey, token as string);
    } else {
      storage.removeItem(storageKey);
    }
    if (isTrustedProductionScope(scope)) {
      storage.removeItem(LEGACY_ARENA_TOKEN_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
};

export interface ReconnectBackoffOptions {
  baseMs?: number;
  maxMs?: number;
  jitter?: number;
  random?: () => number;
}

export class ReconnectBackoff {
  readonly #baseMs: number;
  readonly #maxMs: number;
  readonly #jitter: number;
  readonly #random: () => number;
  #attempt = 0;

  constructor(options: ReconnectBackoffOptions = {}) {
    this.#baseMs = Math.max(50, options.baseMs ?? 300);
    this.#maxMs = Math.max(this.#baseMs, options.maxMs ?? 8_000);
    this.#jitter = Math.max(0, Math.min(0.75, options.jitter ?? 0.2));
    this.#random = options.random ?? Math.random;
  }

  nextDelay(): number {
    const exponential = Math.min(
      this.#maxMs,
      this.#baseMs * 2 ** this.#attempt
    );
    this.#attempt += 1;
    const multiplier = 1 + (this.#random() * 2 - 1) * this.#jitter;
    return Math.max(0, Math.round(exponential * multiplier));
  }

  reset(): void {
    this.#attempt = 0;
  }

  get attempt(): number {
    return this.#attempt;
  }
}
