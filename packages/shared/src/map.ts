import type { Vec3 } from './netcode';
import { GENERATED_ARENA_BLOCKS } from './generatedCollision';

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ArenaBlock {
  centerX: number;
  centerZ: number;
  minY: number;
  maxY: number;
  halfX: number;
  halfZ: number;
  yaw: number;
  color: string;
}

export const ARENA_HALF_SIZE = 30;
export const ARENA_MIN_X = -30;
export const ARENA_MAX_X = 30;
export const ARENA_MIN_Z = -31.20470965;
export const ARENA_MAX_Z = 28.79529035;

export const ARENA_BLOCKS: ArenaBlock[] = GENERATED_ARENA_BLOCKS;

export const ARENA_WALLS: ArenaBlock[] = [
  {
    centerX: 0,
    centerZ: -1.20470965,
    minY: 0,
    maxY: 0.2,
    halfX: ARENA_HALF_SIZE,
    halfZ: ARENA_HALF_SIZE,
    yaw: 0,
    color: '#1b2433'
  },
  {
    centerX: -ARENA_HALF_SIZE - 0.4,
    centerZ: -1.20470965,
    minY: 0,
    maxY: 4.5,
    halfX: 0.4,
    halfZ: ARENA_HALF_SIZE + 0.8,
    yaw: 0,
    color: '#111827'
  },
  {
    centerX: ARENA_HALF_SIZE + 0.4,
    centerZ: -1.20470965,
    minY: 0,
    maxY: 4.5,
    halfX: 0.4,
    halfZ: ARENA_HALF_SIZE + 0.8,
    yaw: 0,
    color: '#111827'
  },
  {
    centerX: 0,
    centerZ: -ARENA_HALF_SIZE - 0.4,
    minY: 0,
    maxY: 4.5,
    halfX: ARENA_HALF_SIZE + 0.8,
    halfZ: 0.4,
    yaw: 0,
    color: '#111827'
  },
  {
    centerX: 0,
    centerZ: ARENA_HALF_SIZE + 0.4,
    minY: 0,
    maxY: 4.5,
    halfX: ARENA_HALF_SIZE + 0.8,
    halfZ: 0.4,
    yaw: 0,
    color: '#111827'
  }
];

export const toAabb = (block: ArenaBlock): Aabb => {
  const cos = Math.cos(block.yaw);
  const sin = Math.sin(block.yaw);
  const worldHalfX = Math.abs(cos) * block.halfX + Math.abs(sin) * block.halfZ;
  const worldHalfZ = Math.abs(sin) * block.halfX + Math.abs(cos) * block.halfZ;

  return {
    minX: block.centerX - worldHalfX,
    minY: block.minY,
    minZ: block.centerZ - worldHalfZ,
    maxX: block.centerX + worldHalfX,
    maxY: block.maxY,
    maxZ: block.centerZ + worldHalfZ
  };
};

export const ARENA_SOLIDS: Aabb[] = [...ARENA_BLOCKS, ...ARENA_WALLS.slice(1)].map(toAabb);

export const SPAWN_POINTS: Vec3[] = [
  { x: -26, y: 0, z: -28 },
  { x: 26, y: 0, z: -28 },
  { x: -26, y: 0, z: 24 },
  { x: 26, y: 0, z: 24 },
  { x: 0, y: 0, z: -29 },
  { x: 0, y: 0, z: 27 },
  { x: -24, y: 0, z: -10 },
  { x: 24, y: 0, z: -10 }
];

export const AMMO_PACK_LOCATIONS: Vec3[] = [
  { x: -20, y: 0, z: 20 },
  { x: 20, y: 0, z: 20 },
  { x: -22, y: 0, z: 2 },
  { x: -25, y: 0, z: 8 },
  { x: -6, y: 0, z: 24 },
  { x: 6, y: 0, z: 12 },
  { x: -1, y: 0, z: -16 },
  { x: -15, y: 0, z: -6 },
  { x: 15, y: 0, z: 4 },
  { x: 15, y: 0, z: -10 }
];

export const HEALTH_PACK_LOCATIONS: Vec3[] = [
  { x: -12, y: 0, z: 8 },
  { x: 12, y: 0, z: 8 },
  { x: -9, y: 0, z: -8 },
  { x: 9, y: 0, z: -8 }
];
