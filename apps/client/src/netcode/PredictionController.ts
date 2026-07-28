import type {
  AuthoritativePlayerSnapshot,
  SubmitInputPacket,
  Vector3Like,
} from './contracts';
import {
  INPUT_BUTTON_JUMP,
  INPUT_BUTTON_SPRINT,
} from './contracts';
import { isAcknowledgedUint32 } from './serial';

export interface PredictedPlayerState {
  position: Vector3Like;
  velocity: Vector3Like;
  yaw: number;
  pitch: number;
  grounded: boolean;
  jumpHeld: boolean;
  lifeId: number;
}

export interface CollisionResult {
  position: Vector3Like;
  velocity?: Vector3Like;
  grounded: boolean;
}

export interface CollisionResolver {
  resolve(
    position: Readonly<Vector3Like>,
    velocity: Readonly<Vector3Like>,
    deltaSeconds: number
  ): CollisionResult;
}

export interface PredictionOptions {
  tickRate?: number;
  maxHistory?: number;
  walkSpeed?: number;
  sprintSpeed?: number;
  gravity?: number;
  jumpVelocity?: number;
  hardSnapDistance?: number;
  correctionHalfLifeMs?: number;
}

export interface ReconciliationResult {
  errorDistance: number;
  hardSnapped: boolean;
  replayedInputs: number;
}

interface PredictionRecord {
  packet: SubmitInputPacket;
  state: PredictedPlayerState;
}

const cloneVector = (vector: Readonly<Vector3Like>): Vector3Like => ({
  x: vector.x,
  y: vector.y,
  z: vector.z,
});

const cloneState = (state: Readonly<PredictedPlayerState>): PredictedPlayerState => ({
  position: cloneVector(state.position),
  velocity: cloneVector(state.velocity),
  yaw: state.yaw,
  pitch: state.pitch,
  grounded: state.grounded,
  jumpHeld: state.jumpHeld,
  lifeId: state.lifeId,
});

