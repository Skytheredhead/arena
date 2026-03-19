import { describe, expect, it } from 'vitest';
import { simulatePlayerTick, type LocalPlayerState } from '@arena/shared';

const makeState = (): LocalPlayerState => ({
  identity: 'test',
  position: { x: -8, y: 0, z: -12 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 0,
  serverTimeMs: 0,
  yaw: 0,
  pitch: 0,
  onGround: true,
  alive: true,
  health: 100,
  ammo: 30,
  lastProcessedInput: 0,
  respawnTick: 0
});

describe('simulatePlayerTick', () => {
  it('moves forward from grounded state', () => {
    const state = makeState();
    const next = simulatePlayerTick(state, {
      sequence: 1,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumping: false,
      sprinting: false
    });

    expect(next.position.z).toBeLessThan(state.position.z);
    expect(next.lastProcessedInput).toBe(0);
  });

  it('applies jump velocity', () => {
    const state = makeState();
    const next = simulatePlayerTick(state, {
      sequence: 2,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      jumping: true,
      sprinting: false
    });

    expect(next.velocity.y).toBeGreaterThan(0);
    expect(next.onGround).toBe(false);
  });

  it('keeps diagonal ground speed aligned with straight movement', () => {
    const state = makeState();
    const forward = simulatePlayerTick(state, {
      sequence: 3,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumping: false,
      sprinting: false
    });
    const diagonal = simulatePlayerTick(state, {
      sequence: 4,
      moveX: 1,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumping: false,
      sprinting: false
    });

    const forwardSpeed = Math.hypot(forward.velocity.x, forward.velocity.z);
    const diagonalSpeed = Math.hypot(diagonal.velocity.x, diagonal.velocity.z);

    expect(diagonalSpeed).toBeCloseTo(forwardSpeed, 6);
  });
});
