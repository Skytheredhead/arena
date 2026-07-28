import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARENA_DATABASE,
  DEFAULT_PRODUCTION_SPACETIME_URI,
  LEGACY_ARENA_TOKEN_STORAGE_KEY,
  ReconnectBackoff,
  identityTokenStorageKey,
  loadIdentityToken,
  normalizeSpacetimeUri,
  resolveSpacetimeUri,
  saveIdentityToken,
  type IdentityTokenScope,
} from '../netcode/endpoint';

const createStorage = (): {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  values: Map<string, string>;
} => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
  };
};

const productionScope: IdentityTokenScope = {
  endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
  database: DEFAULT_ARENA_DATABASE,
};

const customScope: IdentityTokenScope = {
  endpointUri: 'https://custom.example.test/spacetime',
  database: 'arena-fps-slice',
};

describe('SpacetimeDB endpoint resolution', () => {
  it('normalizes secure websocket endpoints and strips query material', () => {
    expect(
      normalizeSpacetimeUri(
        'wss://arenaapi.skylarenns.com/?credential=must-not-survive#fragment'
      )
    ).toBe(DEFAULT_PRODUCTION_SPACETIME_URI);
  });

  it('uses an explicit local endpoint only for local browser hosts', () => {
    expect(
      resolveSpacetimeUri({
        currentLocation: {
          protocol: 'http:',
          hostname: 'localhost',
          port: '5173',
        },
      })
    ).toBe('http://localhost:4789');
    expect(
      resolveSpacetimeUri({
        currentLocation: {
          protocol: 'https:',
          hostname: 'arena.skylarenns.com',
          port: '',
        },
      })
    ).toBe(DEFAULT_PRODUCTION_SPACETIME_URI);
  });
});

describe('endpoint-scoped identity tokens', () => {
  it('never exposes a production token to a custom endpoint', () => {
    const { storage } = createStorage();
    const productionToken = 'production-token-value-1234';
    expect(saveIdentityToken(storage, productionScope, productionToken)).toBe(
      true
    );
    expect(loadIdentityToken(storage, customScope)).toBeUndefined();

    const customToken = 'custom-endpoint-token-5678';
    expect(saveIdentityToken(storage, customScope, customToken)).toBe(true);
    expect(loadIdentityToken(storage, productionScope)).toBe(productionToken);
    expect(loadIdentityToken(storage, customScope)).toBe(customToken);
    expect(identityTokenStorageKey(productionScope)).not.toBe(
      identityTokenStorageKey(customScope)
    );
  });

  it('migrates the legacy global token only for exact production scope', () => {
    const { storage, values } = createStorage();
    const legacyToken = 'legacy-production-token-1234';
    values.set(LEGACY_ARENA_TOKEN_STORAGE_KEY, legacyToken);

    expect(loadIdentityToken(storage, customScope)).toBeUndefined();
    expect(values.get(LEGACY_ARENA_TOKEN_STORAGE_KEY)).toBe(legacyToken);
    expect(loadIdentityToken(storage, productionScope)).toBe(legacyToken);
    expect(values.has(LEGACY_ARENA_TOKEN_STORAGE_KEY)).toBe(false);
    expect(values.get(identityTokenStorageKey(productionScope))).toBe(
      legacyToken
    );
  });

  it('does not migrate a legacy token for a different production database', () => {
    const { storage, values } = createStorage();
    values.set(
      LEGACY_ARENA_TOKEN_STORAGE_KEY,
      'legacy-production-token-1234'
    );
    expect(
      loadIdentityToken(storage, {
        endpointUri: DEFAULT_PRODUCTION_SPACETIME_URI,
        database: 'another-database',
      })
    ).toBeUndefined();
    expect(values.has(LEGACY_ARENA_TOKEN_STORAGE_KEY)).toBe(true);
  });
});

describe('ReconnectBackoff', () => {
  it('backs off deterministically and caps the delay', () => {
    const backoff = new ReconnectBackoff({
      baseMs: 100,
      maxMs: 400,
      jitter: 0,
      random: () => 0.5,
    });
    expect([
      backoff.nextDelay(),
      backoff.nextDelay(),
      backoff.nextDelay(),
      backoff.nextDelay(),
    ]).toEqual([100, 200, 400, 400]);
    backoff.reset();
    expect(backoff.attempt).toBe(0);
    expect(backoff.nextDelay()).toBe(100);
  });
});
