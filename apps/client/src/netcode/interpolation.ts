import {
  MAX_HEALTH,
  MAX_REMOTE_EXTRAPOLATION_MS,
  MAX_REMOTE_BUFFER_MS,
  type RemotePlayerState
} from '@arena/shared';

export type RemoteInterpolationSampleMode =
  | 'interpolated'
  | 'extrapolated'
  | 'single-sample';

export interface SnapshotSampleResult {
  state: RemotePlayerState;
  mode: RemoteInterpolationSampleMode;
  underrunMs: number;
  bufferDepthMs: number;
}

export interface RemoteInterpolationDelayMetrics {
  pingMs: number | null;
  jitterMs: number | null;
  serverPipelineMs: number | null;
  remoteBufferPressure: number;
  reconnecting: boolean;
}

export interface RemoteBufferPressureMetrics {
  previousPressure: number;
  maxUnderrunMs: number;
  deltaSeconds: number;
  fullPressureUnderrunMs: number;
  decayPerSecond: number;
}

export const MIN_REMOTE_INTERPOLATION_DELAY_MS = 70;
export const BASE_REMOTE_INTERPOLATION_DELAY_MS = 90;
export const MAX_REMOTE_INTERPOLATION_DELAY_MS = 220;

interface BufferedSnapshot {
  state: RemotePlayerState;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha;

const lerpAngle = (start: number, end: number, alpha: number): number => {
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return start + delta * alpha;
};

export class SnapshotBuffer {
  private readonly samples: BufferedSnapshot[] = [];
  private lastPushAtMs = 0;

  size(): number {
    return this.samples.length;
  }

  lastPushAtMsValue(): number {
    return this.lastPushAtMs;
  }

  push(state: RemotePlayerState): void {
    this.lastPushAtMs = performance.now();
    const last = this.samples.at(-1);
    if (last && state.serverTimeMs < last.state.serverTimeMs) {
      return;
    }
    if (last && state.serverTimeMs === last.state.serverTimeMs) {
      if (!last.state.alive && state.alive) {
        const speedSq =
          state.velocity.x * state.velocity.x +
          state.velocity.y * state.velocity.y +
          state.velocity.z * state.velocity.z;
        const likelyRespawn = state.health >= MAX_HEALTH && speedSq <= 0.04;
        if (!likelyRespawn) {
          return;
        }
      }
      this.samples[this.samples.length - 1] = { state };
      return;
    }

    this.samples.push({ state });
    const threshold = state.serverTimeMs - MAX_REMOTE_BUFFER_MS;
    while (this.samples.length > 2 && this.samples[0]!.state.serverTimeMs < threshold) {
      this.samples.shift();
    }
  }

  sample(renderServerTimeMs: number): RemotePlayerState | null {
    return this.sampleWithMeta(renderServerTimeMs)?.state ?? null;
  }

  sampleWithMeta(renderServerTimeMs: number): SnapshotSampleResult | null {
    if (this.samples.length === 0) {
      return null;
    }

    while (
      this.samples.length >= 2 &&
      this.samples[1]!.state.serverTimeMs <= renderServerTimeMs
    ) {
      this.samples.shift();
    }

    if (this.samples.length === 1) {
      const only = this.samples[0]!.state;
      const underrunMs = Math.max(0, renderServerTimeMs - only.serverTimeMs);
      return {
        state: extrapolateState(only, renderServerTimeMs),
        mode: underrunMs > 0 ? 'extrapolated' : 'single-sample',
        underrunMs,
        bufferDepthMs: Math.max(0, only.serverTimeMs - renderServerTimeMs)
      };
    }

    const [from, to] = this.samples;
    if (!from || !to) {
      return null;
    }

    const alpha = clamp(
      (renderServerTimeMs - from.state.serverTimeMs) /
        (to.state.serverTimeMs - from.state.serverTimeMs || 1),
      0,
      1
    );
    const newestServerTimeMs = this.samples.at(-1)!.state.serverTimeMs;
    const underrunMs = Math.max(0, renderServerTimeMs - newestServerTimeMs);
    const withinRange =
      renderServerTimeMs >= from.state.serverTimeMs &&
      renderServerTimeMs <= to.state.serverTimeMs;

    return {
      state: {
        ...to.state,
        position: {
          x: lerp(from.state.position.x, to.state.position.x, alpha),
          y: lerp(from.state.position.y, to.state.position.y, alpha),
          z: lerp(from.state.position.z, to.state.position.z, alpha)
        },
        velocity: {
          x: lerp(from.state.velocity.x, to.state.velocity.x, alpha),
          y: lerp(from.state.velocity.y, to.state.velocity.y, alpha),
          z: lerp(from.state.velocity.z, to.state.velocity.z, alpha)
        },
        yaw: lerpAngle(from.state.yaw, to.state.yaw, alpha),
        pitch: lerp(from.state.pitch, to.state.pitch, alpha)
      },
      mode: withinRange ? 'interpolated' : 'single-sample',
      underrunMs,
      bufferDepthMs: Math.max(0, newestServerTimeMs - renderServerTimeMs)
    };
  }
}

const extrapolateState = (
  state: RemotePlayerState,
  renderServerTimeMs: number
): RemotePlayerState => {
  const deltaMs = Math.max(
    0,
    Math.min(MAX_REMOTE_EXTRAPOLATION_MS, renderServerTimeMs - state.serverTimeMs)
  );
  const deltaSeconds = deltaMs / 1000;

  return {
    ...state,
    position: {
      x: state.position.x + state.velocity.x * deltaSeconds,
      y: state.position.y + state.velocity.y * deltaSeconds,
      z: state.position.z + state.velocity.z * deltaSeconds
    },
    serverTimeMs: state.serverTimeMs + deltaMs
  };
};

export const getAdaptiveRemoteInterpolationDelayMs = ({
  pingMs,
  jitterMs,
  serverPipelineMs,
  remoteBufferPressure,
  reconnecting
}: RemoteInterpolationDelayMetrics): number => {
  const effectivePingMs = Math.max(0, (pingMs ?? 48) - 60);
  const effectiveJitterMs = Math.max(0, jitterMs ?? 0);
  const effectivePipelineMs = Math.max(0, serverPipelineMs ?? 0);
  const pressure = clamp(remoteBufferPressure, 0, 1);
  const reconnectPenaltyMs = reconnecting ? 20 : 0;

  return clamp(
    BASE_REMOTE_INTERPOLATION_DELAY_MS +
      effectivePingMs * 0.12 +
      effectiveJitterMs * 1.8 +
      effectivePipelineMs * 0.22 +
      pressure * 95 +
      reconnectPenaltyMs,
    MIN_REMOTE_INTERPOLATION_DELAY_MS,
    MAX_REMOTE_INTERPOLATION_DELAY_MS
  );
};

export const updateRemoteBufferPressure = ({
  previousPressure,
  maxUnderrunMs,
  deltaSeconds,
  fullPressureUnderrunMs,
  decayPerSecond
}: RemoteBufferPressureMetrics): number => {
  if (maxUnderrunMs > 0) {
    return Math.max(
      clamp(previousPressure, 0, 1),
      clamp(maxUnderrunMs / fullPressureUnderrunMs, 0, 1)
    );
  }

  return clamp(previousPressure - deltaSeconds * decayPerSecond, 0, 1);
};
