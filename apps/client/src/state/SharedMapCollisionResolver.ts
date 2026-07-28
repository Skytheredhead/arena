import {
  ARENA_MAP,
  boxToAabb,
  resolveHorizontalMovement,
  surfaceHeightAt,
  type ArenaMapDefinition,
  type Vec3,
} from '@arena/shared';
import type {
  CollisionResolver,
  CollisionResult,
} from '../netcode/PredictionController';
import type { Vector3Like } from '../netcode/contracts';

const toTuple = (value: Readonly<Vector3Like>): Vec3 => [
  value.x,
  value.y,
  value.z,
];

const toObject = (value: Vec3): Vector3Like => ({
  x: value[0],
  y: value[1],
  z: value[2],
});

/**
 * Client prediction collision adapter over the exact generated map contract.
 * Authoritative correction remains the final arbiter if browser and Wasm
 * floating-point behavior differ at an edge.
 */
export class SharedMapCollisionResolver implements CollisionResolver {
  readonly #map: ArenaMapDefinition;

  constructor(map: ArenaMapDefinition = ARENA_MAP) {
    this.#map = map;
  }

  resolve(
    position: Readonly<Vector3Like>,
    velocity: Readonly<Vector3Like>,
    deltaSeconds: number
  ): CollisionResult {
    const dt = Math.max(0, Math.min(0.05, deltaSeconds));
    const from = toTuple(position);
    const desired: Vec3 = [
      position.x + velocity.x * dt,
      position.y,
      position.z + velocity.z * dt,
    ];
    const horizontal = resolveHorizontalMovement(this.#map, from, desired);
    let velocityX =
      Math.abs(horizontal[0] - desired[0]) > 1e-6 ? 0 : velocity.x;
    let velocityZ =
      Math.abs(horizontal[2] - desired[2]) > 1e-6 ? 0 : velocity.z;
    let velocityY = velocity.y;
    let nextY = position.y + velocityY * dt;
    const ground = surfaceHeightAt(
      this.#map,
      horizontal[0],
      horizontal[2],
      Math.max(position.y, nextY) + this.#map.world.maxStepHeight
    );
    let grounded = false;
    if (velocityY <= 0 && nextY <= ground + 0.08) {
      nextY = ground;
      velocityY = 0;
      grounded = true;
    }

    if (velocityY > 0) {
      const head = nextY + this.#map.world.playerHeight;
      for (const box of this.#map.boxes) {
        if (!box.collision) continue;
        const bounds = boxToAabb(box);
        const radius = this.#map.world.playerRadius;
        if (
          horizontal[0] < bounds.min[0] - radius ||
          horizontal[0] > bounds.max[0] + radius ||
          horizontal[2] < bounds.min[2] - radius ||
          horizontal[2] > bounds.max[2] + radius
        ) {
          continue;
        }
        if (head > bounds.min[1] && position.y < bounds.min[1]) {
          nextY = Math.min(nextY, bounds.min[1] - this.#map.world.playerHeight);
          velocityY = 0;
        }
      }
    }

    if (nextY < this.#map.world.killY) {
      nextY = this.#map.world.killY;
      velocityX = 0;
      velocityY = 0;
      velocityZ = 0;
    }
    return {
      position: toObject([horizontal[0], nextY, horizontal[2]]),
      velocity: { x: velocityX, y: velocityY, z: velocityZ },
      grounded,
    };
  }
}
