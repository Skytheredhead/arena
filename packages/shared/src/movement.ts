import {
  ARENA_MAP,
  DEFAULT_PLAYER_COLLISION,
  resolveHorizontalMovement,
  surfaceHeightAt,
} from './map.js';
import type {
  ArenaMapDefinition,
  PlayerCollisionShape,
  Vec3,
} from './mapTypes.js';

export const MOVEMENT_TICK_RATE = 60;
export const FIXED_MOVEMENT_DT = 1 / MOVEMENT_TICK_RATE;

export interface MovementConfig {
  readonly moveSpeed: number;
  readonly groundAcceleration: number;
  readonly airAcceleration: number;
  readonly friction: number;
  readonly gravity: number;
  readonly jumpVelocity: number;
  readonly groundSnapDistance: number;
  readonly maximumDeltaSeconds: number;
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  moveSpeed: 7.2,
  groundAcceleration: 48,
  airAcceleration: 14,
  friction: 34,
  gravity: 24,
  jumpVelocity: 7.4,
  groundSnapDistance: 0.22,
  maximumDeltaSeconds: 1 / 20,
};

export interface MovementInput {
  readonly moveX: number;
  readonly moveZ: number;
  readonly yaw: number;
  readonly jumpHeld: boolean;
}

export interface MovementState {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
}

const finiteOr = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

const approachHorizontal = (
  currentX: number,
  currentZ: number,
  targetX: number,
  targetZ: number,
  maximumDelta: number
): readonly [number, number] => {
  const deltaX = targetX - currentX;
  const deltaZ = targetZ - currentZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= maximumDelta || distance <= 1e-8) {
    return [targetX, targetZ];
  }
  const scale = maximumDelta / distance;
  return [currentX + deltaX * scale, currentZ + deltaZ * scale];
};

const sanitizedMove = (input: MovementInput): readonly [number, number] => {
  let x = Math.max(-1, Math.min(1, finiteOr(input.moveX)));
  let z = Math.max(-1, Math.min(1, finiteOr(input.moveZ)));
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return [x, z];
};

const resolveCeiling = (
  map: ArenaMapDefinition,
  position: Vec3,
  shape: PlayerCollisionShape,
  upwardVelocity: number
): readonly [number, number] => {
  if (upwardVelocity <= 0) return [position[1], upwardVelocity];
  let y = position[1];
  let velocityY = upwardVelocity;
  const head = y + shape.height;
  for (const box of map.boxes) {
    if (!box.collision) continue;
    const halfX = box.size[0] / 2;
    const halfY = box.size[1] / 2;
    const halfZ = box.size[2] / 2;
    const minX = box.center[0] - halfX - shape.radius;
    const maxX = box.center[0] + halfX + shape.radius;
    const minZ = box.center[2] - halfZ - shape.radius;
    const maxZ = box.center[2] + halfZ + shape.radius;
    const bottom = box.center[1] - halfY;
    if (
      position[0] >= minX &&
      position[0] <= maxX &&
      position[2] >= minZ &&
      position[2] <= maxZ &&
      head > bottom &&
      y < bottom
    ) {
      y = Math.min(y, bottom - shape.height);
      velocityY = 0;
    }
  }
  return [y, velocityY];
};

export const simulateMovementStep = (
  original: MovementState,
  input: MovementInput,
  deltaSeconds = FIXED_MOVEMENT_DT,
  map: ArenaMapDefinition = ARENA_MAP,
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
  shape: PlayerCollisionShape = DEFAULT_PLAYER_COLLISION
): MovementState => {
  const dt = Math.max(
    0,
    Math.min(config.maximumDeltaSeconds, finiteOr(deltaSeconds))
  );
  if (dt === 0) return original;

  const [moveX, moveZ] = sanitizedMove(input);
  const yaw = finiteOr(input.yaw);
  const forwardX = Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  const worldX = rightX * moveX + forwardX * moveZ;
  const worldZ = rightZ * moveX + forwardZ * moveZ;
  const moving = Math.hypot(worldX, worldZ) > 1e-5;
  const acceleration = original.grounded
    ? config.groundAcceleration
    : config.airAcceleration;
  const targetX = worldX * config.moveSpeed;
  const targetZ = worldZ * config.moveSpeed;
  const deceleration =
    original.grounded && !moving ? config.friction : acceleration;
  let [velocityX, velocityZ] = approachHorizontal(
    finiteOr(original.velocity[0]),
    finiteOr(original.velocity[2]),
    targetX,
    targetZ,
    deceleration * dt
  );
  let velocityY = finiteOr(original.velocity[1]);
  let grounded = original.grounded;

  if (grounded && input.jumpHeld === true) {
    velocityY = config.jumpVelocity;
    grounded = false;
  } else if (!grounded) {
    velocityY -= config.gravity * dt;
  } else {
    velocityY = Math.min(0, velocityY);
  }

  const horizontalDesired: Vec3 = [
    original.position[0] + velocityX * dt,
    original.position[1],
    original.position[2] + velocityZ * dt,
  ];
  const horizontal = resolveHorizontalMovement(
    map,
    original.position,
    horizontalDesired,
    shape
  );
  if (Math.abs(horizontal[0] - horizontalDesired[0]) > 1e-6) velocityX = 0;
  if (Math.abs(horizontal[2] - horizontalDesired[2]) > 1e-6) velocityZ = 0;

  let nextY = original.position[1] + velocityY * dt;
  const groundCeiling =
    Math.max(original.position[1], nextY) + map.world.maxStepHeight;
  const ground = surfaceHeightAt(
    map,
    horizontal[0],
    horizontal[2],
    groundCeiling
  );
  const canSnap =
    velocityY <= 0 &&
    nextY <= ground + (grounded ? config.groundSnapDistance : 0.04);
  if (canSnap) {
    nextY = ground;
    velocityY = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  const ceilingResult = resolveCeiling(
    map,
    [horizontal[0], nextY, horizontal[2]],
    shape,
    velocityY
  );
  nextY = ceilingResult[0];
  velocityY = ceilingResult[1];

  return {
    position: [horizontal[0], nextY, horizontal[2]],
    velocity: [velocityX, velocityY, velocityZ],
    grounded,
  };
};
