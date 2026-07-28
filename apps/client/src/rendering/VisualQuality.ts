import type { ArenaMapDefinition } from '@arena/shared';
import type { QualityPreset } from '../netcode/contracts';

export interface VisualQualityProfile {
  maxPixelRatio: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  rainDropLimit: number;
  rainOpacity: number;
}

const VISUAL_QUALITY_PROFILES: Record<QualityPreset, VisualQualityProfile> = {
  low: {
    maxPixelRatio: 1,
    bloomStrength: 0,
    bloomRadius: 0.24,
    bloomThreshold: 0.94,
    rainDropLimit: 700,
    rainOpacity: 0.12,
  },
  medium: {
    maxPixelRatio: 1.15,
    bloomStrength: 0.24,
    bloomRadius: 0.3,
    bloomThreshold: 0.92,
    rainDropLimit: 1_800,
    rainOpacity: 0.16,
  },
  high: {
    maxPixelRatio: 1.4,
    bloomStrength: 0.4,
    bloomRadius: 0.42,
    bloomThreshold: 0.9,
    rainDropLimit: 3_600,
    rainOpacity: 0.19,
  },
};

export const visualQualityProfile = (
  quality: QualityPreset
): VisualQualityProfile => VISUAL_QUALITY_PROFILES[quality];

export const rainDropCount = (
  map: ArenaMapDefinition,
  quality: QualityPreset
): number => {
  const configured =
    quality === 'low'
      ? map.atmosphere.rain.dropsLow
      : quality === 'medium'
        ? map.atmosphere.rain.dropsMedium
        : map.atmosphere.rain.dropsHigh;
  return Math.max(
    0,
    Math.min(Math.floor(configured), visualQualityProfile(quality).rainDropLimit)
  );
};
