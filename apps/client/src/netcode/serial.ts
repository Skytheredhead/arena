export const UINT32_MAX = 0xffff_ffff;
export const UINT32_HALF_RANGE = 0x8000_0000;

export const toUint32 = (value: number): number => value >>> 0;

export const nextUint32 = (value: number): number => (value + 1) >>> 0;

export const uint32Distance = (newer: number, older: number): number =>
  (newer - older) >>> 0;

/**
 * RFC-1982 style ordering for u32 sequence numbers.
 * Values exactly half a range apart are deliberately unordered.
 */
export const isNewerUint32 = (
  candidate: number,
  reference: number
): boolean => {
  const distance = uint32Distance(candidate, reference);
  return distance !== 0 && distance < UINT32_HALF_RANGE;
};

export const isNewerOrEqualUint32 = (
  candidate: number,
  reference: number
): boolean =>
  toUint32(candidate) === toUint32(reference) ||
  isNewerUint32(candidate, reference);

export const isAcknowledgedUint32 = (
  sequence: number,
  acknowledgement: number
): boolean =>
  toUint32(sequence) === toUint32(acknowledgement) ||
  isNewerUint32(acknowledgement, sequence);

/**
 * Projects a wrapped u32 tick near an already-unwrapped reference tick.
 */
export const unwrapUint32Near = (
  wrapped: number,
  referenceWrapped: number,
  referenceUnwrapped: number
): number => {
  const unsignedDelta = uint32Distance(wrapped, referenceWrapped);
  const signedDelta =
    unsignedDelta >= UINT32_HALF_RANGE
      ? unsignedDelta - (UINT32_MAX + 1)
      : unsignedDelta;
  return referenceUnwrapped + signedDelta;
};
