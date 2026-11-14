import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import { buildCalibration, PRIOR_STRONG, weakRange } from '../calibration';
import type { ParsedAction, ParsedHand } from '../parse-pokerstars';

const C = (s: string) => s as Card;

const hand = (shown: [Card, Card], action: ParsedAction): ParsedHand =>
  ({
    id: Math.random().toString(), // ids distincts (non déterministe OK : pas de dédoublonnage ici)
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
    heroCards: [C('2c'), C('3d')],
    board: [C('Kh'), C('Kd'), C('7c'), C('4s'), C('8h')],
    actions: [action],
    heroNet: 0,
    heroInvested: 0,
    rake: 0,
    totalPot: 0,
    playersDealt: 2,
    shown: { 2: shown },
  }) as ParsedHand;

const riverRaise = (): ParsedAction => ({ street: 'river', seat: 2, name: 'v', type: 'raise', amount: 0 });
const strong = () => hand([C('Ks'), C('2d')], riverRaise()); // Kx sur KK7 → brelan (deux paires+)
const weak = () => hand([C('9h'), C('9d')], riverRaise()); // 99 → paire moyenne

describe('buildCalibration', () => {
  it('≥ 15 abattages : p entre observé et a priori', () => {
    const hands = [...Array.from({ length: 15 }, strong), ...Array.from({ length: 5 }, weak)];
    const p = buildCalibration(hands).strongFraction('raiseRiver', 2);
    // n=20, w = 20/50 = 0,4 ; observé 0,75 → p = 0,4×0,75 + 0,6×1 = 0,9
    expect(p).toBeCloseTo(0.9, 2);
    expect(p).toBeLessThan(PRIOR_STRONG);
  });

  it('< 15 abattages : a priori strict (p = 1)', () => {
    const few = Array.from({ length: 10 }, strong);
    expect(buildCalibration(few).strongFraction('raiseRiver', 2)).toBe(PRIOR_STRONG);
    expect(buildCalibration([]).strongFraction('raiseRiver', 2)).toBe(PRIOR_STRONG);
  });

  it('weakMix reflète la répartition observée des mains faibles', () => {
    const hands = [...Array.from({ length: 15 }, strong), ...Array.from({ length: 5 }, weak)];
    const mix = buildCalibration(hands).weakMix('raiseRiver', 2);
    expect(mix.pair).toBeCloseTo(1); // les 5 faibles sont des paires moyennes (river → pas de tirage)
    expect(mix.draw).toBe(0);
  });
});

describe('weakRange', () => {
  it('produit des combos reflétant le mélange', () => {
    const combos = weakRange([C('2h'), C('7d'), C('Kc')], [C('As'), C('Ad')], { pair: 0.5, draw: 0.3, air: 0.2 });
    expect(combos.length).toBeGreaterThan(20);
  });
});
