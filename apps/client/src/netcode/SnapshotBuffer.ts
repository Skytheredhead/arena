import type { AuthoritativePlayerSnapshot, Vector3Like } from './contracts';
import { unwrapUint32Near } from './serial';

interface BufferedSnapshot {
  snapshot: AuthoritativePlayerSnapshot;
  unwrappedTick: number;
}

export interface SnapshotSample extends AuthoritativePlayerSnapshot {
  interpolated: boolean;
  extrapolated: boolean;
}

export interface SnapshotBufferOptions {
  maxSnapshots?: number;
  maxExtrapolationTicks?: number;
  teleportDistance?: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpVector = (
  a: Vector3Like,
  b: Vector3Like,
  t: number
): Vector3Like => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});

const distanceSquared = (a: Vector3Like, b: Vector3Like): number => {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
};

const lerpAngle = (a: number, b: number, t: number): number => {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
};

export class SnapshotBuffer {
  readonly #maxSnapshots: number;
  readonly #maxExtrapolationTicks: number;
  readonly #teleportDistanceSquared: number;
  readonly #snapshots: BufferedSnapshot[] = [];

  constructor(options: SnapshotBufferOptions = {}) {
    this.#maxSnapshots = Math.max(3, options.maxSnapshots ?? 48);
    this.#maxExtrapolationTicks = Math.max(
      0,
      options.maxExtrapolationTicks ?? 6
    );
    const teleportDistance = Math.max(0.1, options.teleportDistance ?? 7);
    this.#teleportDistanceSquared = teleportDistance * teleportDistance;
  }

  push(snapshot: AuthoritativePlayerSnapshot): void {
    const tick = snapshot.serverTick >>> 0;
    const latest = this.#snapshots.at(-1);
    const unwrappedTick = latest
      ? unwrapUint32Near(tick, latest.snapshot.serverTick, latest.unwrappedTick)
      : tick;

    const existingIndex = this.#snapshots.findIndex(
      (item) => item.unwrappedTick === unwrappedTick
    );
    if (existingIndex >= 0) {
      this.#snapshots[existingIndex] = { snapshot, unwrappedTick };
    } else {
      this.#snapshots.push({ snapshot, unwrappedTick });
      this.#snapshots.sort((a, b) => a.unwrappedTick - b.unwrappedTick);
    }

    if (this.#snapshots.length > this.#maxSnapshots) {
      this.#snapshots.splice(0, this.#snapshots.length - this.#maxSnapshots);
    }
  }

  sample(renderTick: number): SnapshotSample | null {
    if (this.#snapshots.length === 0) return null;
    const first = this.#snapshots[0];
    const latest = this.#snapshots.at(-1);
    if (!first || !latest) return null;

    if (renderTick <= first.unwrappedTick) {
      return {
        ...first.snapshot,
        interpolated: false,
        extrapolated: false,
      };
    }

    for (let index = 1; index < this.#snapshots.length; index += 1) {
      const right = this.#snapshots[index];
      const left = this.#snapshots[index - 1];
      if (!left || !right || renderTick > right.unwrappedTick) continue;

      const tickSpan = Math.max(1, right.unwrappedTick - left.unwrappedTick);
      const alpha = Math.max(
        0,
        Math.min(1, (renderTick - left.unwrappedTick) / tickSpan)
      );
      const teleported =
        left.snapshot.lifeId !== right.snapshot.lifeId ||
        distanceSquared(left.snapshot.position, right.snapshot.position) >
          this.#teleportDistanceSquared;
      if (teleported) {
        return {
          ...right.snapshot,
          interpolated: false,
          extrapolated: false,
        };
      }

      return {
        ...right.snapshot,
        position: lerpVector(
          left.snapshot.position,
          right.snapshot.position,
          alpha
        ),
        velocity: lerpVector(
          left.snapshot.velocity,
          right.snapshot.velocity,
          alpha
        ),
        yaw: lerpAngle(left.snapshot.yaw, right.snapshot.yaw, alpha),
        pitch: lerp(left.snapshot.pitch, right.snapshot.pitch, alpha),
        interpolated: true,
        extrapolated: false,
      };
    }

    const extraTicks = Math.min(
      this.#maxExtrapolationTicks,
      Math.max(0, renderTick - latest.unwrappedTick)
    );
    if (extraTicks <= 0) {
      return {
        ...latest.snapshot,
        interpolated: false,
        extrapolated: false,
      };
    }
    const seconds = extraTicks / 60;
    return {
      ...latest.snapshot,
      position: {
        x: latest.snapshot.position.x + latest.snapshot.velocity.x * seconds,
        y: latest.snapshot.position.y + latest.snapshot.velocity.y * seconds,
        z: latest.snapshot.position.z + latest.snapshot.velocity.z * seconds,
      },
      interpolated: false,
      extrapolated: true,
    };
  }

  get latestTick(): number | null {
    return this.#snapshots.at(-1)?.unwrappedTick ?? null;
  }

  clear(): void {
    this.#snapshots.length = 0;
  }
}

export class SnapshotBufferSet {
  readonly #buffers = new Map<string, SnapshotBuffer>();
  readonly #options: SnapshotBufferOptions;

  constructor(options: SnapshotBufferOptions = {}) {
    this.#options = options;
  }

  push(snapshot: AuthoritativePlayerSnapshot): void {
    let buffer = this.#buffers.get(snapshot.id);
    if (!buffer) {
      buffer = new SnapshotBuffer(this.#options);
      this.#buffers.set(snapshot.id, buffer);
    }
    buffer.push(snapshot);
  }

  sampleAll(renderTick: number): Map<string, SnapshotSample> {
    const result = new Map<string, SnapshotSample>();
    for (const [id, buffer] of this.#buffers) {
      const sample = buffer.sample(renderTick);
      if (sample) result.set(id, sample);
    }
    return result;
  }

  remove(id: string): void {
    this.#buffers.delete(id);
  }

  clear(): void {
    this.#buffers.clear();
  }
}
