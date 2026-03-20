import {
  AIR_ACCELERATION,
  GROUND_ACCELERATION,
  GROUND_FRICTION,
  GRAVITY,
  JUMP_SPEED,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_STEP_HEIGHT,
  SERVER_TICK_SECONDS,
  SPRINT_SPEED,
  WALK_SPEED
} from './gameplay';
import { ARENA_BLOCKS, ARENA_MAX_X, ARENA_MAX_Z, ARENA_MIN_X, ARENA_MIN_Z } from './map';
import type { InputCommand, LocalPlayerState, Vec3 } from './netcode';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const COLLISION_EPSILON = 0.0001;
const MOVEMENT_SUBSTEP_MAX_DISTANCE = 0.12;
const TWO_PI = Math.PI * 2;

const length2D = (x: number, z: number): number => Math.hypot(x, z);

const normalize2D = (x: number, z: number): { x: number; z: number } => {
  const length = length2D(x, z);
  if (length === 0) {
    return { x: 0, z: 0 };
  }

  return { x: x / length, z: z / length };
};

const moveHorizontalTowards = (
  velocity: Vec3,
  target: { x: number; z: number },
  maxDelta: number
): Vec3 => {
  const deltaX = target.x - velocity.x;
  const deltaZ = target.z - velocity.z;
  const deltaLength = length2D(deltaX, deltaZ);

  if (deltaLength === 0 || deltaLength <= maxDelta) {
    return {
      ...velocity,
      x: target.x,
      z: target.z
    };
  }

  const scale = maxDelta / deltaLength;
  return {
    ...velocity,
    x: velocity.x + deltaX * scale,
    z: velocity.z + deltaZ * scale
  };
};

const toBlockLocal = (
  x: number,
  z: number,
  block: (typeof ARENA_BLOCKS)[number]
): { x: number; z: number } => {
  const dx = x - block.centerX;
  const dz = z - block.centerZ;
  const cos = Math.cos(block.yaw);
  const sin = Math.sin(block.yaw);
  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos
  };
};

const normalizeAngle = (value: number): number => {
  let angle = value;
  while (angle <= -Math.PI) angle += TWO_PI;
  while (angle > Math.PI) angle -= TWO_PI;
  return angle;
};

const normalizeCollisionBlock = (
  block: (typeof ARENA_BLOCKS)[number]
): (typeof ARENA_BLOCKS)[number] => {
  return {
    ...block,
    yaw: normalizeAngle(block.yaw)
  };
};

const overlapsBlock = (x: number, z: number, block: (typeof ARENA_BLOCKS)[number]): boolean => {
  const normalized = normalizeCollisionBlock(block);
  const local = toBlockLocal(x, z, normalized);
  const closestX = clamp(local.x, -normalized.halfX, normalized.halfX);
  const closestZ = clamp(local.z, -normalized.halfZ, normalized.halfZ);
  return (
    length2D(local.x - closestX, local.z - closestZ) <=
    PLAYER_RADIUS + COLLISION_EPSILON
  );
};

const groundHeightAt = (x: number, z: number, currentFeetY: number): number => {
  let ground = 0;

  for (const block of ARENA_BLOCKS) {
    if (!overlapsBlock(x, z, block)) {
      continue;
    }

    const top = block.maxY;
    if (top <= currentFeetY + PLAYER_STEP_HEIGHT && top > ground) {
      ground = top;
    }
  }

  return ground;
};

const collidesAt = (x: number, y: number, z: number): boolean => {
  if (
    x - PLAYER_RADIUS < ARENA_MIN_X ||
    x + PLAYER_RADIUS > ARENA_MAX_X ||
    z - PLAYER_RADIUS < ARENA_MIN_Z ||
    z + PLAYER_RADIUS > ARENA_MAX_Z
  ) {
    return true;
  }

  const headY = y + PLAYER_HEIGHT;
  for (const block of ARENA_BLOCKS) {
    if (overlapsBlock(x, z, block) && y < block.maxY && headY > block.minY) {
      return true;
    }
  }

  return false;
};

