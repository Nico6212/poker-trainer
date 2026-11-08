import { describe, expect, it } from 'vitest';
import type { ActionRecord } from '../engine';
import {
  classifyDecision,
  computeStats,
  gradeExam,
  type DecisionRecord,
  type HandRecord,
  type SessionData,
} from '../session';

describe('classifyDecision', () => {
  it('payer sans la cote est une erreur', () => {
    expect(classifyDecision('call', 0.2, 0.25)).toEqual({
      isError: true,
      errorKind: 'call-sans-cote',
    });
  });

  it('payer avec la cote est correct', () => {
    expect(classifyDecision('call', 0.3, 0.25).isError).toBe(false);
  });

  it('se coucher avec plus de 10 points de marge est une erreur', () => {
    expect(classifyDecision('fold', 0.4, 0.25)).toEqual({
      isError: true,
      errorKind: 'fold-trop-serre',
    });
    expect(classifyDecision('fold', 0.33, 0.25).isError).toBe(false);
  });

  it('relancer n’est jamais classé en erreur, équité inconnue non plus', () => {
    expect(classifyDecision('raise', 0.05, 0.25).isError).toBe(false);
    expect(classifyDecision('call', null, 0.25).isError).toBe(false);
  });
});

describe('gradeExam', () => {
  it('tolère ±5 points', () => {
    expect(gradeExam(0.29, 0.25)).toBe(true);
    expect(gradeExam(0.2, 0.25)).toBe(true);
    expect(gradeExam(0.17, 0.25)).toBe(false);
    expect(gradeExam(0.3, 0.25)).toBe(true); // exactement 5 points
  });
});

describe('computeStats', () => {
  const h = (street: 'preflop' | 'flop' | 'turn', seat: number, action: ActionRecord['action']): ActionRecord => ({
    street,
    seat,
    action,
  });

  const baseHand = (handId: number, history: ActionRecord[], heroNet: number): HandRecord => ({
    handId,
    heroSeat: 0,
    buttonSeat: 0,
    bb: 2,
    players: [],
    board: [],
    history,
    result: { pots: [], winners: [], wonWithoutShowdown: true },
    heroNet,
  });

  const data: SessionData = {
    startedAt: '2026-11-06T10:00:00.000Z',
    hands: [
      // Main 1 : le héros open, le bot se couche → VPIP + PFR.
      baseHand(1, [h('preflop', 0, { type: 'raise', amount: 6 }), h('preflop', 1, { type: 'fold' })], 4),
      // Main 2 : le bot relance, le héros paie (occasion de 3-bet non prise),
      // puis postflop : un call et une mise → agression 50 %.
      baseHand(
        2,
        [
          h('preflop', 1, { type: 'raise', amount: 6 }),
          h('preflop', 0, { type: 'call' }),
          h('flop', 1, { type: 'bet', amount: 4 }),
          h('flop', 0, { type: 'call' }),
          h('turn', 0, { type: 'bet', amount: 10 }),
          h('turn', 1, { type: 'fold' }),
        ],
        -10,
      ),
      // Main 3 : le héros se couche face à une relance → occasion de 3-bet, pas de VPIP.
      baseHand(3, [h('preflop', 1, { type: 'raise', amount: 6 }), h('preflop', 0, { type: 'fold' })], -2),
    ],
    decisions: [
      {
        handId: 2,
        street: 'flop',
        equity: 0.2,
        required: 0.25,
        callAmount: 4,
        potTotal: 12,
        action: 'call',
        isError: true,
        errorKind: 'call-sans-cote',
        exam: {
          requiredGuess: 0.25,
          equityGuess: 0.4,
          requiredActual: 0.25,
          equityActual: 0.2,
          requiredOk: true,
          equityOk: false,
        },
      },
      {
        handId: 3,
        street: 'preflop',
        equity: 0.3,
        required: 0.29,
        callAmount: 4,
        potTotal: 9,
        action: 'fold',
        isError: false,
        errorKind: null,
        exam: null,
      },
    ] satisfies DecisionRecord[],
  };

  it('calcule mains, net, VPIP, PFR, 3-bet, agression, examen et erreurs', () => {
    const stats = computeStats(data);
    expect(stats.handsPlayed).toBe(3);
    expect(stats.netCents).toBe(-8);
    expect(stats.netBB).toBe(-4);
    expect(stats.vpip).toBeCloseTo(2 / 3);
    expect(stats.pfr).toBeCloseTo(1 / 3);
    expect(stats.threeBet).toBe(0); // 2 occasions, 0 prise
    expect(stats.aggression).toBeCloseTo(0.5); // 1 mise, 1 call postflop
    expect(stats.examAsked).toBe(2);
    expect(stats.examCorrect).toBe(1);
    expect(stats.errors).toBe(1);
  });

  it('session vide : ratios à null', () => {
    const stats = computeStats({ startedAt: '', hands: [], decisions: [] });
    expect(stats.handsPlayed).toBe(0);
    expect(stats.vpip).toBeNull();
    expect(stats.threeBet).toBeNull();
    expect(stats.aggression).toBeNull();
  });
});
