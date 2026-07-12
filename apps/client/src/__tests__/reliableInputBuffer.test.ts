import { describe, expect, it } from 'vitest';
import type { InputCommand } from '@arena/shared';
import { ReliableInputBuffer } from '../netcode/ReliableInputBuffer';

const command = (
  sequence: number,
  patch: Partial<InputCommand> = {}
): InputCommand => ({
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
  ...patch,
});

describe('ReliableInputBuffer', () => {
  it('retains sent inputs until an authoritative sequence acknowledges them', () => {
    const buffer = new ReliableInputBuffer();
    buffer.enqueue(command(1), 0);
    buffer.enqueue(command(2), 1);

    expect(buffer.takeDue(1)?.commands.map((item) => item.sequence)).toEqual([
      1, 2,
    ]);
    expect(buffer.size()).toBe(2);
    expect(buffer.acknowledge(1)).toBe(1);
    expect(buffer.size()).toBe(1);
    expect(buffer.acknowledge(2)).toBe(1);
    expect(buffer.size()).toBe(0);
  });

  it('retries an unacknowledged latest snapshot after backoff', () => {
    const buffer = new ReliableInputBuffer({ retryBaseMs: 100 });
    buffer.enqueue(command(7), 0);
    expect(buffer.takeDue(0)?.retry).toBe(false);
    expect(buffer.takeDue(99)).toBeNull();

    const retry = buffer.takeDue(100);
    expect(retry?.retry).toBe(true);
    expect(retry?.commands).toHaveLength(1);
    expect(retry?.commands[0]?.sequence).toBe(7);
  });

  it('forces a retry after a reducer failure', () => {
    const buffer = new ReliableInputBuffer({ retryBaseMs: 1_000 });
    buffer.enqueue(command(3), 0);
    buffer.takeDue(0);
    buffer.markSendFailed();

    expect(buffer.takeDue(1)?.commands[0]?.sequence).toBe(3);
  });

  it('compacts reconnect backlogs without turning a released click into autofire', () => {
    const buffer = new ReliableInputBuffer({ maxSendBurst: 2 });
    buffer.enqueue(command(10, { fireHeld: true }), 0);
    buffer.enqueue(command(11, { fireHeld: false }), 50);
    buffer.enqueue(command(12, { moveX: 1, moveZ: 0 }), 100);

    const batch = buffer.takeDue(100);
    expect(batch?.commands).toHaveLength(2);
    expect(batch?.commands[0]).toMatchObject({
      sequence: 10,
      fireHeld: true,
    });
    expect(batch?.commands[1]).toMatchObject({
      sequence: 12,
      moveX: 1,
      moveZ: 0,
      fireHeld: false,
    });
  });

  it('retries an unacked click and its release as separate ordered levels', () => {
    const buffer = new ReliableInputBuffer({ retryBaseMs: 100 });
    buffer.enqueue(command(30, { fireHeld: true }), 0);
    buffer.enqueue(command(31, { fireHeld: false }), 1);
    buffer.takeDue(1);

    const retry = buffer.takeDue(101);
    expect(retry?.retry).toBe(true);
    expect(retry?.commands.map((item) => [item.sequence, item.fireHeld])).toEqual(
      [
        [30, true],
        [31, false],
      ]
    );
  });

  it('bounds long pending histories by compacting to the newest sequence', () => {
    const buffer = new ReliableInputBuffer({ capacity: 3 });
    buffer.enqueue(command(20, { reloadPressed: true }), 0);
    buffer.enqueue(command(21), 50);
    buffer.enqueue(command(22), 100);
    buffer.enqueue(command(23), 150);

    expect(buffer.size()).toBe(1);
    expect(buffer.takeDue(150)?.commands[0]).toMatchObject({
      sequence: 23,
      reloadPressed: true,
    });
  });

  it('acknowledges sequences correctly across uint32 wrap', () => {
    const buffer = new ReliableInputBuffer();
    buffer.enqueue(command(0xffff_ffff), 0);
    buffer.enqueue(command(0), 1);
    buffer.takeDue(1);

    buffer.acknowledge(0);
    expect(buffer.size()).toBe(0);
  });
});
