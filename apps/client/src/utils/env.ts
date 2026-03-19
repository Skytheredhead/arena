const readEnv = (key: 'VITE_SPACETIMEDB_URI' | 'VITE_SPACETIMEDB_DATABASE'): string | undefined => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value : undefined;
};

const defaultHost =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname || 'localhost';
const defaultProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';

export const SPACETIMEDB_URI =
  readEnv('VITE_SPACETIMEDB_URI') ?? `${defaultProtocol}://${defaultHost}:3000`;

export const SPACETIMEDB_DATABASE =
  readEnv('VITE_SPACETIMEDB_DATABASE') ?? 'arena-fps-slice';
