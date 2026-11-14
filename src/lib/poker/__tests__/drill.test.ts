import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards';
import {
  generateDrill,
  gradeDrill,
  masteryLevel,
  requiredForFraction,
  TARGET_MS,
  type DrillQuestion,
} from '../drill';
import { shouldCallPush, shouldPush, type CallChart, type PushChart } from '../pushfold';

describe('requiredForFraction', () => {
  it('retrouve la table des tailles standard', () => {
    expect(requiredForFraction(1 / 3)).toBeCloseTo(0.2);
    expect(requiredForFraction(1 / 2)).toBeCloseTo(0.25);
    expect(requiredForFraction(1)).toBeCloseTo(1 / 3);
    expect(requiredForFraction(2)).toBeCloseTo(0.4);
  });
});

describe('generateDrill', () => {
  it('potOdds : la réponse est bien call ÷ pot final', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = generateDrill('potOdds', mulberry32(seed));
      if (q.kind !== 'potOdds') throw new Error('mauvais type');
      expect(q.answerPct).toBeCloseTo(q.call / (q.pot + q.bet + q.call));
      expect(q.answerPct).toBeGreaterThan(0.1);
      expect(q.answerPct).toBeLessThan(0.45);
    }
  });

  it('outs : toujours un vrai tirage, 2 à 15 outs, et jamais de brelan caché', () => {
    for (let seed = 0; seed < 30; seed++) {
      const q = generateDrill('outs', mulberry32(seed));
      if (q.kind !== 'outs') throw new Error('mauvais type');
      expect(q.answer).toBe(q.outs.length);
      expect(q.answer).toBeGreaterThanOrEqual(2);
      expect(q.answer).toBeLessThanOrEqual(15);
      expect(q.board.length === 3 || q.board.length === 4).toBe(true);
      // La paire adverse est affichée et ne touche pas le board (pas de brelan surprise).
      expect(q.villain[0][0]).toBe(q.villain[1][0]);
      expect(q.board.some((c) => c[0] === q.villain[0][0])).toBe(false);
    }
  });

  it('openRange : la réponse correspond à la range de la position', () => {
    let yes = 0;
    for (let seed = 0; seed < 60; seed++) {
      const q = generateDrill('openRange', mulberry32(seed));
      if (q.kind !== 'openRange') throw new Error('mauvais type');
      if (q.answer) yes++;
    }
    // Mélange de oui et de non (ranges entre ~15 % et ~45 % des mains).
    expect(yes).toBeGreaterThan(5);
    expect(yes).toBeLessThan(40);
  });

  it('equity : déterministe à graine fixée et borné', () => {
    const q1 = generateDrill('equity', mulberry32(42));
    const q2 = generateDrill('equity', mulberry32(42));
    expect(q1).toEqual(q2);
    if (q1.kind !== 'equity') throw new Error('mauvais type');
    expect(q1.answerPct).toBeGreaterThan(0);
    expect(q1.answerPct).toBeLessThan(1);
  });

  it('pushFold : la réponse est conforme aux tableaux', () => {
    for (let seed = 0; seed < 40; seed++) {
      const q = generateDrill('pushFold', mulberry32(seed));
      if (q.kind !== 'pushFold') throw new Error('mauvais type');
      expect(q.stackBB).toBeGreaterThanOrEqual(3);
      expect(q.stackBB).toBeLessThanOrEqual(13);
      const expected =
        q.mode === 'push'
          ? shouldPush(q.hand, q.chart as PushChart, q.stackBB)
          : shouldCallPush(q.hand, q.chart as CallChart, q.stackBB);
      expect(q.answer).toBe(expected);
    }
  });

  it('betSize : les cinq variantes sortent et respectent les recettes', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const q = generateDrill('betSize', mulberry32(seed));
      if (q.kind !== 'betSize') throw new Error('mauvais type');
      seen.add(q.variant);
      if (q.variant === 'amount') {
        expect(q.answerBB).toBeGreaterThanOrEqual(q.potBB / 3 - 0.1);
        expect(q.answerBB).toBeLessThanOrEqual(q.potBB + 0.1);
      } else if (q.variant === 'fraction') {
        expect(q.options).toContain(q.answerLabel);
      } else if (q.variant === 'open') {
        expect(q.answerBB).toBe(3 + q.limpers);
      } else if (q.variant === 'threebet') {
        expect(q.answerBB).toBe(((q.inPosition ? 3 : 4) + q.callers) * q.openBB);
      } else {
        expect(q.answerPct).toBeCloseTo(q.betBB / (q.betBB + q.potBB));
      }
    }
    expect(seen.size).toBe(5);
  });

  it('betSize : notation avec les bonnes tolérances', () => {
    const amount: DrillQuestion = {
      kind: 'betSize',
      variant: 'amount',
      potBB: 12,
      fractionLabel: '⅔ pot',
      answerBB: 8,
    };
    expect(gradeDrill(amount, 8).ok).toBe(true);
    expect(gradeDrill(amount, 8.7).ok).toBe(true); // ±max(0,5 ; 10 %)
    expect(gradeDrill(amount, 9).ok).toBe(false); // 9 = ¾ pot : fraction voisine rejetée

    // Recette exacte : oublier le limpeur doit être compté faux.
    const open: DrillQuestion = { kind: 'betSize', variant: 'open', limpers: 1, answerBB: 4 };
    expect(gradeDrill(open, 4).ok).toBe(true);
    expect(gradeDrill(open, 3).ok).toBe(false);
    expect(gradeDrill(open, 5).ok).toBe(false);

    // Oublier le « +1× par suiveur » hors position doit être compté faux.
    const threebet: DrillQuestion = {
      kind: 'betSize',
      variant: 'threebet',
      openBB: 4,
      inPosition: false,
      callers: 1,
      answerBB: 20,
    };
    expect(gradeDrill(threebet, 20).ok).toBe(true);
    expect(gradeDrill(threebet, 18).ok).toBe(true); // arrondi raisonnable
    expect(gradeDrill(threebet, 16).ok).toBe(false); // suiveur oublié

    const fraction: DrillQuestion = {
      kind: 'betSize',
      variant: 'fraction',
      targetPct: 29,
      answerLabel: '⅔ pot',
      options: ['⅓ pot', '½ pot', '⅔ pot', 'pot', '2× pot'],
    };
    expect(gradeDrill(fraction, '⅔ pot').ok).toBe(true);
    expect(gradeDrill(fraction, '½ pot').ok).toBe(false);

    const bluff: DrillQuestion = {
      kind: 'betSize',
      variant: 'bluff',
      betBB: 6,
      potBB: 9,
      answerPct: 0.4,
    };
    expect(gradeDrill(bluff, 40).ok).toBe(true);
    expect(gradeDrill(bluff, 44).ok).toBe(true);
    expect(gradeDrill(bluff, 46).ok).toBe(false);
  });

  it('sizeFlash : les trois formules sortent et collent à formulasFromBet', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 90; seed++) {
      const q = generateDrill('sizeFlash', mulberry32(seed));
      if (q.kind !== 'sizeFlash') throw new Error('mauvais type');
      seen.add(q.variant);
      expect(q.answerPct).toBeGreaterThan(0);
      expect(q.answerPct).toBeLessThan(1);
    }
    expect(seen.size).toBe(3); // required, mdf, bluff
  });

  it('mixed : produit les différents types', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      kinds.add(generateDrill('mixed', mulberry32(seed)).kind);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});

