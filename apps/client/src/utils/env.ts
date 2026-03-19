const readEnv = (
  key:
    | 'VITE_SPACETIMEDB_URI'
    | 'VITE_SPACETIMEDB_DATABASE'
    | 'VITE_SPACETIMEDB_REMOTE_URI'
    | 'VITE_SPACETIMEDB_LOCAL_URI'
): string | undefined => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value : undefined;
};

const defaultSocketProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';

const configuredUri = readEnv('VITE_SPACETIMEDB_URI');
export const SPACETIMEDB_REMOTE_URI =
  readEnv('VITE_SPACETIMEDB_REMOTE_URI') ??
  configuredUri ??
  'wss://arenaapi.skylarenns.com';
export const SPACETIMEDB_LOCAL_URI =
  readEnv('VITE_SPACETIMEDB_LOCAL_URI') ?? `${defaultSocketProtocol}://localhost:4789`;

export const SPACETIMEDB_DATABASE =
  readEnv('VITE_SPACETIMEDB_DATABASE') ?? 'arena-fps-slice';

export const getSpacetimeUriCandidates = (forceLocalBackend: boolean): string[] => {
  const ordered = forceLocalBackend ? [SPACETIMEDB_LOCAL_URI] : [SPACETIMEDB_REMOTE_URI];
  return Array.from(new Set(ordered));
};
