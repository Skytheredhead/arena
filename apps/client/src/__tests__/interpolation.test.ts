import { describe, expect, it } from 'vitest';
import type { RemotePlayerState } from '@arena/shared';
import { SnapshotBuffer } from '../netcode/interpolation';

const snapshot = (serverTimeMs: number, x: number): RemotePlayerState => ({
  identity: 'remote',
  nickname: 'Remote',
  position: { x, y: 0, z: 0 },
  velocity: { x: 2, y: 0, z: 0 },
  serverTick: serverTimeMs / 50,
  serverTimeMs,
  yaw: 0,
  pitch: 0,
  alive: true,
  health: 100,
  kills: 0,
  deaths: 0,
  roomCode: 'ARENA'
});

describe('SnapshotBuffer', () => {
  it('interpolates between server-timestamped snapshots', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1050, 1));

    const sampled = buffer.sample(1025);
    expect(sampled?.position.x).toBeCloseTo(0.5, 2);
  });

  it('gracefully extrapolates a short distance during underrun', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));

    const sampled = buffer.sample(1050);
    expect(sampled?.position.x).toBeGreaterThan(0);
    expect(sampled?.position.x).toBeLessThan(0.2);
  });

  it('replaces same-timestamp snapshots with newer state', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1000, 3));

    const sampled = buffer.sample(1000);
    expect(sampled?.position.x).toBeCloseTo(3, 5);
  });

  it('does not resurrect a dead player on stale same-timestamp updates', () => {
    const buffer = new SnapshotBuffer();
    const dead = { ...snapshot(1000, 1), alive: false, health: 0 };
    const staleAlive = { ...snapshot(1000, 2), alive: true, health: 10 };
    buffer.push(dead);
    buffer.push(staleAlive);

    const sampled = buffer.sample(1000);
    expect(sampled?.alive).toBe(false);
    expect(sampled?.health).toBe(0);
  });
});
