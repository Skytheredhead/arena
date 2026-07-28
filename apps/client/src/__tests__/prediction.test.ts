import { describe, expect, it } from 'vitest';
import {
  INPUT_BUTTON_JUMP,
  INPUT_BUTTON_SPRINT,
  type AuthoritativePlayerSnapshot,
  type SubmitInputPacket,
} from '../netcode/contracts';
import {
  PredictionController,
  type PredictedPlayerState,
} from '../netcode/PredictionController';

const initialState = (): PredictedPlayerState => ({
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  grounded: true,
  jumpHeld: false,
  lifeId: 1,
});

const packet = (
  seq: number,
  overrides: Partial<SubmitInputPacket> = {}
): SubmitInputPacket => ({
  seq,
  clientTick: BigInt(seq),
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  buttons: 0,
  desiredWeapon: 1,
  fireCounter: 0,
  reloadCounter: 0,
  respawnCounter: 0,
  ...overrides,
});

const authoritative = (
  overrides: Partial<AuthoritativePlayerSnapshot> = {}
): AuthoritativePlayerSnapshot => ({
  id: 'local',
  roomId: 'room',
  nickname: 'Tester',
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
  serverTick: 1,
  ackInputSeq: 0,
  ackFireCounter: 0,
  ackReloadCounter: 0,
  ackRespawnCounter: 0,
  lifeId: 1,
  ...overrides,
});

describe('PredictionController', () => {
  it('matches authoritative forward and sprint conventions', () => {
    const walk = new PredictionController(initialState()).predict(
      packet(1, { moveZ: 1 })
    );
    expect(walk.velocity.z).toBeCloseTo(-6.1, 6);
    expect(walk.position.z).toBeCloseTo(-6.1 / 60, 6);
    expect(walk.velocity.x).toBeCloseTo(0, 6);

    const sprint = new PredictionController(initialState()).predict(
      packet(1, {
        moveZ: 1,
        buttons: INPUT_BUTTON_SPRINT,
      })
    );
    expect(sprint.velocity.z).toBeCloseTo(-8, 6);
    expect(sprint.position.z).toBeCloseTo(-8 / 60, 6);
  });

  it('uses the authoritative jump and gravity constants', () => {
    const controller = new PredictionController(initialState());
    const jumped = controller.predict(
      packet(1, { buttons: INPUT_BUTTON_JUMP })
    );
    expect(jumped.velocity.y).toBeCloseTo(6.2, 6);
    expect(jumped.position.y).toBeCloseTo(6.2 / 60, 6);
    expect(jumped.grounded).toBe(false);

    const falling = controller.predict(packet(2));
    expect(falling.velocity.y).toBeCloseTo(6.2 - 18.5 / 60, 6);
  });

  it('drops acknowledged history and replays only newer inputs', () => {
    const controller = new PredictionController(initialState());
    const first = controller.predict(packet(1, { moveZ: 1 }));
    const before = controller.predict(packet(2, { moveZ: 1 }));
    const result = controller.reconcile(
      authoritative({
        position: first.position,
        velocity: first.velocity,
        ackInputSeq: 1,
      })
    );
    expect(result.replayedInputs).toBe(1);
    expect(result.hardSnapped).toBe(false);
    expect(controller.historyLength).toBe(1);
    expect(controller.getSimulationState().position.z).toBeCloseTo(
      before.position.z,
      6
    );
  });

  it('hard-snaps and discards old-life history on respawn', () => {
    const controller = new PredictionController(initialState());
    controller.predict(packet(1, { moveZ: 1 }));
    const result = controller.reconcile(
      authoritative({
        position: { x: 12, y: 2, z: -8 },
        lifeId: 2,
        ackInputSeq: 1,
      })
    );
    expect(result.hardSnapped).toBe(true);
    expect(result.replayedInputs).toBe(0);
    expect(controller.getSimulationState().position).toEqual({
      x: 12,
      y: 2,
      z: -8,
    });
  });
});
