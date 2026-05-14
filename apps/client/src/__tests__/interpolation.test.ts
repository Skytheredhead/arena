import { describe, expect, it } from 'vitest';
import type { RemotePlayerState } from '@arena/shared';
import {
  BASE_REMOTE_INTERPOLATION_DELAY_MS,
  MAX_REMOTE_INTERPOLATION_DELAY_MS,
  MIN_REMOTE_INTERPOLATION_DELAY_MS,
  SnapshotBuffer,
  getAdaptiveRemoteInterpolationDelayMs,
  updateRemoteBufferPressure,
} from '../netcode/interpolation';

const snapshot = (serverTimeMs: number, x: number): RemotePlayerState => ({
  identity: 'remote',
  nickname: 'Remote',
  position: { x, y: 0, z: 0 },
  velocity: { x: 2, y: 0, z: 0 },
  serverTick: serverTimeMs / 50,
  serverTimeMs,
  yaw: 0,
  pitch: 0,
  sprinting: false,
  crouching: false,
  alive: true,
  health: 100,
  kills: 0,
  deaths: 0,
  roomCode: 'ARENA',
});

describe('SnapshotBuffer', () => {
  it('interpolates between server-timestamped snapshots', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1050, 1));

    const sampled = buffer.sample(1025);
    expect(sampled?.position.x).toBeCloseTo(0.5, 2);
  });

  it('reports interpolation metadata for buffered snapshots', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));
    buffer.push(snapshot(1050, 1));

    const sampled = buffer.sampleWithMeta(1025);
    expect(sampled?.mode).toBe('interpolated');
    expect(sampled?.underrunMs).toBe(0);
    expect(sampled?.bufferDepthMs).toBe(25);
    expect(sampled?.state.position.x).toBeCloseTo(0.5, 2);
  });

  it('gracefully extrapolates a short distance during underrun', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));

    const sampled = buffer.sample(1050);
    expect(sampled?.position.x).toBeGreaterThan(0);
    expect(sampled?.position.x).toBeLessThan(0.2);
  });

  it('reports bounded extrapolation metadata during underrun', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshot(1000, 0));

    const sampled = buffer.sampleWithMeta(1200);
    expect(sampled?.mode).toBe('extrapolated');
    expect(sampled?.underrunMs).toBe(200);
    expect(sampled?.bufferDepthMs).toBe(0);
    expect(sampled?.state.serverTimeMs).toBe(1100);
    expect(sampled?.state.position.x).toBeCloseTo(0.2, 5);
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

  it('keeps adaptive remote delay within the supported range', () => {
    const quiet = getAdaptiveRemoteInterpolationDelayMs({
      pingMs: 20,
      jitterMs: 0,
      serverPipelineMs: 0,
      remoteBufferPressure: 0,
      reconnecting: false,
    });
    const stressed = getAdaptiveRemoteInterpolationDelayMs({
      pingMs: 500,
      jitterMs: 120,
      serverPipelineMs: 500,
      remoteBufferPressure: 1,
      reconnecting: true,
    });

    expect(quiet).toBe(BASE_REMOTE_INTERPOLATION_DELAY_MS);
    expect(quiet).toBeGreaterThanOrEqual(MIN_REMOTE_INTERPOLATION_DELAY_MS);
    expect(stressed).toBe(MAX_REMOTE_INTERPOLATION_DELAY_MS);
  });

  it('raises remote buffer pressure on underrun and decays when stable', () => {
    const raised = updateRemoteBufferPressure({
      previousPressure: 0.1,
      maxUnderrunMs: 70,
      deltaSeconds: 1 / 60,
      fullPressureUnderrunMs: 140,
      decayPerSecond: 0.65,
    });
    const decayed = updateRemoteBufferPressure({
      previousPressure: raised,
      maxUnderrunMs: 0,
      deltaSeconds: 0.5,
      fullPressureUnderrunMs: 140,
      decayPerSecond: 0.65,
    });

    expect(raised).toBeCloseTo(0.5, 5);
    expect(decayed).toBeLessThan(raised);
    expect(decayed).toBeGreaterThan(0);
  });
});
