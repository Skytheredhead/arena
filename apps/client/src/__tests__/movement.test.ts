import { describe, expect, it } from 'vitest';
import { simulatePlayerTick, type LocalPlayerState } from '@arena/shared';

const makeState = (): LocalPlayerState => ({
  identity: 'test',
  position: { x: 8, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 0,
  serverTimeMs: 0,
  inputPipelineMs: 0,
  yaw: 0,
  pitch: 0,
  onGround: true,
  sprinting: false,
  crouching: false,
  alive: true,
  health: 100,
  ammo: 30,
  lastProcessedInput: 0,
  respawnTick: 0,
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
      jumpHeld: false,
      sprintHeld: false,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
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
      jumpHeld: true,
      sprintHeld: false,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
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
      jumpHeld: false,
      sprintHeld: false,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
    });
    const diagonal = simulatePlayerTick(state, {
      sequence: 4,
      moveX: 1,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumpHeld: false,
      sprintHeld: false,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
    });

    const forwardSpeed = Math.hypot(forward.velocity.x, forward.velocity.z);
    const diagonalSpeed = Math.hypot(diagonal.velocity.x, diagonal.velocity.z);

    expect(diagonalSpeed).toBeCloseTo(forwardSpeed, 6);
  });

  it('sprints faster than walking when moving forward on the ground', () => {
    const state = makeState();
    let walking = state;
    let sprinting = state;
    const walkCommand = {
      sequence: 5,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumpHeld: false,
      sprintHeld: false,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
    } as const;
    const sprintCommand = {
      sequence: 6,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumpHeld: false,
      sprintHeld: true,
      crouchHeld: false,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
    } as const;
    for (let index = 0; index < 20; index += 1) {
      walking = simulatePlayerTick(walking, walkCommand);
      sprinting = simulatePlayerTick(sprinting, sprintCommand);
    }

    expect(
      Math.hypot(sprinting.velocity.x, sprinting.velocity.z)
    ).toBeGreaterThan(Math.hypot(walking.velocity.x, walking.velocity.z));
    expect(sprinting.sprinting).toBe(true);
  });

  it('crouches slower and prevents sprinting', () => {
    const state = makeState();
    const next = simulatePlayerTick(state, {
      sequence: 7,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      jumpHeld: false,
      sprintHeld: true,
      crouchHeld: true,
      scoped: false,
      fireHeld: false,
      reloadPressed: false,
      weaponSlot: 1,
    });

    expect(next.crouching).toBe(true);
    expect(next.sprinting).toBe(false);
  });
});
