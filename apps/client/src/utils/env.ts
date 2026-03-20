const readEnv = (
  key:
    | 'VITE_SPACETIMEDB_URI'
    | 'VITE_SPACETIMEDB_DATABASE'
    | 'VITE_SPACETIMEDB_REMOTE_URI'
): string | undefined => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value : undefined;
};

export type BackendTarget = 'current' | 'arenaapi2';

const BACKEND_TARGET_STORAGE_KEY = 'arena-backend-target';
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

export const getBackendTarget = (): BackendTarget => {
  if (typeof window === 'undefined') return 'current';
  try {
    const stored = window.localStorage.getItem(BACKEND_TARGET_STORAGE_KEY);
    return stored === 'arenaapi2' ? 'arenaapi2' : 'current';
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
  target === 'arenaapi2' ? ARENAAPI2_URI : SPACETIMEDB_REMOTE_URI;

export const getBackendTargetLabel = (target: BackendTarget): string =>
  target === 'arenaapi2' ? ARENAAPI2_HOST : 'Current';

export const getSpacetimeUriCandidates = (): string[] => {
  const selected = getSpacetimeUriForTarget(getBackendTarget());
  // Safety fallback: if selected endpoint is down/misconfigured, retry the default backend.
  if (selected === SPACETIMEDB_REMOTE_URI) {
    return [selected];
  }
  return Array.from(new Set([selected, SPACETIMEDB_REMOTE_URI]));
};