describe('masteryLevel — À travailler / En progrès / Acquis', () => {
  const fast = Array(20).fill(2000); // 2 s, bien sous toutes les cibles

  it('pas assez de données → « Pas encore testé » (badge neutre)', () => {
    expect(masteryLevel('potOdds', undefined).label).toBe('Pas encore testé');
    expect(masteryLevel('potOdds', undefined).tone).toBe('none');
    expect(masteryLevel('potOdds', { attempts: 5, correct: 5, times: [1000] }).label).toBe(
      'Pas encore testé',
    );
  });

  it('précise ET rapide → Acquis', () => {
    const m = masteryLevel('potOdds', { attempts: 30, correct: 29, times: fast });
    expect(m.label).toBe('Acquis');
    expect(m.precision).toBeGreaterThan(0.9);
  });

  it('précis mais au-dessus de la cible de vitesse → En progrès', () => {
    const slow = Array(20).fill(TARGET_MS.potOdds + 5000);
    expect(masteryLevel('potOdds', { attempts: 30, correct: 29, times: slow }).label).toBe(
      'En progrès',
    );
  });

  it('précision moyenne → En progrès ; faible → À travailler', () => {
    expect(masteryLevel('potOdds', { attempts: 30, correct: 24, times: fast }).label).toBe(
      'En progrès',
    );
    expect(masteryLevel('potOdds', { attempts: 30, correct: 15, times: fast }).label).toBe(
      'À travailler',
    );
  });
});

