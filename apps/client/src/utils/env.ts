const readEnv = (
  key:
    | 'VITE_SPACETIMEDB_URI'
    | 'VITE_SPACETIMEDB_DATABASE'
    | 'VITE_SPACETIMEDB_REMOTE_URI'
): string | undefined => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value : undefined;
};

const configuredUri = readEnv('VITE_SPACETIMEDB_URI');
export const SPACETIMEDB_REMOTE_URI =
  readEnv('VITE_SPACETIMEDB_REMOTE_URI') ??
  configuredUri ??
  'wss://arenaapi.skylarenns.com';

export const SPACETIMEDB_DATABASE =
  readEnv('VITE_SPACETIMEDB_DATABASE') ?? 'arena-fps-slice';

export const getSpacetimeUriCandidates = (): string[] =>
  Array.from(new Set([SPACETIMEDB_REMOTE_URI]));
