import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards';
import { generateDrill, gradeDrill, requiredForFraction, type DrillQuestion } from '../drill';
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

  it('mixed : produit les différents types', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      kinds.add(generateDrill('mixed', mulberry32(seed)).kind);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});

describe('gradeDrill', () => {
  it('flash-cards : tolérance serrée de ±2 points', () => {
    const q = { kind: 'sizeFlash', fractionLabel: '½ pot', answerPct: 0.25 } as const;
    expect(gradeDrill(q, 25).ok).toBe(true);
    expect(gradeDrill(q, 27).ok).toBe(true);
    expect(gradeDrill(q, 29).ok).toBe(false);
  });

  it('cote du pot : tolérance de ±5 points', () => {
    const q = { kind: 'potOdds', pot: 40, bet: 20, call: 20, answerPct: 0.25 } as const;
    expect(gradeDrill(q, 29).ok).toBe(true);
    expect(gradeDrill(q, 31).ok).toBe(false);
  });

  it('outs : ±1 accepté, explication en ×4 au flop et ×2 au turn', () => {
    const q: DrillQuestion = {
      kind: 'outs',
      hero: ['6h', '5h'],
      board: ['Ah', '9h', '2c'],
      villain: ['Ks', 'Kc'],
      villainDescription: 'x',
      answer: 9,
      outs: [],
    };
    expect(gradeDrill(q, 9).explain).toContain('× 4');
    expect(
      gradeDrill({ ...q, board: ['Ah', '9h', '2c', 'Qs'] }, 9).explain,
    ).toContain('× 2');
    expect(gradeDrill(q, 9).ok).toBe(true);
    expect(gradeDrill(q, 8).ok).toBe(true);
    expect(gradeDrill(q, 7).ok).toBe(false);
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
