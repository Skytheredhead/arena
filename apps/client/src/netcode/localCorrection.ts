import type { Vec3 } from '@arena/shared';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface LocalCorrectionMetrics {
  pingMs: number | null;
  jitterMs: number | null;
  inputPipelineMs: number;
}

export const getLocalCorrectionNetworkPressure = ({
  pingMs,
  jitterMs,
  inputPipelineMs
}: LocalCorrectionMetrics): number => {
  const effectivePing = Math.max(0, (pingMs ?? 48) - 35);
  const effectiveJitter = Math.max(0, jitterMs ?? 0);
  const effectivePipeline = Math.max(0, inputPipelineMs);
  return clamp(
    (effectiveJitter * 1.35 + effectivePipeline * 1.1 + effectivePing * 0.4) / 140,
    0,
    1
  );
};

export const getLocalCorrectionDeadzoneMeters = (metrics: LocalCorrectionMetrics): number =>
  0.025 + getLocalCorrectionNetworkPressure(metrics) * 0.095;

export const getLocalCorrectionDecayRate = (metrics: LocalCorrectionMetrics): number =>
  14 - getLocalCorrectionNetworkPressure(metrics) * 8;

export const getMaxLocalCorrectionOffsetMeters = (metrics: LocalCorrectionMetrics): number =>
  0.65 + getLocalCorrectionNetworkPressure(metrics) * 0.55;

export const clampCorrectionOffset = (offset: Vec3, maxMagnitude: number): Vec3 => {
  const magnitude = Math.hypot(offset.x, offset.y, offset.z);
  if (magnitude === 0 || magnitude <= maxMagnitude) {
    return offset;
  }

  const scale = maxMagnitude / magnitude;
  return {
    x: offset.x * scale,
    y: offset.y * scale,
    z: offset.z * scale
  };
};
