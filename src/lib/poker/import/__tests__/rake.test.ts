import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import type { ParsedHand } from '../parse-pokerstars';
import { rakeByDistributedHand, rakeContributed, rakeSummary } from '../rake';

const hand = (p: Partial<ParsedHand>): ParsedHand =>
  ({
    id: 'h',
    sb: 1,
    bb: 2,
    ante: 0,
    maxSeats: 6,
    buttonSeat: 1,
    table: 'T',
    playedAt: null,
    seats: [],
    heroName: 'Hero',
    heroSeat: 1,
    heroCards: ['Ah', 'Kd'] as [Card, Card],
    board: ['2c', '7d', '9s'],
    actions: [],
    heroNet: 0,
    heroInvested: 0,
    rake: 0,
    totalPot: 0,
    playersDealt: 6,
    shown: {},
    ...p,
  }) as ParsedHand;

describe('rakeContributed', () => {
  it('part contribuée quand le héros a mis 1/4 du pot', () => {
    // rake 20 c, héros 100 c sur un total pot de 400 c → 20 × 1/4 = 5 c.
    expect(rakeContributed(hand({ rake: 20, heroInvested: 100, totalPot: 400 }))).toBe(5);
  });

  it('pot partagé : le rake porte sur le total pot, la part reste proportionnelle à l’investi', () => {
    // Deux gagnants, mais le héros a mis la moitié → la moitié du rake.
    expect(rakeContributed(hand({ rake: 10, heroInvested: 200, totalPot: 400 }))).toBe(5);
  });

  it('pot sans rake / total pot nul → 0', () => {
    expect(rakeContributed(hand({ rake: 0, heroInvested: 100, totalPot: 400 }))).toBe(0);
    expect(rakeContributed(hand({ rake: 10, heroInvested: 100, totalPot: 0 }))).toBe(0);
  });
});

describe('rakeByDistributedHand', () => {
  it('rake ÷ joueurs distribués', () => {
    expect(rakeByDistributedHand(hand({ rake: 12, playersDealt: 6 }))).toBe(2);
  });
});

describe('rakeSummary', () => {
  it('winrate brut = net + rake contribué ; rakeback ajuste le net', () => {
    const hands = [
      hand({ bb: 2, heroNet: -20, rake: 8, heroInvested: 100, totalPot: 200 }), // contribué 4
      hand({ bb: 2, heroNet: 10, rake: 4, heroInvested: 50, totalPot: 200 }), // contribué 1
    ];
    const s = rakeSummary(hands, 0.5);
    expect(s.rakeCents).toBe(5); // 4 + 1
    // net BB = -20/2 + 10/2 = -5 ; sur 2 mains → -250 BB/100.
    expect(s.netBB100).toBeCloseTo(-250);
    // rake BB = 4/2 + 1/2 = 2.5 ; brut = net + rake = -2.5 → -125 BB/100.
    expect(s.grossBB100).toBeCloseTo(-125);
    // rakeback 50 % : net ajusté = net + rake×0.5 = -5 + 1.25 = -3.75 → -187.5.
    expect(s.adjustedBB100).toBeCloseTo(-187.5);
    expect(s.rakebackCents).toBe(3); // round(5 × 0.5)
  });
});
