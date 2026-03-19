import type { Vec3 } from './netcode';

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

export const ARENA_BLOCKS: ArenaBlock[] = [
  { centerX: 5.09392, centerZ: -0.95117, minY: 0.12000, maxY: 1.92000, halfX: 0.40000, halfZ: 0.40000, yaw: 0.000000, color: '#64748b' },
  { centerX: -3.84218, centerZ: 2.21927, minY: 0.94444, maxY: 2.94444, halfX: 1.00000, halfZ: 1.00000, yaw: 0.000000, color: '#64748b' },
  { centerX: -15.31586, centerZ: 0.10082, minY: 0.00368, maxY: 8.00368, halfX: 4.00000, halfZ: 0.20000, yaw: 0.000000, color: '#64748b' },
  { centerX: -15.31586, centerZ: -11.54711, minY: 0.00368, maxY: 8.00368, halfX: 4.00000, halfZ: 0.20000, yaw: 0.000000, color: '#64748b' },
  { centerX: -19.48598, centerZ: -5.71170, minY: 0.00368, maxY: 8.00368, halfX: 5.84000, halfZ: 0.20000, yaw: 1.570796, color: '#64748b' },
  { centerX: 14.68880, centerZ: 11.00890, minY: 0.00368, maxY: 8.00368, halfX: 5.84000, halfZ: 0.20000, yaw: 1.570796, color: '#64748b' },
  { centerX: 10.87891, centerZ: 5.17349, minY: 0.00368, maxY: 8.00368, halfX: 4.00000, halfZ: 0.20000, yaw: 0.000000, color: '#64748b' },
  { centerX: 18.49891, centerZ: 16.82142, minY: 0.00368, maxY: 8.00368, halfX: 4.00000, halfZ: 0.20000, yaw: 0.000000, color: '#64748b' },
  { centerX: 13.23891, centerZ: -15.02226, minY: 0.00368, maxY: 8.00368, halfX: 8.84000, halfZ: 0.20000, yaw: 0.000000, color: '#64748b' },
  { centerX: 14.68880, centerZ: -15.12684, minY: 0.00368, maxY: 8.00368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: 0.08281, centerZ: 13.39227, minY: 0.10444, maxY: 3.78444, halfX: 2.38000, halfZ: 0.10000, yaw: 0.000000, color: '#64748b' },
  { centerX: -8.60557, centerZ: 7.54725, minY: 0.10444, maxY: 3.78444, halfX: 2.38000, halfZ: 0.10000, yaw: 0.000000, color: '#64748b' },
  { centerX: 6.97860, centerZ: 5.31945, minY: 0.10444, maxY: 3.78444, halfX: 4.14000, halfZ: 0.10000, yaw: 1.570796, color: '#64748b' },
  { centerX: -25.39542, centerZ: 13.85416, minY: -0.40000, maxY: 2.52000, halfX: 1.46000, halfZ: 0.50000, yaw: 0.000000, color: '#64748b' },
  { centerX: 14.68880, centerZ: -4.33563, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: -13.19907, centerZ: -20.40905, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: 14.68880, centerZ: -24.98794, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: -0.93795, centerZ: -21.10769, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: 4.87588, centerZ: 19.33433, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: 24.07576, centerZ: 6.72323, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: -16.65078, centerZ: 7.67395, minY: 0.02368, maxY: 2.22368, halfX: 5.84000, halfZ: 0.20000, yaw: 2.268928, color: '#64748b' },
  { centerX: -10.25691, centerZ: 17.93814, minY: 0.10444, maxY: 3.84444, halfX: 2.41037, halfZ: 2.38000, yaw: 0.000000, color: '#64748b' },
  { centerX: 0.07336, centerZ: -9.66446, minY: 0.10444, maxY: 3.84444, halfX: 2.41037, halfZ: 2.38000, yaw: 0.785398, color: '#64748b' },
  { centerX: 21.12998, centerZ: -2.77633, minY: 0.10444, maxY: 3.84444, halfX: 2.41037, halfZ: 2.38000, yaw: 0.785398, color: '#64748b' },
  { centerX: -21.72169, centerZ: -18.92193, minY: 0.10444, maxY: 3.84444, halfX: 2.41037, halfZ: 2.38000, yaw: 0.000000, color: '#64748b' },
  { centerX: -17.20196, centerZ: -7.55309, minY: 0.10444, maxY: 3.78444, halfX: 2.38000, halfZ: 0.10000, yaw: 2.944276, color: '#64748b' },
  { centerX: -6.02308, centerZ: -13.26200, minY: 0.10444, maxY: 3.78444, halfX: 2.38000, halfZ: 0.10000, yaw: -2.168545, color: '#64748b' },
  { centerX: 5.94835, centerZ: -24.19974, minY: 0.10444, maxY: 3.78444, halfX: 2.38000, halfZ: 0.10000, yaw: -2.938323, color: '#64748b' },
  { centerX: -10.59860, centerZ: -5.66869, minY: 0.12000, maxY: 1.92000, halfX: 0.40000, halfZ: 0.40000, yaw: 0.000000, color: '#64748b' },
  { centerX: 7.24234, centerZ: -20.27291, minY: 0.12000, maxY: 1.92000, halfX: 0.40000, halfZ: 0.40000, yaw: 0.000000, color: '#64748b' },
  { centerX: 10.11569, centerZ: 12.20886, minY: 0.12000, maxY: 1.92000, halfX: 0.14000, halfZ: 1.96000, yaw: 0.000000, color: '#64748b' },
  { centerX: -18.25787, centerZ: 16.05289, minY: 0.12000, maxY: 1.92000, halfX: 0.14000, halfZ: 1.96000, yaw: 0.000000, color: '#64748b' },
  { centerX: -2.45024, centerZ: 0.51373, minY: -0.23556, maxY: 5.61836, halfX: 5.12457, halfZ: 4.28400, yaw: 0.000000, color: '#64748b' }
];

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
