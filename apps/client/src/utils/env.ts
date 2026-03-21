const readEnv = (
  key:
    | 'VITE_SPACETIMEDB_URI'
    | 'VITE_SPACETIMEDB_DATABASE'
    | 'VITE_SPACETIMEDB_REMOTE_URI'
): string | undefined => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value : undefined;
};

export type BackendTarget = 'current' | 'arenaapi2' | 'custom';

const BACKEND_TARGET_STORAGE_KEY = 'arena-backend-target';
const BACKEND_CUSTOM_HOST_STORAGE_KEY = 'arena-backend-custom-host';
const BACKEND_CUSTOM_PORT_STORAGE_KEY = 'arena-backend-custom-port';
const BACKEND_CUSTOM_SECURE_STORAGE_KEY = 'arena-backend-custom-secure';
const ARENAAPI2_HOST = 'arenaapi2.playit.plus';
const ARENAAPI2_URI = `wss://${ARENAAPI2_HOST}`;

const normalizeWsUri = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return ARENAAPI2_URI;
  if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) return trimmed;
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return `wss://${trimmed.replace(/^\/+/, '')}`;
};

const configuredUri = readEnv('VITE_SPACETIMEDB_URI');
export const SPACETIMEDB_REMOTE_URI =
  normalizeWsUri(
    readEnv('VITE_SPACETIMEDB_REMOTE_URI') ??
      configuredUri ??
      'wss://arenaapi.skylarenns.com'
  );

export const SPACETIMEDB_DATABASE =
  readEnv('VITE_SPACETIMEDB_DATABASE') ?? 'arena-fps-slice';

export interface CustomBackendSettings {
  host: string;
  port: string;
  secure: boolean;
}

const DEFAULT_CUSTOM_BACKEND_SETTINGS: CustomBackendSettings = {
  host: '127.0.0.1',
  port: '4789',
  secure: false
};

const normalizePort = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\d+$/.test(trimmed)) return '';
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return '';
  return String(parsed);
};

const formatHostForUri = (host: string): string => {
  // Bracket raw IPv6 literals so URL parsing and ws URI generation stay valid.
  if (host.includes(':') && !host.startsWith('[') && !host.endsWith(']')) {
    return `[${host}]`;
  }
  return host;
};

const normalizeHost = (value: string): string => {
  let host = value.trim();
  if (!host) return '';
  host = host.replace(/^(wss?:\/\/|https?:\/\/)/i, '');
  host = host.replace(/\/+$/, '');
  return host;
};

const buildCustomBackendUri = (settings: CustomBackendSettings): string | null => {
  const host = normalizeHost(settings.host);
  const port = normalizePort(settings.port);
  if (!host || !port) {
    return null;
  }
  const protocol = settings.secure ? 'wss' : 'ws';
  return `${protocol}://${formatHostForUri(host)}:${port}`;
};

export const getCustomBackendSettings = (): CustomBackendSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_CUSTOM_BACKEND_SETTINGS;
  }

  try {
    const host =
      window.localStorage.getItem(BACKEND_CUSTOM_HOST_STORAGE_KEY) ??
      DEFAULT_CUSTOM_BACKEND_SETTINGS.host;
    const port =
      window.localStorage.getItem(BACKEND_CUSTOM_PORT_STORAGE_KEY) ??
      DEFAULT_CUSTOM_BACKEND_SETTINGS.port;
    const secureRaw = window.localStorage.getItem(BACKEND_CUSTOM_SECURE_STORAGE_KEY);
    const secure =
      secureRaw == null
        ? DEFAULT_CUSTOM_BACKEND_SETTINGS.secure
        : secureRaw === 'true';

    return {
      host,
      port,
      secure
    };
  } catch {
    return DEFAULT_CUSTOM_BACKEND_SETTINGS;
  }
};

export const setCustomBackendSettings = (settings: CustomBackendSettings): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKEND_CUSTOM_HOST_STORAGE_KEY, settings.host);
    window.localStorage.setItem(BACKEND_CUSTOM_PORT_STORAGE_KEY, settings.port);
    window.localStorage.setItem(
      BACKEND_CUSTOM_SECURE_STORAGE_KEY,
      settings.secure ? 'true' : 'false'
    );
  } catch {
    // Ignore storage write failures (private mode/storage restrictions).
  }
};

export const getCustomBackendUri = (): string | null =>
  buildCustomBackendUri(getCustomBackendSettings());

export const getCustomBackendLabel = (): string => {
  const settings = getCustomBackendSettings();
  const host = normalizeHost(settings.host);
  const port = normalizePort(settings.port);
  if (!host || !port) {
    return 'Custom';
  }
  return `${host}:${port}`;
};

export const getBackendTarget = (): BackendTarget => {
  if (typeof window === 'undefined') return 'current';
  try {
    const stored = window.localStorage.getItem(BACKEND_TARGET_STORAGE_KEY);
    return stored === 'arenaapi2' || stored === 'custom' ? stored : 'current';
  } catch {
    return 'current';
  }
};

export const setBackendTarget = (target: BackendTarget): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKEND_TARGET_STORAGE_KEY, target);
  } catch {
    // Ignore storage write failures (private mode/storage restrictions).
  }
};

export const getSpacetimeUriForTarget = (target: BackendTarget): string =>
  target === 'arenaapi2'
    ? ARENAAPI2_URI
    : target === 'custom'
      ? getCustomBackendUri() ?? SPACETIMEDB_REMOTE_URI
      : SPACETIMEDB_REMOTE_URI;

export const getBackendTargetLabel = (target: BackendTarget): string =>
  target === 'arenaapi2'
    ? ARENAAPI2_HOST
    : target === 'custom'
      ? getCustomBackendLabel()
      : 'Current';

export const getSpacetimeUriCandidates = (): string[] => {
  const selected = getSpacetimeUriForTarget(getBackendTarget());
  // Safety fallback: if selected endpoint is down/misconfigured, retry the default backend.
  if (selected === SPACETIMEDB_REMOTE_URI) {
    return [selected];
  }
  return Array.from(new Set([selected, SPACETIMEDB_REMOTE_URI]));
};
