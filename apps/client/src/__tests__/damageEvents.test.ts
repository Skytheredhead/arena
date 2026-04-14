import { describe, expect, it } from 'vitest';
import type { DamageEvent } from '@arena/shared';
import {
  isDamageEventCurrentForLocalPlayer,
  shouldAcceptDamageEventForRoom
} from '../netcode/damageEvents';

const event = (overrides: Partial<DamageEvent> = {}): DamageEvent => ({
  id: 1,
  roomCode: 'ARENA',
  attackerIdentity: 'attacker',
  victimIdentity: 'local',
  amount: 100,
  tick: 12,
  causedDeath: true,
  ...overrides
});

describe('damage event gating', () => {
  it('ignores historical room events from the initial subscription snapshot', () => {
    expect(
      shouldAcceptDamageEventForRoom({
        roomCode: 'ARENA',
        tick: 20,
        trackedRoomCode: 'ARENA',
        baselineTick: 20
      })
    ).toBe(false);
  });

  it('accepts only fresh damage events for the connected room', () => {
    expect(
      shouldAcceptDamageEventForRoom({
        roomCode: 'ARENA',
        tick: 21,
        trackedRoomCode: 'ARENA',
        baselineTick: 20
      })
    ).toBe(true);
    expect(
      shouldAcceptDamageEventForRoom({
        roomCode: 'OTHER',
        tick: 21,
        trackedRoomCode: 'ARENA',
        baselineTick: 20
      })
    ).toBe(false);
  });

  it('does not let old death events override a later respawn', () => {
    expect(isDamageEventCurrentForLocalPlayer(event({ tick: 30 }), 'ARENA', 31)).toBe(false);
    expect(isDamageEventCurrentForLocalPlayer(event({ tick: 31 }), 'ARENA', 31)).toBe(true);
  });
});
