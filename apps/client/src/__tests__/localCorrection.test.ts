import { describe, expect, it } from 'vitest';
import {
  clampCorrectionOffset,
  getLocalCorrectionDeadzoneMeters,
  getLocalCorrectionDecayRate,
  getLocalCorrectionHardSnapDistanceMeters,
  getMaxLocalCorrectionOffsetMeters
} from '../netcode/localCorrection';

describe('localCorrection', () => {
  it('becomes more forgiving as jitter and server pipeline worsen', () => {
    const stable = {
      pingMs: 28,
      jitterMs: 3,
      inputPipelineMs: 0,
      pendingInputs: 1
    };
    const unstable = {
      pingMs: 96,
      jitterMs: 34,
      inputPipelineMs: 120,
      pendingInputs: 14
    };

    expect(getLocalCorrectionDeadzoneMeters(unstable)).toBeGreaterThan(
      getLocalCorrectionDeadzoneMeters(stable)
    );
    expect(getLocalCorrectionDecayRate(unstable)).toBeLessThan(
      getLocalCorrectionDecayRate(stable)
    );
    expect(getMaxLocalCorrectionOffsetMeters(unstable)).toBeGreaterThan(
      getMaxLocalCorrectionOffsetMeters(stable)
    );
    expect(getLocalCorrectionHardSnapDistanceMeters(unstable)).toBeGreaterThan(
      getLocalCorrectionHardSnapDistanceMeters(stable)
    );
  });

  it('caps visible correction offsets without changing direction', () => {
    const offset = clampCorrectionOffset({ x: 3, y: 0, z: 4 }, 2);
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(2, 6);
    expect(offset.x / offset.z).toBeCloseTo(3 / 4, 6);
  });
});
