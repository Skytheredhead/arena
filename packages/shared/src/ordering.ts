export const UINT32_MAX = 0xffff_ffff;
export const UINT32_HALF_RANGE = 0x8000_0000;

export const toUint32 = (value: number): number =>
  Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;

export const nextUint32 = (value: number): number =>
  (toUint32(value) + 1) >>> 0;

export const addUint32 = (value: number, amount: number): number =>
  (toUint32(value) + toUint32(amount)) >>> 0;

export const subtractUint32 = (value: number, amount: number): number =>
  (toUint32(value) - toUint32(amount)) >>> 0;

export const forwardDistanceUint32 = (
  newer: number,
  older: number
): number => (toUint32(newer) - toUint32(older)) >>> 0;

export const isNewerUint32 = (candidate: number, reference: number): boolean => {
  const distance = forwardDistanceUint32(candidate, reference);
  return distance !== 0 && distance < UINT32_HALF_RANGE;
};

export const isOlderUint32 = (candidate: number, reference: number): boolean =>
  isNewerUint32(reference, candidate);

export const isAtOrAfterUint32 = (
  candidate: number,
  reference: number
): boolean =>
  toUint32(candidate) === toUint32(reference) ||
  isNewerUint32(candidate, reference);

export const compareUint32 = (left: number, right: number): -1 | 0 | 1 => {
  const normalizedLeft = toUint32(left);
  const normalizedRight = toUint32(right);
  if (normalizedLeft === normalizedRight) return 0;
  return isNewerUint32(normalizedLeft, normalizedRight) ? 1 : -1;
};

export const elapsedUint32 = (now: number, then: number): number => {
  const distance = forwardDistanceUint32(now, then);
  return distance < UINT32_HALF_RANGE ? distance : 0;
};
