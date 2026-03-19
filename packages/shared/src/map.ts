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
  { minX: -2, minY: 0, minZ: -2, maxX: 2, maxY: 2, maxZ: 2, color: '#475569' },
  { minX: -14, minY: 0, minZ: -2, maxX: -10, maxY: 2.4, maxZ: 2, color: '#64748b' },
  { minX: 10, minY: 0, minZ: -2, maxX: 14, maxY: 2.4, maxZ: 2, color: '#64748b' },
  { minX: -2, minY: 0, minZ: -14, maxX: 2, maxY: 2.4, maxZ: -10, color: '#64748b' },
  { minX: -2, minY: 0, minZ: 10, maxX: 2, maxY: 2.4, maxZ: 14, color: '#64748b' }
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
  { x: -22, y: 0, z: -22 },
  { x: 22, y: 0, z: -22 },
  { x: -22, y: 0, z: 22 },
  { x: 22, y: 0, z: 22 },
  { x: 0, y: 0, z: -24 },
  { x: 0, y: 0, z: 24 },
  { x: -24, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 }
];

export const AMMO_PACK_LOCATIONS: Vec3[] = [
  { x: -20, y: 0, z: 0 },
  { x: 20, y: 0, z: 0 },
  { x: 0, y: 0, z: -20 },
  { x: 0, y: 0, z: 20 },
  { x: -8, y: 0, z: -8 },
  { x: 8, y: 0, z: -8 },
  { x: -8, y: 0, z: 8 },
  { x: 8, y: 0, z: 8 },
  { x: -16, y: 0, z: 16 },
  { x: 16, y: 0, z: -16 }
];

export const HEALTH_PACK_LOCATIONS: Vec3[] = [
  { x: -12, y: 0, z: 12 },
  { x: 12, y: 0, z: 12 },
  { x: -12, y: 0, z: -12 },
  { x: 12, y: 0, z: -12 }
];
