import { describe, expect, it } from 'vitest';
import type { InputCommand, LocalPlayerState } from '@arena/shared';
import { LocalPlayerController } from '../player/LocalPlayerController';

const makeState = (): LocalPlayerState => ({
  identity: 'player',
  position: { x: 8, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 10,
  serverTimeMs: 500,
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

const command = (sequence: number): InputCommand => ({
  sequence,
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

describe('LocalPlayerController', () => {
  it('advances local movement without waiting for an authoritative snapshot', () => {
    const controller = new LocalPlayerController(makeState());
    const moved = controller.step(command(1));

    expect(moved.position.z).toBeLessThan(0);
    expect(moved.lastProcessedInput).toBe(1);
  });

  it('reconciles to the authoritative server snapshot when input is acked', () => {
    const controller = new LocalPlayerController(makeState());
    controller.step(command(1));

    const { state, snapped } = controller.applyAuthoritativeSnapshot({
      ...makeState(),
      position: { x: 8, y: 0, z: 0 },
      serverTick: 11,
      serverTimeMs: 550,
      health: 87,
      lastProcessedInput: 1,
    });

    expect(snapped).toBe(false);
    expect(state.position.z).toBeCloseTo(0, 6);
    expect(state.health).toBe(87);
  });

  it('replays unacknowledged inputs after reconciliation', () => {
    const controller = new LocalPlayerController(makeState());
    controller.step(command(1));
    controller.step(command(2));

    const { state, snapped } = controller.applyAuthoritativeSnapshot({
      ...makeState(),
      position: { x: 8, y: 0, z: -0.02 },
      serverTick: 11,
      serverTimeMs: 550,
      lastProcessedInput: 1,
    });

    expect(snapped).toBe(false);
    expect(controller.getDebugState().pendingInputs).toBe(1);
    expect(state.position.z).toBeLessThan(-0.02);
  });

  it('hard-snaps on death and respawn transitions', () => {
    const controller = new LocalPlayerController(makeState());
    controller.step(command(1));

    const dead = controller.applyAuthoritativeSnapshot({
      ...makeState(),
      alive: false,
      health: 0,
      serverTick: 12,
      serverTimeMs: 600,
      lastProcessedInput: 1,
      respawnTick: 12,
    });
    expect(dead.snapped).toBe(true);
    expect(dead.state.alive).toBe(false);

    const respawned = controller.applyAuthoritativeSnapshot({
      ...makeState(),
      position: { x: -10, y: 0, z: 12 },
      serverTick: 20,
      serverTimeMs: 1000,
      lastProcessedInput: 0,
      respawnTick: 20,
    });
    expect(respawned.snapped).toBe(true);
    expect(respawned.state.position).toEqual({ x: -10, y: 0, z: 12 });
  });
});
