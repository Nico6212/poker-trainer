import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { findOuts, hitOdds, ruleOf2and4, ruleOf2and4Corrected } from '../outs';

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

  it('correction 3n+8 au-delà de 8 outs sur deux cartes (le ×4 surévalue)', () => {
    // ≤ 8 outs : la règle brute (×2 / ×4) est conservée.
    expect(ruleOf2and4Corrected(8, 2)).toBeCloseTo(0.32);
    expect(ruleOf2and4Corrected(8, 1)).toBeCloseTo(0.16);
    // > 8 outs, deux cartes : 3n+8, plus proche de l'exact.
    expect(ruleOf2and4Corrected(9, 2)).toBeCloseTo(0.35); // vs 36 % brut, exact ≈ 35 %
    expect(ruleOf2and4Corrected(15, 2)).toBeCloseTo(0.53); // vs 60 % brut, exact ≈ 54 %
    // > 8 outs mais UNE seule carte : pas de correction (le ×2 ne surévalue pas).
    expect(ruleOf2and4Corrected(12, 1)).toBeCloseTo(0.24);
    // Plafonné à 100 %.
    expect(ruleOf2and4Corrected(25, 2)).toBeLessThanOrEqual(1);
  });
});
