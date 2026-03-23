import { describe, expect, it } from 'vitest';
import type { InputCommand, LocalPlayerState } from '@arena/shared';
import { PredictionController } from '../player/PredictionController';

const makeState = (): LocalPlayerState => ({
  identity: 'player',
  position: { x: 8, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  serverTick: 10,
  serverTimeMs: 500,
  yaw: 0,
  pitch: 0,
  onGround: true,
  alive: true,
  health: 100,
  ammo: 30,
  lastProcessedInput: 0,
  respawnTick: 0
});

const command = (sequence: number): InputCommand => ({
  sequence,
  moveX: 0,
  moveZ: 1,
  yaw: 0,
  pitch: 0,
  jumping: false,
  sprinting: false
});

describe('PredictionController', () => {
  it('replays only unacknowledged inputs after reconciliation', () => {
    const controller = new PredictionController(makeState());
    controller.queueInput(command(1));
    controller.queueInput(command(2));

    const reconciled = controller.reconcile({
      ...makeState(),
      position: { x: 8, y: 0, z: -0.02 },
      serverTick: 11,
      serverTimeMs: 550,
      lastProcessedInput: 1
    });

    expect(reconciled.lastProcessedInput).toBe(1);
    expect(controller.getDebugState().pendingInputs).toBe(1);
    expect(reconciled.position.z).toBeLessThan(-0.02);
  });

  it('ignores stale authoritative snapshots', () => {
    const controller = new PredictionController(makeState());
    controller.reconcile({
      ...makeState(),
      serverTick: 12,
      serverTimeMs: 600,
      lastProcessedInput: 1
    });

    const before = controller.getState();
    const after = controller.reconcile({
      ...makeState(),
      serverTick: 11,
      serverTimeMs: 550,
      lastProcessedInput: 0
    });

    expect(after).toEqual(before);
  });

  it('preserves fresher local look during reconciliation', () => {
    const controller = new PredictionController(makeState());
    controller.applyLook(0.35, -0.12);

    const reconciled = controller.reconcile({
      ...makeState(),
      serverTick: 11,
      serverTimeMs: 550,
      yaw: 0,
      pitch: 0,
      lastProcessedInput: 0
    });

    expect(reconciled.yaw).toBeCloseTo(-0.35);
    expect(reconciled.pitch).toBeCloseTo(0.12);
  });

  it('keeps local motion when server correction is very small', () => {
    const controller = new PredictionController(makeState());
    const predicted = controller.queueInput(command(1));

    const reconciled = controller.reconcile({
      ...makeState(),
      position: {
        x: predicted.position.x + 0.12,
        y: predicted.position.y,
        z: predicted.position.z - 0.08
      },
      serverTick: 11,
      serverTimeMs: 550,
      lastProcessedInput: 1
    });

    expect(reconciled.position.x).toBeCloseTo(predicted.position.x, 6);
    expect(reconciled.position.z).toBeCloseTo(predicted.position.z, 6);
    expect(reconciled.lastProcessedInput).toBe(1);
  });
});
