import { describe, expect, it } from 'vitest';
import {
  ARENA_MAP,
  FIXED_MOVEMENT_DT,
  simulateMovementStep,
  type MovementState,
} from '../src/index.js';

const groundedState = (
  position: readonly [number, number, number] = [0, 0, 20]
): MovementState => ({
  position,
  velocity: [0, 0, 0],
  grounded: true,
});

describe('deterministic fixed-step movement', () => {
  it('moves forward relative to yaw and normalizes diagonal input', () => {
    const forward = simulateMovementStep(groundedState(), {
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      jumpHeld: false,
    });
    expect(forward.position[2]).toBeLessThan(20);

    let straight = groundedState();
    let diagonal = groundedState();
    for (let tick = 0; tick < 60; tick += 1) {
      straight = simulateMovementStep(straight, {
        moveX: 0,
        moveZ: 1,
        yaw: 0,
        jumpHeld: false,
      });
      diagonal = simulateMovementStep(diagonal, {
        moveX: 1,
        moveZ: 1,
        yaw: 0,
        jumpHeld: false,
      });
    }
    const straightDistance = Math.hypot(
      straight.position[0],
      straight.position[2] - 20
    );
    const diagonalDistance = Math.hypot(
      diagonal.position[0],
      diagonal.position[2] - 20
    );
    expect(diagonalDistance).toBeCloseTo(straightDistance, 4);
  });

  it('applies ground friction when input is released', () => {
    let moving: MovementState = {
      position: [0, 0, 20],
      velocity: [5, 0, 0],
      grounded: true,
    };
    for (let tick = 0; tick < 30; tick += 1) {
      moving = simulateMovementStep(moving, {
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        jumpHeld: false,
      });
    }
    expect(moving.velocity[0]).toBeCloseTo(0);
  });

  it('jumps, falls under gravity, and lands back on the floor', () => {
    let state = simulateMovementStep(groundedState(), {
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      jumpHeld: true,
    });
    expect(state.grounded).toBe(false);
    expect(state.velocity[1]).toBeGreaterThan(0);

    let peak = state.position[1];
    for (let tick = 0; tick < 180; tick += 1) {
      state = simulateMovementStep(state, {
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        jumpHeld: false,
      });
      peak = Math.max(peak, state.position[1]);
    }
    expect(peak).toBeGreaterThan(1);
    expect(state.grounded).toBe(true);
    expect(state.position[1]).toBeCloseTo(0);
  });

  it('climbs the authored roof ramp and reaches its platform height', () => {
    let state = groundedState([-29, 0, 0]);
    for (let tick = 0; tick < 150; tick += 1) {
      state = simulateMovementStep(state, {
        moveX: 1,
        moveZ: 0,
        yaw: 0,
        jumpHeld: false,
      });
    }
    expect(state.position[0]).toBeGreaterThan(-19);
    expect(state.position[1]).toBeGreaterThan(8.5);
  });

  it('stops at solid foundry walls but passes through authored entrances', () => {
    let wallState = groundedState([-10, 0, -16]);
    let doorState = groundedState([0, 0, -16]);
    for (let tick = 0; tick < 45; tick += 1) {
      const input = {
        moveX: 0,
        moveZ: 1,
        yaw: Math.PI,
        jumpHeld: false,
      };
      wallState = simulateMovementStep(wallState, input);
      doorState = simulateMovementStep(doorState, input);
    }
    expect(wallState.position[2]).toBeLessThanOrEqual(-14.95);
    expect(doorState.position[2]).toBeGreaterThan(-13);
  });

  it('clamps malformed time steps and remains inside playable bounds', () => {
    const start: MovementState = {
      position: [51.4, 0, 0],
      velocity: [1000, 0, 0],
      grounded: true,
    };
    const result = simulateMovementStep(
      start,
      {
        moveX: 1,
        moveZ: 0,
        yaw: 0,
        jumpHeld: false,
      },
      Number.POSITIVE_INFINITY
    );
    expect(result.position[0]).toBeLessThanOrEqual(
      ARENA_MAP.world.playableBounds.max[0] - ARENA_MAP.world.playerRadius
    );
    expect(
      simulateMovementStep(start, {
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        jumpHeld: false,
      }, 0)
    ).toBe(start);
  });

  it('produces stable results for identical fixed-step histories', () => {
    const run = (): MovementState => {
      let state = groundedState([0, 0, 20]);
      for (let tick = 0; tick < 120; tick += 1) {
        state = simulateMovementStep(
          state,
          {
            moveX: Math.sin(tick * 0.1),
            moveZ: 0.7,
            yaw: tick * 0.004,
            jumpHeld: tick === 20,
          },
          FIXED_MOVEMENT_DT
        );
      }
      return state;
    };
    expect(run()).toEqual(run());
  });
});
