import type { Vec3 } from './netcode';

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ArenaBlock extends Aabb {
  color: string;
}

export const ARENA_HALF_SIZE = 30;
export const ARENA_MIN_X = -30;
export const ARENA_MAX_X = 30;
export const ARENA_MIN_Z = -31.20470965;
export const ARENA_MAX_Z = 28.79529035;

export const ARENA_BLOCKS: ArenaBlock[] = [
  { minX: 4.69, minY: 0.12, minZ: -1.35, maxX: 5.49, maxY: 1.92, maxZ: -0.55, color: '#64748b' },
  { minX: -4.84, minY: 0.94, minZ: 1.22, maxX: -2.84, maxY: 2.94, maxZ: 3.22, color: '#64748b' },
  { minX: -19.32, minY: 0, minZ: -0.1, maxX: -11.32, maxY: 8, maxZ: 0.3, color: '#64748b' },
  { minX: -19.32, minY: 0, minZ: -11.75, maxX: -11.32, maxY: 8, maxZ: -11.35, color: '#64748b' },
  { minX: -19.69, minY: 0, minZ: -11.55, maxX: -19.29, maxY: 8, maxZ: 0.13, color: '#64748b' },
  { minX: 14.49, minY: 0, minZ: 5.17, maxX: 14.89, maxY: 8, maxZ: 16.85, color: '#64748b' },
  { minX: 6.88, minY: 0, minZ: 4.97, maxX: 14.88, maxY: 8, maxZ: 5.37, color: '#64748b' },
  { minX: 14.5, minY: 0, minZ: 16.62, maxX: 22.5, maxY: 8, maxZ: 17.02, color: '#64748b' },
  { minX: 4.4, minY: 0, minZ: -15.22, maxX: 22.08, maxY: 8, maxZ: -14.82, color: '#64748b' },
  { minX: 10.78, minY: 0, minZ: -19.73, maxX: 18.6, maxY: 8, maxZ: -10.52, color: '#64748b' },
  { minX: -2.3, minY: 0.1, minZ: 13.29, maxX: 2.46, maxY: 3.78, maxZ: 13.49, color: '#64748b' },
  { minX: -10.99, minY: 0.1, minZ: 7.45, maxX: -6.23, maxY: 3.78, maxZ: 7.65, color: '#64748b' },
  { minX: 6.88, minY: 0.1, minZ: 1.18, maxX: 7.08, maxY: 3.78, maxZ: 9.46, color: '#64748b' },
  { minX: -26.86, minY: -0.4, minZ: 13.35, maxX: -23.94, maxY: 2.52, maxZ: 14.35, color: '#64748b' },
  { minX: 10.78, minY: 0.02, minZ: -8.94, maxX: 18.6, maxY: 2.22, maxZ: 0.27, color: '#64748b' },
  { minX: -17.11, minY: 0.02, minZ: -25.01, maxX: -9.29, maxY: 2.22, maxZ: -15.81, color: '#64748b' },
  { minX: 10.78, minY: 0.02, minZ: -29.59, maxX: 18.6, maxY: 2.22, maxZ: -20.39, color: '#64748b' },
  { minX: -4.85, minY: 0.02, minZ: -25.71, maxX: 2.97, maxY: 2.22, maxZ: -16.51, color: '#64748b' },
  { minX: 0.97, minY: 0.02, minZ: 14.73, maxX: 8.78, maxY: 2.22, maxZ: 23.94, color: '#64748b' },
  { minX: 20.17, minY: 0.02, minZ: 2.12, maxX: 27.98, maxY: 2.22, maxZ: 11.33, color: '#64748b' },
  { minX: -20.56, minY: 0.02, minZ: 3.07, maxX: -12.74, maxY: 2.22, maxZ: 12.28, color: '#64748b' },
  { minX: -12.67, minY: 0.1, minZ: 15.56, maxX: -7.85, maxY: 3.84, maxZ: 20.32, color: '#64748b' },
  { minX: -1.71, minY: 0.1, minZ: -13.71, maxX: 5.06, maxY: 3.84, maxZ: -6.94, color: '#64748b' },
  { minX: 19.35, minY: 0.1, minZ: -6.83, maxX: 26.12, maxY: 3.84, maxZ: -0.05, color: '#64748b' },
  { minX: -24.13, minY: 0.1, minZ: -21.3, maxX: -19.31, maxY: 3.84, maxZ: -16.54, color: '#64748b' },
  { minX: -19.56, minY: 0.1, minZ: -8.12, maxX: -14.85, maxY: 3.78, maxZ: -6.99, color: '#64748b' },
  { minX: -7.45, minY: 0.1, minZ: -15.29, maxX: -4.6, maxY: 3.78, maxZ: -11.24, color: '#64748b' },
  { minX: 3.6, minY: 0.1, minZ: -24.78, maxX: 8.3, maxY: 3.78, maxZ: -23.62, color: '#64748b' },
  { minX: -11, minY: 0.12, minZ: -6.07, maxX: -10.2, maxY: 1.92, maxZ: -5.27, color: '#64748b' },
  { minX: 6.84, minY: 0.12, minZ: -20.67, maxX: 7.64, maxY: 1.92, maxZ: -19.87, color: '#64748b' },
  { minX: 9.98, minY: 0.12, minZ: 10.25, maxX: 10.26, maxY: 1.92, maxZ: 14.17, color: '#64748b' },
  { minX: -18.4, minY: 0.12, minZ: 14.09, maxX: -18.12, maxY: 1.92, maxZ: 18.01, color: '#64748b' },
  { minX: -7.57, minY: -0.24, minZ: -3.77, maxX: 2.67, maxY: 5.62, maxZ: 4.8, color: '#64748b' }
];

export const ARENA_WALLS: ArenaBlock[] = [
  {
    minX: -ARENA_HALF_SIZE,
    minY: 0,
    minZ: -ARENA_HALF_SIZE,
    maxX: ARENA_HALF_SIZE,
    maxY: 0.2,
    maxZ: ARENA_HALF_SIZE,
    color: '#1b2433'
  },
  {
    minX: -ARENA_HALF_SIZE - 0.8,
    minY: 0,
    minZ: -ARENA_HALF_SIZE - 0.8,
    maxX: -ARENA_HALF_SIZE,
    maxY: 4.5,
    maxZ: ARENA_HALF_SIZE + 0.8,
    color: '#111827'
  },
  {
    minX: ARENA_HALF_SIZE,
    minY: 0,
    minZ: -ARENA_HALF_SIZE - 0.8,
    maxX: ARENA_HALF_SIZE + 0.8,
    maxY: 4.5,
    maxZ: ARENA_HALF_SIZE + 0.8,
    color: '#111827'
  },
  {
    minX: -ARENA_HALF_SIZE - 0.8,
    minY: 0,
    minZ: -ARENA_HALF_SIZE - 0.8,
    maxX: ARENA_HALF_SIZE + 0.8,
    maxY: 4.5,
    maxZ: -ARENA_HALF_SIZE,
    color: '#111827'
  },
  {
    minX: -ARENA_HALF_SIZE - 0.8,
    minY: 0,
    minZ: ARENA_HALF_SIZE,
    maxX: ARENA_HALF_SIZE + 0.8,
    maxY: 4.5,
    maxZ: ARENA_HALF_SIZE + 0.8,
    color: '#111827'
  }
];

export const ARENA_SOLIDS: Aabb[] = [...ARENA_BLOCKS, ...ARENA_WALLS.slice(1)];

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
