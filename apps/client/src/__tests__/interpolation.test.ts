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
});
