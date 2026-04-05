import { describe, expect, it } from 'vitest';
import { sanitizeLocalPlayerPatch } from '../state/sanitizeLocalPlayerPatch';

const fallback = {
  identity: 'pilot',
  position: { x: 4, y: 1, z: -2 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 20,
  serverTimeMs: 320,
  inputPipelineMs: 12,
  yaw: 0.4,
  pitch: -0.3,
  onGround: true,
  alive: true,
  health: 100,
  ammo: 30,
  lastProcessedInput: 18,
  respawnTick: 0
};

describe('sanitizeLocalPlayerPatch', () => {
  it('drops malformed scalars and vectors back to the last known-good state', () => {
    const patch = sanitizeLocalPlayerPatch(
      {
        position: { x: Number.NaN, y: 5, z: Number.POSITIVE_INFINITY },
        velocity: { x: 1, y: Number.NaN, z: 3 },
        yaw: Number.NaN,
        serverTick: -8,
        alive: false
      },
      fallback
    );

    expect(patch.position).toEqual({ x: 4, y: 5, z: -2 });
    expect(patch.velocity).toEqual({ x: 1, y: 0, z: 3 });
    expect(patch.yaw).toBe(0.4);
    expect(patch.serverTick).toBe(0);
    expect(patch.alive).toBe(false);
  });
});
