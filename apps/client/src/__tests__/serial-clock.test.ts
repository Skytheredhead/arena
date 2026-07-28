import { describe, expect, it } from 'vitest';
import { ClockSync } from '../netcode/ClockSync';
import {
  UINT32_HALF_RANGE,
  UINT32_MAX,
  isAcknowledgedUint32,
  isNewerUint32,
  nextUint32,
  unwrapUint32Near,
} from '../netcode/serial';

describe('u32 serial ordering', () => {
  it('orders and acknowledges values across rollover', () => {
    expect(nextUint32(UINT32_MAX)).toBe(0);
    expect(isNewerUint32(0, UINT32_MAX)).toBe(true);
    expect(isNewerUint32(UINT32_MAX, 0)).toBe(false);
    expect(isAcknowledgedUint32(UINT32_MAX, 0)).toBe(true);
    expect(isAcknowledgedUint32(0, UINT32_MAX)).toBe(false);
  });

  it('leaves the ambiguous half-range unordered', () => {
    expect(isNewerUint32(UINT32_HALF_RANGE, 0)).toBe(false);
    expect(isNewerUint32(0, UINT32_HALF_RANGE)).toBe(false);
  });

  it('unwraps ticks near the current epoch', () => {
    const referenceUnwrapped = UINT32_MAX - 1;
    expect(unwrapUint32Near(1, UINT32_MAX - 1, referenceUnwrapped)).toBe(
      UINT32_MAX + 2
    );
    expect(unwrapUint32Near(UINT32_MAX, 1, UINT32_MAX + 2)).toBe(
      UINT32_MAX
    );
  });
});

describe('ClockSync', () => {
  it('estimates offset, RTT, jitter, and a monotonic tick through rollover', () => {
    const clock = new ClockSync(60);
    clock.addSample({
      sentAtMs: 0,
      receivedAtMs: 100,
      serverUnixMicros: 10_000_000n,
      serverTick: UINT32_MAX - 1,
    });
    expect(clock.estimateServerUnixMs(100)).toBe(10_050);

    clock.addSample({
      sentAtMs: 110,
      receivedAtMs: 130,
      serverUnixMicros: 10_080_000n,
      serverTick: 1,
    });
    const estimate = clock.getEstimate(130);
    expect(estimate.serverTick).toBe(UINT32_MAX + 2);
    expect(estimate.lowMs).toBe(20);
    expect(estimate.pingMs).toBeGreaterThan(20);
    expect(estimate.pingMs).toBeLessThan(100);
    expect(estimate.jitterMs).toBeGreaterThan(0);
  });
});
