import { ARENA_MAP } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import {
  rainDropCount,
  visualQualityProfile,
} from '../rendering/VisualQuality';

describe('visual quality profiles', () => {
  it('keeps rain legible without rendering every configured world drop', () => {
    expect(rainDropCount(ARENA_MAP, 'low')).toBe(700);
    expect(rainDropCount(ARENA_MAP, 'medium')).toBe(1_800);
    expect(rainDropCount(ARENA_MAP, 'high')).toBe(3_600);
  });

  it('increases detail monotonically while bounding expensive pixel density', () => {
    const low = visualQualityProfile('low');
    const medium = visualQualityProfile('medium');
    const high = visualQualityProfile('high');

    expect(low.maxPixelRatio).toBeLessThan(medium.maxPixelRatio);
    expect(medium.maxPixelRatio).toBeLessThan(high.maxPixelRatio);
    expect(high.maxPixelRatio).toBeLessThanOrEqual(1.4);
    expect(low.bloomStrength).toBe(0);
    expect(medium.bloomStrength).toBeLessThan(high.bloomStrength);
    expect(medium.rainOpacity).toBeLessThan(high.rainOpacity);
  });
});
