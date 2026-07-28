import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_HISTORY,
  acknowledgeInputHistory,
  addUint32,
  appendInputBounded,
  clampLagCompensatedTick,
  coalesceInputFrames,
  compareUint32,
  createReliableInputEntry,
  elapsedUint32,
  isAtOrAfterUint32,
  isNewerUint32,
  markInputSent,
  nextUint32,
  retryDelayMs,
  sanitizeChatMessage,
  sanitizeNickname,
  sanitizePlayerInput,
  selectInputRetryBatch,
  type PlayerInputFrame,
} from '../src/index.js';

const frame = (
  sequence: number,
  overrides: Partial<PlayerInputFrame> = {}
): PlayerInputFrame =>
  sanitizePlayerInput({
    sequence,
    clientTick: sequence,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    jumpHeld: false,
    firePressed: false,
    reloadPressed: false,
    scopeHeld: false,
    weaponSlot: 1,
    ...overrides,
  });

describe('wrap-safe ordering', () => {
  it('orders sequences correctly through uint32 rollover', () => {
    expect(nextUint32(0xffff_ffff)).toBe(0);
    expect(addUint32(0xffff_fffe, 4)).toBe(2);
    expect(isNewerUint32(0, 0xffff_ffff)).toBe(true);
    expect(isNewerUint32(2, 0xffff_fffe)).toBe(true);
    expect(isAtOrAfterUint32(0, 0xffff_ffff)).toBe(true);
    expect(compareUint32(0xffff_ffff, 0)).toBe(-1);
    expect(elapsedUint32(3, 0xffff_fffe)).toBe(5);
  });
});

describe('input sanitization and reliability', () => {
  it('clamps malformed values, normalizes movement, and rejects truthy impostors', () => {
    const result = sanitizePlayerInput({
      sequence: Number.POSITIVE_INFINITY,
      clientTick: -1,
      moveX: 100,
      moveZ: 100,
      yaw: 19 * Math.PI,
      pitch: Number.NaN,
      jumpHeld: 1,
      firePressed: 'yes',
      reloadPressed: true,
      scopeHeld: false,
      weaponSlot: 99,
    });
    expect(result.sequence).toBe(0);
    expect(result.clientTick).toBe(0xffff_ffff);
    expect(Math.hypot(result.moveX, result.moveZ)).toBeCloseTo(1);
    expect(result.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(result.yaw).toBeLessThanOrEqual(Math.PI);
    expect(result.pitch).toBe(0);
    expect(result.jumpHeld).toBe(false);
    expect(result.firePressed).toBe(false);
    expect(result.reloadPressed).toBe(true);
    expect(result.weaponSlot).toBe(1);
  });

  it('coalesces movement while preserving transient fire and reload edges', () => {
    const older = frame(10, { firePressed: true, moveX: -1 });
    const newer = frame(11, { reloadPressed: true, moveX: 1 });
    const result = coalesceInputFrames(older, newer);
    expect(result.sequence).toBe(11);
    expect(result.moveX).toBe(1);
    expect(result.firePressed).toBe(true);
    expect(result.reloadPressed).toBe(true);
  });

  it('bounds history without dropping action intent', () => {
    let history: PlayerInputFrame[] = [];
    for (let sequence = 0; sequence < MAX_INPUT_HISTORY + 20; sequence += 1) {
      history = appendInputBounded(
        history,
        frame(sequence, {
          firePressed: sequence === 0,
          reloadPressed: sequence === 5,
        })
      );
    }
    expect(history).toHaveLength(MAX_INPUT_HISTORY);
    expect(history.some((item) => item.firePressed)).toBe(true);
    expect(history.some((item) => item.reloadPressed)).toBe(true);
    expect(history.at(-1)?.sequence).toBe(MAX_INPUT_HISTORY + 19);
  });

  it('acknowledges frames correctly across rollover', () => {
    const history = [
      frame(0xffff_fffe),
      frame(0xffff_ffff),
      frame(0),
      frame(1),
    ];
    expect(
      acknowledgeInputHistory(history, 0xffff_ffff).map(
        (item) => item.sequence
      )
    ).toEqual([0, 1]);
    expect(
      acknowledgeInputHistory(history, 0).map((item) => item.sequence)
    ).toEqual([1]);
  });

  it('uses bounded exponential retries and batches due entries', () => {
    const unsent = createReliableInputEntry(frame(1));
    const sentOnce = markInputSent(createReliableInputEntry(frame(2)), 100);
    const sentTwice = markInputSent(markInputSent(createReliableInputEntry(frame(3)), 100), 140);
    expect(retryDelayMs(1)).toBe(40);
    expect(retryDelayMs(2)).toBe(80);
    expect(retryDelayMs(20)).toBe(400);
    expect(selectInputRetryBatch([unsent, sentOnce, sentTwice], 179)).toEqual([
      unsent,
      sentOnce,
    ]);
    expect(selectInputRetryBatch([unsent, sentOnce, sentTwice], 220, 2)).toHaveLength(
      2
    );
  });

  it('clamps lag compensation to the server-owned rewind window', () => {
    expect(clampLagCompensatedTick(1000, 995)).toBe(995);
    expect(clampLagCompensatedTick(1000, 900)).toBe(988);
    expect(clampLagCompensatedTick(1000, 1001)).toBe(1000);
    expect(clampLagCompensatedTick(3, 0xffff_ffff)).toBe(0xffff_ffff);
    expect(clampLagCompensatedTick(3, 0xffff_ff00)).toBe(0xffff_fff7);
  });

  it('sanitizes nicknames and chat for display and transport', () => {
    expect(sanitizeNickname('  <b>Nova\u0000 Pilot</b>  ')).toBe(
      'Nova Pilot'
    );
    expect(sanitizeNickname('<>')).toBe('OPERATOR');
    expect(sanitizeNickname('abcdefghijklmnopq')).toHaveLength(16);
    expect(sanitizeChatMessage('  hello   <script>\nworld  ')).toBe(
      'hello \nworld'
    );
    expect(sanitizeChatMessage('x'.repeat(500))).toHaveLength(160);
  });
});
