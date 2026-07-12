/**
 * Helpers for counters that cross the network as unsigned 32-bit integers.
 *
 * A plain `candidate > previous` comparison permanently rejects new values once
 * a sequence or server tick wraps. These helpers use serial-number arithmetic
 * (RFC 1982 style): values less than half the uint32 range ahead are newer.
 */
export const UINT32_HALF_RANGE = 0x80000000;

export const toUint32 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value) >>> 0;
};

export const nextUint32 = (value: number): number =>
  (toUint32(value) + 1) >>> 0;

export const uint32ForwardDistance = (from: number, to: number): number =>
  (toUint32(to) - toUint32(from)) >>> 0;

export const isUint32Newer = (candidate: number, previous: number): boolean => {
  const distance = uint32ForwardDistance(previous, candidate);
  return distance !== 0 && distance < UINT32_HALF_RANGE;
};

export const isUint32AtOrAfter = (candidate: number, target: number): boolean =>
  toUint32(candidate) === toUint32(target) || isUint32Newer(candidate, target);

export const uint32Elapsed = (
  earlier: number,
  later: number
): number | null => {
  const distance = uint32ForwardDistance(earlier, later);
  return distance < UINT32_HALF_RANGE ? distance : null;
};
