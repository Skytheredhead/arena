import { describe, expect, it } from 'vitest';
import {
  INPUT_BUTTON_FIRE,
  INPUT_BUTTON_MASK,
  type ActionEdges,
  type InputIntent,
  type SubmitInputPacket,
  type WeaponSlot,
} from '../netcode/contracts';
import { ReliableInputQueue } from '../netcode/ReliableInputQueue';
import { UINT32_MAX } from '../netcode/serial';

const intent = (overrides: Partial<InputIntent> = {}): InputIntent => ({
  clientTick: 1n,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  buttons: 0,
  desiredWeapon: 1,
  ...overrides,
});

const edges = (overrides: Partial<ActionEdges> = {}): ActionEdges => ({
  fire: 0,
  reload: 0,
  respawn: 0,
  weaponChanged: false,
  ...overrides,
});

describe('ReliableInputQueue', () => {
  it('sanitizes every untrusted input field before transport', () => {
    const queue = new ReliableInputQueue();
    const packet = queue.record(
      intent({
        clientTick: -5n,
        moveX: Number.POSITIVE_INFINITY,
        moveZ: -9,
        yaw: Number.NaN,
        pitch: 99,
        buttons: 0xffff,
        desiredWeapon: 99 as WeaponSlot,
      }),
      edges()
    );
    expect(packet.clientTick).toBe(0n);
    expect(packet.moveX).toBe(0);
    expect(packet.moveZ).toBe(-1);
    expect(packet.yaw).toBe(0);
    expect(packet.pitch).toBeLessThan(Math.PI / 2);
    expect(packet.buttons).toBe(INPUT_BUTTON_MASK);
    expect(packet.desiredWeapon).toBe(1);
  });

  it('keeps transient actions cumulative through send failure and retry', async () => {
    const queue = new ReliableInputQueue({ retryMs: 34 });
    const packet = queue.record(
      intent({ buttons: INPUT_BUTTON_FIRE }),
      edges({ fire: 1 })
    );
    await expect(
      queue.flush(
        () => Promise.reject(new Error('simulated packet interruption')),
        0
      )
    ).rejects.toThrow('simulated packet interruption');
    expect(queue.getLatestPacket()?.fireCounter).toBe(1);
    expect(queue.isDue(33)).toBe(false);

    const sent: number[] = [];
    await expect(
      queue.flush((retried) => {
        sent.push(retried.fireCounter);
        return Promise.resolve();
      }, 34)
    ).resolves.toBe(true);
    expect(sent).toEqual([1]);
    expect(queue.getUnacknowledgedInputs()).toHaveLength(1);

    queue.acknowledge({
      inputSeq: packet.seq,
      fireCounter: packet.fireCounter,
      reloadCounter: packet.reloadCounter,
      respawnCounter: packet.respawnCounter,
    });
    expect(queue.getUnacknowledgedInputs()).toHaveLength(0);
  });

  it('keeps cumulative action edges due across a transport reconnect', async () => {
    const queue = new ReliableInputQueue({ retryMs: 34 });
    const packet = queue.record(
      intent({ buttons: INPUT_BUTTON_FIRE }),
      edges({ fire: 1, reload: 1 })
    );

    queue.markDisconnected(500);

    expect(queue.getLatestPacket()).toMatchObject({
      seq: packet.seq,
      fireCounter: 1,
      reloadCounter: 1,
    });
    expect(queue.isDue(500)).toBe(true);

    const sent: SubmitInputPacket[] = [];
    await expect(
      queue.flush((retried) => {
        sent.push(retried);
        return Promise.resolve();
      }, 500)
    ).resolves.toBe(true);
    expect(sent).toEqual([packet]);
    expect(queue.getUnacknowledgedInputs()).toEqual([packet]);
  });

  it('never advances action counters beyond the server resend window', () => {
    const queue = new ReliableInputQueue({ maxPendingActions: 32 });
    const first = queue.record(intent(), edges({ fire: 40 }));
    expect(first.fireCounter).toBe(8);
    expect(queue.getStats()).toMatchObject({
      pendingFireEdges: 24,
      droppedActionEdges: 8,
    });

    queue.acknowledge({
      inputSeq: first.seq,
      fireCounter: 8,
      reloadCounter: 0,
      respawnCounter: 0,
    });
    const second = queue.record(intent({ clientTick: 2n }), edges());
    expect(second.fireCounter).toBe(16);
    expect(queue.getStats().pendingFireEdges).toBe(16);
  });

  it('acknowledges input history correctly across sequence rollover', () => {
    const queue = new ReliableInputQueue({
      initialInputSeq: UINT32_MAX - 1,
    });
    const beforeWrap = queue.record(intent(), edges());
    const afterWrap = queue.record(intent({ clientTick: 2n }), edges());
    expect(beforeWrap.seq).toBe(UINT32_MAX);
    expect(afterWrap.seq).toBe(0);

    queue.acknowledge({
      inputSeq: UINT32_MAX,
      fireCounter: 0,
      reloadCounter: 0,
      respawnCounter: 0,
    });
    expect(queue.getUnacknowledgedInputs().map((packet) => packet.seq)).toEqual(
      [0]
    );
    queue.acknowledge({
      inputSeq: 0,
      fireCounter: 0,
      reloadCounter: 0,
      respawnCounter: 0,
    });
    expect(queue.getUnacknowledgedInputs()).toHaveLength(0);
  });

  it('keeps resend and prediction history strictly bounded', () => {
    const queue = new ReliableInputQueue({ maxHistory: 8 });
    for (let tick = 1; tick <= 40; tick += 1) {
      queue.record(
        intent({ clientTick: BigInt(tick), moveX: tick / 40 }),
        edges()
      );
    }
    const history = queue.getUnacknowledgedInputs();
    expect(history).toHaveLength(8);
    expect(history.at(-1)?.seq).toBe(40);
  });
});