describe('gradeDrill', () => {
  it('flash-cards : tolérance serrée de ±2 points', () => {
    const q = { kind: 'sizeFlash', variant: 'required', fractionLabel: '½ pot', answerPct: 0.25 } as const;
    expect(gradeDrill(q, 25).ok).toBe(true);
    expect(gradeDrill(q, 27).ok).toBe(true);
    expect(gradeDrill(q, 29).ok).toBe(false);
  });

  it('flash-cards : variantes MDF et bluff avec la bonne explication', () => {
    const mdfQ = { kind: 'sizeFlash', variant: 'mdf', fractionLabel: 'pot', answerPct: 0.5 } as const;
    expect(gradeDrill(mdfQ, 50).ok).toBe(true);
    expect(gradeDrill(mdfQ, 50).explain).toContain('MDF');
    const bluffQ = { kind: 'sizeFlash', variant: 'bluff', fractionLabel: 'pot', answerPct: 0.5 } as const;
    expect(gradeDrill(bluffQ, 50).ok).toBe(true);
    expect(gradeDrill(bluffQ, 50).explain).toContain('coucher');
  });

  it('cote du pot : tolérance de ±5 points', () => {
    const q = { kind: 'potOdds', pot: 40, bet: 20, call: 20, answerPct: 0.25 } as const;
    expect(gradeDrill(q, 29).ok).toBe(true);
    expect(gradeDrill(q, 31).ok).toBe(false);
  });

  it('outs : ±1 accepté, ×4/×2 jusqu’à 8 outs puis correction 3n+8 au flop', () => {
    const q: DrillQuestion = {
      kind: 'outs',
      hero: ['6h', '5h'],
      board: ['Ah', '9h', '2c'],
      villain: ['Ks', 'Kc'],
      villainDescription: 'x',
      answer: 8,
      outs: [],
    };
    // ≤ 8 outs au flop : × 4 classique.
    expect(gradeDrill(q, 8).explain).toContain('× 4');
    // 9 outs au flop : bascule sur 3n+8 (le × 4 surévalue).
    expect(gradeDrill({ ...q, answer: 9 }, 9).explain).toContain('3 × 9 + 8');
    // Au turn (une carte) : × 2, pas de correction même au-delà de 8 outs.
    expect(gradeDrill({ ...q, board: ['Ah', '9h', '2c', 'Qs'], answer: 9 }, 9).explain).toContain('× 2');
    expect(gradeDrill(q, 8).ok).toBe(true);
    expect(gradeDrill(q, 9).ok).toBe(true); // ±1
    expect(gradeDrill(q, 6).ok).toBe(false);
  });

  it('openRange : booléen exact', () => {
    const q: DrillQuestion = {
      kind: 'openRange',
      cards: ['Ah', 'Kh'],
      hand: 'AKs',
      position: 'UTG',
      answer: true,
    };
    expect(gradeDrill(q, true).ok).toBe(true);
    expect(gradeDrill(q, false).ok).toBe(false);
  });
});
