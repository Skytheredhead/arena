const PREFIXES = [
  'Ghost',
  'Nova',
  'Rogue',
  'Echo',
  'Vector',
  'Shadow',
  'Blitz',
  'Cipher',
  'Volt',
  'Reaper',
  'Viper',
  'Mako'
] as const;

const SUFFIXES = [
  'Wolf',
  'Hawk',
  'Raven',
  'Strike',
  'Pulse',
  'Frost',
  'Drift',
  'Scope',
  'Forge',
  'Rift',
  'Storm',
  'Flare'
] as const;

const randomInt = (maxExclusive: number): number => {
  if (maxExclusive <= 0) {
    return 0;
  }

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint32Array(1);
    cryptoApi.getRandomValues(bytes);
    return bytes[0]! % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
};

export const generateDefaultCallsign = (): string => {
  const prefix = PREFIXES[randomInt(PREFIXES.length)];
  const suffix = SUFFIXES[randomInt(SUFFIXES.length)];
  const numeric = (randomInt(900) + 100).toString();
  return `${prefix}${suffix}${numeric}`.slice(0, 16);
};
