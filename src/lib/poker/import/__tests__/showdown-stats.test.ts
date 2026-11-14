import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import type { ParsedAction, ParsedHand } from '../parse-pokerstars';
import { classifyShownStrength, showdownStats, wilson } from '../showdown-stats';

const C = (s: string) => s as Card;
const h2 = (a: string, b: string): [Card, Card] => [C(a), C(b)];
const board = (...cs: string[]) => cs.map(C);

describe('classifyShownStrength — force relative au board', () => {
  it('board K-K-7 + 9-9 → paire moyenne (pas deux paires)', () => {
    expect(classifyShownStrength(h2('9h', '9d'), board('Kh', 'Kd', '7c'), true)).toBe('middlePair');
  });
  it('board K-K-7 + K-x → brelan (deux paires+)', () => {
    expect(classifyShownStrength(h2('Ks', '2d'), board('Kh', 'Kd', '7c'), true)).toBe('twoPairPlus');
  });
  it('board 8-8-5-5-2 + A-x → air', () => {
    expect(classifyShownStrength(h2('Ah', 'Kd'), board('8h', '8d', '5c', '5s', '2c'), false)).toBe('air');
  });
  it('overpair / top paire / deux paires réelles / tirage', () => {
    expect(classifyShownStrength(h2('Ah', 'Ad'), board('8h', '7d', '2c'), true)).toBe('overpair');
    expect(classifyShownStrength(h2('Ks', 'Qd'), board('Kh', '7d', '2c'), true)).toBe('topPair');
    expect(classifyShownStrength(h2('As', '9h'), board('Ah', '9d', '7c', '2s', '3h'), false)).toBe('twoPairPlus');
    expect(classifyShownStrength(h2('Ah', 'Kh'), board('2h', '7h', '9c'), true)).toBe('draw');
  });
});

describe('wilson', () => {
  it('15/20 → centre ~0,75, intervalle plausible', () => {
    const w = wilson(15, 20);
    expect(w.low).toBeGreaterThan(0.5);
    expect(w.high).toBeLessThan(0.91);
  });
});

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
    heroCards: ['2c', '3d'] as [Card, Card],
    board: board('Kh', 'Kd', '7c', '4s', '8h'),
    actions: [],
    heroNet: 0,
    heroInvested: 0,
    rake: 0,
    totalPot: 0,
    playersDealt: 2,
    shown: {},
    ...p,
  }) as ParsedHand;

const riverRaise = (): ParsedAction => ({ street: 'river', seat: 2, name: 'v', type: 'raise', amount: 0 });

describe('showdownStats', () => {
  it('20 relances river, 15 montrent deux paires+ → 75 % + Wilson', () => {
    const strong = Array.from({ length: 15 }, () =>
      hand({ shown: { 2: h2('Ks', '2d') }, actions: [riverRaise()] }),
    ); // Kx sur board K-K-7… → brelan
    const weak = Array.from({ length: 5 }, () =>
      hand({ shown: { 2: h2('9h', '9d') }, actions: [riverRaise()] }),
    ); // 99 → paire moyenne
    const stats = showdownStats([...strong, ...weak]);
    const rr = stats.find((s) => s.action === 'raiseRiver')!;
    expect(rr.showdowns).toBe(20);
    expect(rr.counts.twoPairPlus).toBe(15);
    expect(rr.twoPairPlusRate).toBeCloseTo(0.75);
    expect(rr.wilsonLow).toBeGreaterThan(0.5);
  });

  it('ignore les relances PRÉFLOP (seules les actions postflop comptent)', () => {
    const h = hand({
      shown: { 2: h2('Ah', 'Kd') },
      actions: [{ street: 'preflop', seat: 2, name: 'v', type: 'raise', amount: 0 }],
    });
    expect(showdownStats([h])).toHaveLength(0);
  });

  it('bluff montré (gain sans abattage contesté) : compté à part, hors calibration', () => {
    const h = hand({
      shown: { 2: h2('Qd', '3s') }, // air
      actions: [
        { street: 'river', seat: 2, name: 'v', type: 'bet', amount: 0 },
        { street: 'river', seat: 2, name: 'v', type: 'uncalled', amount: 0 },
      ],
    });
    const s = showdownStats([h]).find((x) => x.action === 'betRiverAfterPassive');
    expect(s?.bluffsShown).toBe(1);
    expect(s?.showdowns).toBe(0); // pas un abattage contesté
  });

  it('une observation par action : relance flop + tapis river = deux observations', () => {
    const h = hand({
      shown: { 2: h2('Ks', '2d') },
      actions: [
        { street: 'flop', seat: 2, name: 'v', type: 'raise', amount: 0 },
        { street: 'river', seat: 2, name: 'v', type: 'bet', amount: 0, allIn: true },
      ],
    });
    const stats = showdownStats([h]);
    expect(stats.find((s) => s.action === 'raiseFlop')?.showdowns).toBe(1);
    expect(stats.find((s) => s.action === 'jamRiver')?.showdowns).toBe(1);
  });
});
