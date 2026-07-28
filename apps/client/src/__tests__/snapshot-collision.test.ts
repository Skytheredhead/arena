import { ARENA_MAP } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { AuthoritativePlayerSnapshot } from '../netcode/contracts';
import { SnapshotBuffer } from '../netcode/SnapshotBuffer';
import { UINT32_MAX } from '../netcode/serial';
import { SharedMapCollisionResolver } from '../state/SharedMapCollisionResolver';

const snapshot = (
  serverTick: number,
  overrides: Partial<AuthoritativePlayerSnapshot> = {}
): AuthoritativePlayerSnapshot => ({
  id: 'remote',
  roomId: 'room',
  nickname: 'Remote',
  isBot: false,
  connected: true,
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  health: 100,
  alive: true,
  protectedUntilTick: 0,
  respawnAtTick: 0,
  kills: 0,
  deaths: 0,
  selectedWeapon: 1,
  serverTick,
  ackInputSeq: 0,
  ackFireCounter: 0,
  ackReloadCounter: 0,
  ackRespawnCounter: 0,
  lifeId: 1,
  ...overrides,
});

describe('SnapshotBuffer', () => {
  it('interpolates position and the shortest yaw arc', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(
      snapshot(10, {
        position: { x: 0, y: 0, z: 0 },
        yaw: (179 * Math.PI) / 180,
      })
    );
    buffer.push(
      snapshot(20, {
        position: { x: 4, y: 2, z: -2 },
        yaw: (-179 * Math.PI) / 180,
      })
    );
    const midpoint = buffer.sample(15);
    expect(midpoint?.interpolated).toBe(true);
    expect(midpoint?.position).toEqual({ x: 2, y: 1, z: -1 });
    expect(Math.abs(midpoint?.yaw ?? 0)).toBeCloseTo(Math.PI, 3);
  });

  it('snaps teleports and bounds extrapolation', () => {
    const buffer = new SnapshotBuffer({
      maxExtrapolationTicks: 6,
      teleportDistance: 5,
    });
    buffer.push(snapshot(10, { position: { x: 0, y: 0, z: 0 } }));
    buffer.push(
      snapshot(20, {
        position: { x: 20, y: 0, z: 0 },
        velocity: { x: 60, y: 0, z: 0 },
      })
    );
    expect(buffer.sample(15)?.position.x).toBe(20);
    const extrapolated = buffer.sample(100);
    expect(extrapolated?.extrapolated).toBe(true);
    expect(extrapolated?.position.x).toBeCloseTo(26, 6);
  });

  it('keeps a monotonic timeline through tick rollover', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(UINT32_MAX, { position: { x: 0, y: 0, z: 0 } }));
    buffer.push(snapshot(0, { position: { x: 2, y: 0, z: 0 } }));
    expect(buffer.latestTick).toBe(UINT32_MAX + 1);
    expect(buffer.sample(UINT32_MAX + 0.5)?.position.x).toBeCloseTo(1, 6);
  });
});

describe('SharedMapCollisionResolver', () => {
  it('uses shared bounds and ground data for client prediction', () => {
    const resolver = new SharedMapCollisionResolver(ARENA_MAP);
    const maximumX =
      ARENA_MAP.world.playableBounds.max[0] - ARENA_MAP.world.playerRadius;
    const result = resolver.resolve(
      {
        x: maximumX - 0.01,
        y: ARENA_MAP.world.floorY,
        z: 0,
      },
      { x: 100, y: -1, z: 0 },
      0.05
    );
    expect(result.position.x).toBeLessThanOrEqual(maximumX);
    expect(result.position.y).toBe(ARENA_MAP.world.floorY);
    expect(result.grounded).toBe(true);
  });
});
