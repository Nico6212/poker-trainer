import { describe, expect, it } from 'vitest';
import { computePots, potOdds } from '../pot';

describe('computePots', () => {
  it('fait un seul pot quand tout le monde a investi pareil', () => {
    const pots = computePots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 200, eligibleSeats: [0, 1] }]);
  });

  it('crée un side pot quand un joueur est à tapis pour moins', () => {
    const pots = computePots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 100, folded: false },
      { seat: 2, total: 40, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 120, eligibleSeats: [0, 1, 2] },
      { amount: 120, eligibleSeats: [0, 1] },
    ]);
  });

  it('laisse les jetons d’un joueur couché dans le pot, sans éligibilité', () => {
    const pots = computePots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 100, folded: false },
      { seat: 2, total: 60, folded: true },
    ]);
    expect(pots).toEqual([{ amount: 260, eligibleSeats: [0, 1] }]);
  });

  it('gère deux all-in à des niveaux différents plus un couché', () => {
    const pots = computePots([
      { seat: 0, total: 200, folded: false },
      { seat: 1, total: 120, folded: false },
      { seat: 2, total: 50, folded: false },
      { seat: 3, total: 10, folded: true },
    ]);
    // Niveau 50 : 50×3 + 10 du couché = 160 ; niveau 120 : 70×2 ; niveau 200 : seul seat 0.
    expect(pots).toEqual([
      { amount: 160, eligibleSeats: [0, 1, 2] },
      { amount: 140, eligibleSeats: [0, 1] },
      { amount: 80, eligibleSeats: [0] },
    ]);
  });
});

describe('potOdds', () => {
  it('mise ½ pot → il faut 25 %', () => {
    // Pot 40 + sa mise 20 déjà au milieu = 60 ; ton call 20 → pot final 80.
    const odds = potOdds(20, 60);
    expect(odds.finalPot).toBe(80);
    expect(odds.required).toBeCloseTo(0.25);
  });

  it('mise pot → il faut 33 %', () => {
    // Pot 50 + sa mise 50 = 100 ; call 50 → pot final 150.
    const odds = potOdds(50, 100);
    expect(odds.required).toBeCloseTo(1 / 3);
  });

  it('rien à payer → 0 %', () => {
    expect(potOdds(0, 100).required).toBe(0);
  });
});
