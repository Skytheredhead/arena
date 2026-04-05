import { describe, expect, it } from 'vitest';
import { getLatencyTailMs, percentile } from '../netcode/pingStats';

describe('pingStats', () => {
  it('computes percentiles from sorted sample positions', () => {
    expect(percentile([12, 18, 40, 28, 22], 0.5)).toBe(22);
    expect(percentile([12, 18, 40, 28, 22], 0.95)).toBe(28);
  });

  it('uses a stable tail percentile instead of a single worst spike', () => {
    const samples = [22, 24, 21, 23, 24, 25, 26, 200];
    expect(getLatencyTailMs(samples, 24, 0.95)).toBe(26);
  });
});
