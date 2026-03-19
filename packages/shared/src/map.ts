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

export const ARENA_BLOCKS: ArenaBlock[] = [
  { minX: -2.2, minY: 0, minZ: -2.2, maxX: 2.2, maxY: 6, maxZ: 2.2, color: '#2b323f' },
  { minX: -4, minY: 0, minZ: 3.6, maxX: 4, maxY: 2.4, maxZ: 5.2, color: '#2f3946' },
  { minX: -4, minY: 0, minZ: -5.2, maxX: 4, maxY: 2.4, maxZ: -3.6, color: '#2f3946' },
  { minX: 3.6, minY: 0, minZ: -4, maxX: 5.2, maxY: 2.4, maxZ: 4, color: '#2f3946' },
  { minX: -5.2, minY: 0, minZ: -4, maxX: -3.6, maxY: 2.4, maxZ: 4, color: '#2f3946' },
  { minX: -3, minY: 3, minZ: 7.2, maxX: 3, maxY: 3.4, maxZ: 9.2, color: '#3f4e5c' },
  { minX: -3, minY: 3, minZ: -9.2, maxX: 3, maxY: 3.4, maxZ: -7.2, color: '#3f4e5c' },
  { minX: 7.2, minY: 3, minZ: -3, maxX: 9.2, maxY: 3.4, maxZ: 3, color: '#3f4e5c' },
  { minX: -9.2, minY: 3, minZ: -3, maxX: -7.2, maxY: 3.4, maxZ: 3, color: '#3f4e5c' },
  { minX: 4.8, minY: 3, minZ: 4.8, maxX: 7.6, maxY: 3.4, maxZ: 7.6, color: '#455464' },
  { minX: -7.6, minY: 3, minZ: 4.8, maxX: -4.8, maxY: 3.4, maxZ: 7.6, color: '#455464' },
  { minX: 4.8, minY: 3, minZ: -7.6, maxX: 7.6, maxY: 3.4, maxZ: -4.8, color: '#455464' },
  { minX: -7.6, minY: 3, minZ: -7.6, maxX: -4.8, maxY: 3.4, maxZ: -4.8, color: '#455464' },
  { minX: 7.4, minY: 0, minZ: -0.8, maxX: 8.6, maxY: 3, maxZ: 0.8, color: '#364451' },
  { minX: -8.6, minY: 0, minZ: -0.8, maxX: -7.4, maxY: 3, maxZ: 0.8, color: '#364451' },
  { minX: -0.8, minY: 0, minZ: 7.4, maxX: 0.8, maxY: 3, maxZ: 8.6, color: '#364451' },
  { minX: -0.8, minY: 0, minZ: -8.6, maxX: 0.8, maxY: 3, maxZ: -7.4, color: '#364451' },
  { minX: 20, minY: 0, minZ: -24, maxX: 22, maxY: 4, maxZ: 24, color: '#6a4a36' },
  { minX: 13, minY: 0, minZ: -24, maxX: 15, maxY: 4, maxZ: -6, color: '#7a5a46' },
  { minX: 13, minY: 0, minZ: 6, maxX: 15, maxY: 4, maxZ: 24, color: '#7a5a46' },
  { minX: -22, minY: 0, minZ: -24, maxX: -20, maxY: 4, maxZ: 24, color: '#3f5f70' },
  { minX: -15, minY: 0, minZ: -24, maxX: -13, maxY: 4, maxZ: -6, color: '#4a6f82' },
  { minX: -15, minY: 0, minZ: 6, maxX: -13, maxY: 4, maxZ: 24, color: '#4a6f82' },
  { minX: 15, minY: 0, minZ: 22, maxX: 20, maxY: 4, maxZ: 24, color: '#5c4738' },
  { minX: 15, minY: 0, minZ: -24, maxX: 20, maxY: 4, maxZ: -22, color: '#5c4738' },
  { minX: -20, minY: 0, minZ: 22, maxX: -15, maxY: 4, maxZ: 24, color: '#3a5667' },
  { minX: -20, minY: 0, minZ: -24, maxX: -15, maxY: 4, maxZ: -22, color: '#3a5667' },
  { minX: -6, minY: 2.2, minZ: -1.6, maxX: 6, maxY: 2.8, maxZ: 1.6, color: '#2b3643' },
  { minX: -2.5, minY: 3, minZ: -12, maxX: 2.5, maxY: 3.4, maxZ: -9, color: '#41505f' },
  { minX: -1, minY: 3, minZ: -9, maxX: 1, maxY: 3.4, maxZ: -7.2, color: '#41505f' },
  { minX: -2, minY: 0, minZ: -14, maxX: -1.4, maxY: 4, maxZ: -8, color: '#394754' },
  { minX: 1.4, minY: 0, minZ: -14, maxX: 2, maxY: 4, maxZ: -8, color: '#394754' },
  { minX: -6, minY: 0, minZ: -16, maxX: -4, maxY: 1.6, maxZ: -14, color: '#5d4a3a' },
  { minX: 4, minY: 0, minZ: 14, maxX: 6, maxY: 1.6, maxZ: 16, color: '#3d586a' }
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
  { x: -18, y: 0, z: -18 },
  { x: 18, y: 0, z: -18 },
  { x: -18, y: 0, z: 18 },
  { x: 18, y: 0, z: 18 },
  { x: -10, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 0, y: 0, z: -18 },
  { x: 0, y: 0, z: 18 }
];

export const AMMO_PACK_LOCATIONS: Vec3[] = [
  { x: -18, y: 0, z: -20 },
  { x: -18, y: 0, z: -12 },
  { x: -18, y: 0, z: -4 },
  { x: -18, y: 0, z: 4 },
  { x: -18, y: 0, z: 12 },
  { x: -18, y: 0, z: 20 },
  { x: 18, y: 0, z: -20 },
  { x: 18, y: 0, z: -12 },
  { x: 18, y: 0, z: -4 },
  { x: 18, y: 0, z: 4 },
  { x: 18, y: 0, z: 12 },
  { x: 18, y: 0, z: 20 },
  { x: -10, y: 0, z: -18 },
  { x: -10, y: 0, z: 18 },
  { x: 10, y: 0, z: -18 },
  { x: 10, y: 0, z: 18 },
  { x: -8, y: 0, z: -8 },
  { x: -8, y: 0, z: 8 },
  { x: 8, y: 0, z: -8 },
  { x: 8, y: 0, z: 8 },
  { x: -4, y: 0, z: -14 },
  { x: 4, y: 0, z: -14 },
  { x: -4, y: 0, z: 14 },
  { x: 4, y: 0, z: 14 },
  { x: 0, y: 0, z: -16 },
  { x: 0, y: 0, z: 16 },
  { x: -12, y: 0, z: 0 },
  { x: 12, y: 0, z: 0 },
  { x: -6, y: 0, z: 0 },
  { x: 6, y: 0, z: 0 }
];
