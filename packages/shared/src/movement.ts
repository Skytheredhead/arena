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
import { ARENA_BLOCKS, ARENA_HALF_SIZE } from './map';
import type { InputCommand, LocalPlayerState, Vec3 } from './netcode';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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

const overlapsBlock = (x: number, z: number, block: (typeof ARENA_BLOCKS)[number]): boolean =>
  x + PLAYER_RADIUS > block.minX &&
  x - PLAYER_RADIUS < block.maxX &&
  z + PLAYER_RADIUS > block.minZ &&
  z - PLAYER_RADIUS < block.maxZ;

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
    x - PLAYER_RADIUS < -ARENA_HALF_SIZE ||
    x + PLAYER_RADIUS > ARENA_HALF_SIZE ||
    z - PLAYER_RADIUS < -ARENA_HALF_SIZE ||
    z + PLAYER_RADIUS > ARENA_HALF_SIZE
  ) {
    return true;
  }

  const headY = y + PLAYER_HEIGHT;
  for (const block of ARENA_BLOCKS) {
    if (
      x + PLAYER_RADIUS > block.minX &&
      x - PLAYER_RADIUS < block.maxX &&
      z + PLAYER_RADIUS > block.minZ &&
      z - PLAYER_RADIUS < block.maxZ &&
      y < block.maxY &&
      headY > block.minY
    ) {
      return true;
    }
  }

  return false;
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

  const targetX = next.position.x + next.velocity.x * dtSeconds;
  const targetZ = next.position.z + next.velocity.z * dtSeconds;
  let resolvedX = targetX;
  let resolvedZ = targetZ;

  if (collidesAt(targetX, next.position.y, next.position.z)) {
    resolvedX = next.position.x;
    next.velocity.x = 0;
  }

  if (collidesAt(resolvedX, next.position.y, targetZ)) {
    resolvedZ = next.position.z;
    next.velocity.z = 0;
  }

  next.position.x = resolvedX;
  next.position.z = resolvedZ;

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