const resolveHorizontalMotion = (
  position: Vec3,
  velocity: Vec3,
  feetY: number,
  dtSeconds: number
): {
  position: Vec3;
  velocity: Vec3;
} => {
  const deltaX = velocity.x * dtSeconds;
  const deltaZ = velocity.z * dtSeconds;
  const maxDelta = Math.max(Math.abs(deltaX), Math.abs(deltaZ));
  const steps = Math.max(1, Math.ceil(maxDelta / MOVEMENT_SUBSTEP_MAX_DISTANCE));
  const stepX = deltaX / steps;
  const stepZ = deltaZ / steps;

  const nextPosition = { ...position };
  const nextVelocity = { ...velocity };
  let moveXOpen = true;
  let moveZOpen = true;

  for (let index = 0; index < steps; index += 1) {
    if (moveXOpen) {
      const targetX = nextPosition.x + stepX;
      if (collidesAt(targetX, feetY, nextPosition.z)) {
        nextVelocity.x = 0;
        moveXOpen = false;
      } else {
        nextPosition.x = targetX;
      }
    }

    if (moveZOpen) {
      const targetZ = nextPosition.z + stepZ;
      if (collidesAt(nextPosition.x, feetY, targetZ)) {
        nextVelocity.z = 0;
        moveZOpen = false;
      } else {
        nextPosition.z = targetZ;
      }
    }

    if (!moveXOpen && !moveZOpen) {
      break;
    }
  }

  return {
    position: nextPosition,
    velocity: nextVelocity
  };
};

export const simulatePlayerTick = (
  state: LocalPlayerState,
  input: InputCommand,
  dtSeconds = SERVER_TICK_SECONDS
): LocalPlayerState => {
  const clampedPitch = clamp(input.pitch, -Math.PI * 0.49, Math.PI * 0.49);
  const next: LocalPlayerState = {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
    yaw: input.yaw,
    pitch: clampedPitch
  };

  const moveMagnitude = Math.min(1, length2D(input.moveX, input.moveZ));
  const move = normalize2D(input.moveX, input.moveZ);
  // Three.js cameras face down -Z at yaw 0, so movement needs the same convention.
  const forward = { x: -Math.sin(next.yaw), z: -Math.cos(next.yaw) };
  const right = { x: Math.cos(next.yaw), z: -Math.sin(next.yaw) };
  const wish = {
    x: right.x * move.x + forward.x * move.z,
    z: right.z * move.x + forward.z * move.z
  };
  const wishDir = normalize2D(wish.x, wish.z);
  const wishSpeed = (input.sprinting ? SPRINT_SPEED : WALK_SPEED) * moveMagnitude;
  const desiredVelocity = {
    x: wishDir.x * wishSpeed,
    z: wishDir.z * wishSpeed
  };

  if (next.onGround) {
    const groundControl = moveMagnitude > 0 ? GROUND_ACCELERATION : GROUND_FRICTION;
    next.velocity = moveHorizontalTowards(next.velocity, desiredVelocity, groundControl * dtSeconds);
    if (input.jumping) {
      next.velocity.y = JUMP_SPEED;
      next.onGround = false;
    } else {
      next.velocity.y = 0;
    }
  } else {
    next.velocity = moveHorizontalTowards(next.velocity, desiredVelocity, AIR_ACCELERATION * dtSeconds);
    next.velocity.y -= GRAVITY * dtSeconds;
  }

  const resolved = resolveHorizontalMotion(next.position, next.velocity, next.position.y, dtSeconds);
  next.position.x = resolved.position.x;
  next.position.z = resolved.position.z;
  next.velocity.x = resolved.velocity.x;
  next.velocity.z = resolved.velocity.z;

  const proposedY = next.position.y + next.velocity.y * dtSeconds;
  const groundHeight = groundHeightAt(next.position.x, next.position.z, next.position.y);

  if (proposedY <= groundHeight) {
    next.position.y = groundHeight;
    next.velocity.y = 0;
    next.onGround = true;
  } else {
    next.position.y = proposedY;
    next.onGround = false;
  }

  return next;
};
