import type { Vec3 } from '@arena/shared';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface LocalCorrectionMetrics {
  pingMs: number | null;
  jitterMs: number | null;
  inputPipelineMs: number;
  pendingInputs?: number | null;
}

export const getLocalCorrectionNetworkPressure = ({
  pingMs,
  jitterMs,
  inputPipelineMs,
  pendingInputs
}: LocalCorrectionMetrics): number => {
  const effectivePing = Math.max(0, (pingMs ?? 48) - 35);
  const effectiveJitter = Math.max(0, jitterMs ?? 0);
  const effectivePipeline = Math.max(0, inputPipelineMs);
  const effectivePendingInputs = Math.max(0, (pendingInputs ?? 0) - 2);
  return clamp(
    (
      effectiveJitter * 1.35 +
      effectivePipeline * 1.1 +
      effectivePing * 0.4 +
      effectivePendingInputs * 5
    ) / 180,
    0,
    1
  );
};

export const getLocalCorrectionDeadzoneMeters = (metrics: LocalCorrectionMetrics): number =>
  0.16 + getLocalCorrectionNetworkPressure(metrics) * 0.34;

export const getLocalCorrectionSmoothThresholdMeters = (
  metrics: LocalCorrectionMetrics
): number => Math.max(0.003, getLocalCorrectionDeadzoneMeters(metrics) * 0.02);

export const getLocalCorrectionDecayRate = (metrics: LocalCorrectionMetrics): number =>
  5.5 - getLocalCorrectionNetworkPressure(metrics) * 3.5;

export const getMaxLocalCorrectionOffsetMeters = (metrics: LocalCorrectionMetrics): number =>
  0.9 + getLocalCorrectionNetworkPressure(metrics) * 1.8;

export const getLocalCorrectionHardSnapDistanceMeters = (
  metrics: LocalCorrectionMetrics
): number => 4.2 + getLocalCorrectionNetworkPressure(metrics) * 7.8;

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