const distance = (a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const fallbackCollision: CollisionResolver = {
  resolve(position, velocity, deltaSeconds) {
    const next = {
      x: position.x + velocity.x * deltaSeconds,
      y: position.y + velocity.y * deltaSeconds,
      z: position.z + velocity.z * deltaSeconds,
    };
    if (next.y <= 0) {
      next.y = 0;
      return {
        position: next,
        velocity: { x: velocity.x, y: Math.max(0, velocity.y), z: velocity.z },
        grounded: true,
      };
    }
    return { position: next, velocity: cloneVector(velocity), grounded: false };
  },
};

export class PredictionController {
  readonly #tickRate: number;
  readonly #fixedDelta: number;
  readonly #maxHistory: number;
  readonly #walkSpeed: number;
  readonly #sprintSpeed: number;
  readonly #gravity: number;
  readonly #jumpVelocity: number;
  readonly #hardSnapDistance: number;
  readonly #correctionHalfLifeMs: number;
  readonly #collision: CollisionResolver;
  readonly #history: PredictionRecord[] = [];

  #state: PredictedPlayerState;
  #presentationOffset: Vector3Like = { x: 0, y: 0, z: 0 };

  constructor(
    initial: PredictedPlayerState,
    collision: CollisionResolver = fallbackCollision,
    options: PredictionOptions = {}
  ) {
    this.#tickRate = Math.max(1, options.tickRate ?? 60);
    this.#fixedDelta = 1 / this.#tickRate;
    this.#maxHistory = Math.max(8, options.maxHistory ?? 256);
    // These defaults intentionally mirror apps/server/src/simulation.rs.
    this.#walkSpeed = options.walkSpeed ?? 6.1;
    this.#sprintSpeed = options.sprintSpeed ?? 8;
    this.#gravity = options.gravity ?? 18.5;
    this.#jumpVelocity = options.jumpVelocity ?? 6.2;
    this.#hardSnapDistance = Math.max(0.1, options.hardSnapDistance ?? 2.2);
    this.#correctionHalfLifeMs = Math.max(
      1,
      options.correctionHalfLifeMs ?? 70
    );
    this.#collision = collision;
    this.#state = cloneState(initial);
  }

  predict(packet: SubmitInputPacket): PredictedPlayerState {
    this.#state = this.#simulate(this.#state, packet);
    this.#history.push({ packet, state: cloneState(this.#state) });
    if (this.#history.length > this.#maxHistory) {
      this.#history.splice(0, this.#history.length - this.#maxHistory);
    }
    return cloneState(this.#state);
  }

  reconcile(
    authoritative: AuthoritativePlayerSnapshot
  ): ReconciliationResult {
    const before = cloneState(this.#state);
    const base: PredictedPlayerState = {
      position: cloneVector(authoritative.position),
      velocity: cloneVector(authoritative.velocity),
      yaw: authoritative.yaw,
      pitch: authoritative.pitch,
      grounded:
        Math.abs(authoritative.velocity.y) < 0.01 &&
        authoritative.position.y >= -0.001,
      jumpHeld: false,
      lifeId: authoritative.lifeId,
    };

    const hardSnap =
      before.lifeId !== base.lifeId ||
      distance(before.position, base.position) >= this.#hardSnapDistance ||
      !authoritative.alive;

    const remaining = this.#history.filter(
      ({ packet }) =>
        !isAcknowledgedUint32(packet.seq, authoritative.ackInputSeq)
    );
    this.#history.length = 0;
    this.#state = base;
    for (const record of remaining) {
      this.#state = this.#simulate(this.#state, record.packet);
      this.#history.push({
        packet: record.packet,
        state: cloneState(this.#state),
      });
    }

    const errorDistance = distance(before.position, this.#state.position);
    if (hardSnap) {
      this.#presentationOffset = { x: 0, y: 0, z: 0 };
    } else {
      this.#presentationOffset.x += before.position.x - this.#state.position.x;
      this.#presentationOffset.y += before.position.y - this.#state.position.y;
      this.#presentationOffset.z += before.position.z - this.#state.position.z;
    }

    return {
      errorDistance,
      hardSnapped: hardSnap,
      replayedInputs: remaining.length,
    };
  }

  getSimulationState(): PredictedPlayerState {
    return cloneState(this.#state);
  }

  getPresentationState(deltaMs: number): PredictedPlayerState {
    const decay = 2 ** (-Math.max(0, deltaMs) / this.#correctionHalfLifeMs);
    this.#presentationOffset.x *= decay;
    this.#presentationOffset.y *= decay;
    this.#presentationOffset.z *= decay;
    const state = cloneState(this.#state);
    state.position.x += this.#presentationOffset.x;
    state.position.y += this.#presentationOffset.y;
    state.position.z += this.#presentationOffset.z;
    return state;
  }

  reset(state: PredictedPlayerState): void {
    this.#state = cloneState(state);
    this.#history.length = 0;
    this.#presentationOffset = { x: 0, y: 0, z: 0 };
  }

  get historyLength(): number {
    return this.#history.length;
  }

  #simulate(
    previous: Readonly<PredictedPlayerState>,
    packet: Readonly<SubmitInputPacket>
  ): PredictedPlayerState {
    const state = cloneState(previous);
    state.yaw = packet.yaw;
    state.pitch = packet.pitch;

    const inputLength = Math.hypot(packet.moveX, packet.moveZ);
    const normalizedX =
      inputLength > 1e-8 ? packet.moveX / inputLength : 0;
    const normalizedZ =
      inputLength > 1e-8 ? packet.moveZ / inputLength : 0;
    const sin = Math.sin(packet.yaw);
    const cos = Math.cos(packet.yaw);
    const worldX = normalizedX * cos + normalizedZ * sin;
    const worldZ = normalizedX * sin - normalizedZ * cos;
    const sprinting = (packet.buttons & INPUT_BUTTON_SPRINT) !== 0;
    const targetSpeed = sprinting ? this.#sprintSpeed : this.#walkSpeed;
    state.velocity.x = worldX * targetSpeed;
    state.velocity.z = worldZ * targetSpeed;

    const jumpHeld = (packet.buttons & INPUT_BUTTON_JUMP) !== 0;
    if (jumpHeld && state.grounded) {
      state.velocity.y = this.#jumpVelocity;
      state.grounded = false;
    } else {
      state.velocity.y -= this.#gravity * this.#fixedDelta;
    }
    state.jumpHeld = jumpHeld;

    const resolved = this.#collision.resolve(
      state.position,
      state.velocity,
      this.#fixedDelta
    );
    state.position = cloneVector(resolved.position);
    state.velocity = resolved.velocity
      ? cloneVector(resolved.velocity)
      : cloneVector(state.velocity);
    state.grounded = resolved.grounded;
    return state;
  }
}
