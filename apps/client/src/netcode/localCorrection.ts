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
  0.08 + getLocalCorrectionNetworkPressure(metrics) * 0.18;

export const getLocalCorrectionDecayRate = (metrics: LocalCorrectionMetrics): number =>
  10 - getLocalCorrectionNetworkPressure(metrics) * 6;

export const getMaxLocalCorrectionOffsetMeters = (metrics: LocalCorrectionMetrics): number =>
  0.45 + getLocalCorrectionNetworkPressure(metrics) * 1;

export const getLocalCorrectionHardSnapDistanceMeters = (
  metrics: LocalCorrectionMetrics
): number => 2.4 + getLocalCorrectionNetworkPressure(metrics) * 4.8;

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
