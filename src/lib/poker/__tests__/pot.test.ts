import { describe, expect, it } from 'vitest';
import {
  computePots,
  potFractionLabel,
  potOdds,
  potOddsDetail,
  requiredSentence,
} from '../pot';

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

describe('lot 2 — potOddsDetail (toCall = ce qu’on AJOUTE, pas la mise totale)', () => {
  it('PB qui complète en heads-up : 25 %, et toCall = 1 (pas 2)', () => {
    // SB a déjà posté 1, BB a mis 2 : il faut AJOUTER 1 pour 25 %.
    const d = potOddsDetail({ collectedPot: 0, heroStreetBet: 1, villainBet: 2 });
    expect(d.toCall).toBe(1);
    expect(d.potBefore).toBe(3);
    expect(d.finalPot).toBe(4);
    expect(d.required).toBeCloseTo(0.25);
    // Surtout pas le libellé « 2× pot » : 25 % → ½ pot.
    expect(potFractionLabel(d.required)).toBe('½ pot');
    expect(potFractionLabel(d.required)).not.toBe('2× pot');
  });

  it('pot 100, sa mise 50 → ½ pot → 25 %', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 0, villainBet: 50 });
    expect(d.toCall).toBe(50);
    expect(d.required).toBeCloseTo(0.25);
    expect(potFractionLabel(d.required)).toBe('½ pot');
  });

  it('pot 100, sa mise 100 → pot → 33 %', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 0, villainBet: 100 });
    expect(d.required).toBeCloseTo(1 / 3);
    expect(potFractionLabel(d.required)).toBe('pot');
  });

  it('pot 100, sa mise 200 → 2× pot → 40 %', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 0, villainBet: 200 });
    expect(d.required).toBeCloseTo(0.4);
    expect(potFractionLabel(d.required)).toBe('2× pot');
  });

  it('le héros a misé 20, l’adversaire relance à 60 dans un pot de 100 : toCall = 40', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 20, villainBet: 60 });
    expect(d.toCall).toBe(40); // 60 − 20 déjà engagés, pas 60
    expect(d.potBefore).toBe(180);
    expect(d.required).toBeCloseTo(40 / 220);
  });
});

describe('requiredSentence — « Il mise » seulement si je n’ai rien engagé', () => {
  const raw = (c: number) => String(c);

  it('PB en HU : « Tu ajoutes », jamais « Il mise »', () => {
    const d = potOddsDetail({ collectedPot: 0, heroStreetBet: 1, villainBet: 2 });
    const s = requiredSentence(d, 1, raw);
    expect(s).toContain('Tu ajoutes');
    expect(s).not.toContain('Il mise');
  });

  it('relance (misé 20, il relance à 60 dans 100) : « Tu ajoutes 40 », pas « Il mise ¼ pot »', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 20, villainBet: 60 });
    const s = requiredSentence(d, 20, raw);
    expect(s).toContain('Tu ajoutes 40');
    expect(s).not.toContain('Il mise');
  });

  it('rien engagé dans la street : « Il mise ½ pot »', () => {
    const d = potOddsDetail({ collectedPot: 100, heroStreetBet: 0, villainBet: 50 });
    expect(requiredSentence(d, 0, raw)).toContain('Il mise ½ pot');
  });
});

describe('potFractionLabel', () => {
  it('mappe le % requis vers la fraction, null si trop loin d’une ligne', () => {
    expect(potFractionLabel(0.17)).toBe('¼ pot');
    expect(potFractionLabel(0.2)).toBe('⅓ pot');
    expect(potFractionLabel(0.25)).toBe('½ pot');
    expect(potFractionLabel(0.29)).toBe('⅔ pot');
    expect(potFractionLabel(0.33)).toBe('pot');
    expect(potFractionLabel(0.4)).toBe('2× pot');
    // Écart > 2 points → pas de libellé (on affiche juste « il te faut X % »).
    expect(potFractionLabel(0.5)).toBeNull();
    expect(potFractionLabel(0.36)).toBeNull();
  });
});
