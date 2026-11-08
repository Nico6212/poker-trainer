import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { findOuts, hitOdds, ruleOf2and4 } from '../outs';

describe('findOuts', () => {
  it('tirage couleur : exactement les 9 cœurs restants', () => {
    const { outs, aheadNow } = findOuts({
      hero: ['6h', '5h'],
      board: ['Ah', '9h', '2c'],
      villainCombos: [['Kc', 'Kd']],
    });
    expect(aheadNow).toBe(false);
    const hearts: Card[] = ['Kh', 'Qh', 'Jh', 'Th', '8h', '7h', '4h', '3h', '2h'];
    expect([...outs].sort()).toEqual([...hearts].sort());
  });

  it('tirage quinte par les deux bouts : 8 outs', () => {
    const { outs } = findOuts({
      hero: ['8c', '7d'],
      board: ['Th', '9s', '2c'],
      villainCombos: [['Ah', 'Ad']],
    });
    expect(outs).toHaveLength(8);
    expect(outs.every((c) => c[0] === 'J' || c[0] === '6')).toBe(true);
  });

  it('déjà devant : pas d’outs à compter', () => {
    const { outs, aheadNow } = findOuts({
      hero: ['Ah', 'Ad'],
      board: ['Kc', '7s', '2d'],
      villainCombos: [['Qc', 'Qd']],
    });
    expect(aheadNow).toBe(true);
    expect(outs).toEqual([]);
  });

  it('ne calcule rien préflop ou à la river', () => {
    expect(
      findOuts({ hero: ['Ah', 'Ad'], board: [], villainCombos: null }).outs,
    ).toEqual([]);
    expect(
      findOuts({
        hero: ['Ah', 'Ad'],
        board: ['Kc', '7s', '2d', '3c', '9h'],
        villainCombos: null,
      }).outs,
    ).toEqual([]);
  });
});

describe('hitOdds et règle du 2 et du 4', () => {
  it('9 outs au flop : ≈ 18 % sur une carte, ≈ 35 % sur deux', () => {
    expect(hitOdds(9, 47, 1)).toBeCloseTo(0.191, 2);
    expect(hitOdds(9, 47, 2)).toBeCloseTo(0.35, 2);
    expect(ruleOf2and4(9, 1)).toBeCloseTo(0.18);
    expect(ruleOf2and4(9, 2)).toBeCloseTo(0.36);
  });
});
