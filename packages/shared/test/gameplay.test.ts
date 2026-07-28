import { describe, expect, it } from 'vitest';
import {
  MATCH_RULES,
  botSlotsRequired,
  matchEndReason,
  remainingMatchTicks,
  saturatingDamage,
  saturatingHeal,
  selectBotForHumanReplacement,
  sortStandings,
} from '../src/index.js';

describe('match and roster helpers', () => {
  it('ends at thirty eliminations or ten minutes', () => {
    expect(matchEndReason(29, MATCH_RULES.matchDurationTicks - 1)).toBeNull();
    expect(matchEndReason(30, 0)).toBe('elimination-limit');
    expect(matchEndReason(0, MATCH_RULES.matchDurationTicks)).toBe('time-limit');
    expect(remainingMatchTicks(-5)).toBe(MATCH_RULES.matchDurationTicks);
    expect(remainingMatchTicks(MATCH_RULES.matchDurationTicks + 1)).toBe(0);
  });

  it('fills every non-human slot with bots', () => {
    expect(botSlotsRequired(0)).toBe(12);
    expect(botSlotsRequired(1)).toBe(11);
    expect(botSlotsRequired(12)).toBe(0);
    expect(botSlotsRequired(99)).toBe(0);
    expect(botSlotsRequired(-10)).toBe(12);
  });

  it('replaces the newest bot deterministically across tick rollover', () => {
    expect(
      selectBotForHumanReplacement([
        { identity: 'bot-a', joinedTick: 0xffff_fffe },
        { identity: 'bot-b', joinedTick: 0xffff_ffff },
        { identity: 'bot-c', joinedTick: 0 },
      ])?.identity
    ).toBe('bot-c');
    expect(selectBotForHumanReplacement([])).toBeNull();
  });

  it('sorts final standings by kills, deaths, name, and identity', () => {
    const sorted = sortStandings([
      {
        identity: 'c',
        nickname: 'Zed',
        kills: 10,
        deaths: 4,
        connected: true,
        isBot: false,
      },
      {
        identity: 'b',
        nickname: 'Beta',
        kills: 12,
        deaths: 6,
        connected: true,
        isBot: true,
      },
      {
        identity: 'a',
        nickname: 'Alpha',
        kills: 12,
        deaths: 6,
        connected: true,
        isBot: false,
      },
    ]);
    expect(sorted.map((item) => item.identity)).toEqual(['a', 'b', 'c']);
  });

  it('saturates health changes and rejects non-finite values', () => {
    expect(saturatingDamage(100, 24)).toBe(76);
    expect(saturatingDamage(10, 100)).toBe(0);
    expect(saturatingDamage(Number.NaN, 10)).toBe(0);
    expect(saturatingHeal(90, 25)).toBe(100);
    expect(saturatingHeal(30, Number.POSITIVE_INFINITY)).toBe(30);
  });
});
