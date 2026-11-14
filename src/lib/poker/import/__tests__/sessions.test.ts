import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import type { ParsedAction, ParsedHand } from '../parse-pokerstars';
import { buildSessions, groupSessions, maxSimultaneousTables, tablesComparison } from '../sessions';

const T0 = Date.parse('2024-03-01T20:00:00');
const MIN = 60_000;

function hand(p: Partial<ParsedHand> & { id: string }): ParsedHand {
  return {
    sb: 1,
    bb: 2,
    ante: 0,
    maxSeats: 6,
    buttonSeat: 1,
    table: p.table ?? 'A',
    playedAt: p.playedAt ?? null,
    seats: [
      { seat: 1, name: 'Hero', stack: 200 },
      { seat: 2, name: 'v', stack: 200 },
    ],
    heroName: 'Hero',
    heroSeat: 1,
    heroCards: ['Ah', 'Kd'] as [Card, Card],
    board: [],
    actions: p.actions ?? [],
    heroNet: p.heroNet ?? 0,
    heroInvested: p.heroInvested ?? 0,
    rake: p.rake ?? 0,
    totalPot: p.totalPot ?? 0,
    playersDealt: p.playersDealt ?? 2,
    shown: {},
    ...p,
  };
}

const pf = (seat: number, type: ParsedAction['type'], toAmount?: number): ParsedAction => ({
  street: 'preflop',
  seat,
  name: seat === 1 ? 'Hero' : 'v',
  type,
  amount: 0,
  toAmount,
});

describe('groupSessions', () => {
  it('coupe quand le trou dépasse 30 minutes', () => {
    const hands = [
      hand({ id: '1', playedAt: T0 }),
      hand({ id: '2', playedAt: T0 + 5 * MIN }),
      hand({ id: '3', playedAt: T0 + 40 * MIN }), // +35 min → nouvelle session
      hand({ id: '4', playedAt: T0 + 42 * MIN }),
    ];
    const sessions = groupSessions(hands);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].map((h) => h.id)).toEqual(['1', '2']);
    expect(sessions[1].map((h) => h.id)).toEqual(['3', '4']);
  });
});

describe('maxSimultaneousTables', () => {
  it('compte les tables actives dans la même fenêtre', () => {
    // 3 mains quasi simultanées sur 3 tables → 3 tables en même temps.
    const hands = [
      hand({ id: '1', table: 'A', playedAt: T0 }),
      hand({ id: '2', table: 'B', playedAt: T0 + MIN }),
      hand({ id: '3', table: 'C', playedAt: T0 + 2 * MIN }),
      hand({ id: '4', table: 'A', playedAt: T0 + 3 * MIN }),
    ];
    expect(maxSimultaneousTables(hands)).toBe(3);
  });

  it('une seule table à la fois → 1', () => {
    const hands = [
      hand({ id: '1', table: 'A', playedAt: T0 }),
      hand({ id: '2', table: 'A', playedAt: T0 + MIN }),
    ];
    expect(maxSimultaneousTables(hands)).toBe(1);
  });
});

describe('buildSessions — bilan', () => {
  it('agrège net, BB/100, VPIP/PFR/3-bet et erreurs par type', () => {
    const hands = [
      // Main 1 : héros open (VPIP + PFR), gagne 10.
      hand({
        id: '1',
        playedAt: T0,
        heroNet: 10,
        actions: [pf(1, 'raise', 6), pf(2, 'fold')],
      }),
      // Main 2 : un adversaire relance, héros 3-bet (VPIP + PFR + 3bet), perd 20.
      hand({
        id: '2',
        playedAt: T0 + MIN,
        heroNet: -20,
        actions: [pf(2, 'raise', 6), pf(1, 'raise', 18), pf(2, 'fold')],
      }),
      // Main 3 : héros se couche préflop (rien).
      hand({ id: '3', playedAt: T0 + 2 * MIN, heroNet: -2, actions: [pf(2, 'raise', 6), pf(1, 'fold')] }),
    ];
    const mistakes = [
      { handId: '2', type: 'small-3bet' as const, detail: '', spot: {} as never },
      { handId: '2', type: 'call-sans-cote' as const, detail: '', spot: {} as never },
    ];
    const sessions = buildSessions(hands, mistakes);
    expect(sessions).toHaveLength(1);
    const s = sessions[0].stats;
    expect(s.hands).toBe(3);
    expect(s.netCents).toBe(-12);
    expect(s.bb100).toBeCloseTo((-12 / 2 / 3) * 100);
    expect(s.vpip).toBeCloseTo(2 / 3); // mains 1 et 2
    expect(s.pfr).toBeCloseTo(2 / 3);
    expect(s.threeBet).toBeCloseTo(1 / 2); // 2 occasions (mains 2 et 3), 1 prise
    expect(s.totalErrors).toBe(2);
    expect(s.errorCounts['small-3bet']).toBe(1);
    expect(s.errorCounts['call-sans-cote']).toBe(1);
    expect(sessions[0].day).toBe('2024-03-01');
  });

  it('BB/100 main par main sur une session multi-limites + badges + alerte', () => {
    const hands = [
      // 2 mains NL2 (bb=2), 1 main NL10 (bb=10), toutes dans la même session.
      hand({ id: '1', bb: 2, playedAt: T0, heroNet: 10 }),
      hand({ id: '2', bb: 2, playedAt: T0 + MIN, heroNet: -20 }),
      hand({ id: '3', bb: 10, playedAt: T0 + 2 * MIN, heroNet: 100 }),
    ];
    const sessions = buildSessions(hands, []);
    expect(sessions).toHaveLength(1);
    const s = sessions[0].stats;
    expect(s.netCents).toBe(90); // net brut en centimes
    // BB/100 main par main : (10/2 − 20/2 + 100/10) / 3 × 100 = (5 − 10 + 10)/3 × 100 ≈ 166.7
    expect(s.bb100).toBeCloseTo((5 - 10 + 10) / 3 * 100);
    expect(s.limits).toEqual(['NL2', 'NL10']); // triées par BB croissante
    expect(s.maxBb).toBe(10);
    // Limite habituelle = NL2 (2 mains sur 3) → cette session touche NL10 → alerte.
    expect(sessions[0].aboveUsual).toBe(true);
  });
});

describe('tablesComparison', () => {
  it('répartit les mains par nombre de tables et marque « trop peu » sous 1000', () => {
    // Session A : 2 mains sur 1 table (few). Session B (>30 min après) : 3 mains sur 3 tables (many).
    const hands = [
      hand({ id: 'a1', table: 'A', playedAt: T0, heroNet: 10 }),
      hand({ id: 'a2', table: 'A', playedAt: T0 + MIN, heroNet: -10 }),
      hand({ id: 'b1', table: 'A', playedAt: T0 + 60 * MIN, heroNet: 2 }),
      hand({ id: 'b2', table: 'B', playedAt: T0 + 60 * MIN + 1000, heroNet: 2 }),
      hand({ id: 'b3', table: 'C', playedAt: T0 + 60 * MIN + 2000, heroNet: 2 }),
    ];
    const c = tablesComparison(hands);
    expect(c.few.hands).toBe(2);
    expect(c.many.hands).toBe(3);
    expect(c.comparable).toBe(false); // bien en dessous de 1000 de chaque côté
  });
});
