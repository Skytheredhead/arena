import {
  MAX_REMOTE_EXTRAPOLATION_MS,
  MAX_REMOTE_BUFFER_MS,
  type RemotePlayerState
} from '@arena/shared';

interface BufferedSnapshot {
  state: RemotePlayerState;
}

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

  size(): number {
    return this.samples.length;
  }

  push(state: RemotePlayerState): void {
    const last = this.samples.at(-1);
    if (last && state.serverTimeMs < last.state.serverTimeMs) {
      return;
    }
    if (last && state.serverTimeMs === last.state.serverTimeMs) {
      if (!last.state.alive && state.alive) {
        return;
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
      return extrapolateState(this.samples[0]!.state, renderServerTimeMs);
    }

    const [from, to] = this.samples;
    if (!from || !to) {
      return null;
    }

    const alpha = Math.max(
      0,
      Math.min(
        1,
        (renderServerTimeMs - from.state.serverTimeMs) /
          (to.state.serverTimeMs - from.state.serverTimeMs || 1)
      )
    );

    return {
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
