import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import { mulberry32 } from '../../cards';
import { allinAdjusted, equityVsHand } from '../allin-adjust';
import type { ParsedAction, ParsedHand } from '../parse-pokerstars';

const rng = mulberry32(1);

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
    heroCards: ['As', 'Ks'] as [Card, Card],
    board: ['2c', '7h', 'Tc', '3d', '8s'] as Card[],
    actions: [],
    heroNet: 0,
    heroInvested: 100,
    rake: 10,
    totalPot: 200,
    playersDealt: 2,
    shown: { 2: ['Ad', 'Kd'] },
    ...p,
  }) as ParsedHand;

const allInFlop: ParsedAction[] = [
  { street: 'flop', seat: 1, name: 'Hero', type: 'bet', amount: 0, allIn: true },
  { street: 'flop', seat: 2, name: 'v', type: 'call', amount: 0, allIn: true },
];

describe('equityVsHand', () => {
  it('AsKs vs AdKd sur flop neutre → ~50 % (énumération exacte, chop)', () => {
    const eq = equityVsHand(['As', 'Ks'], ['Ad', 'Kd'], ['2c', '7h', 'Tc'], rng);
    expect(eq).toBeCloseTo(0.5, 2);
  });
});

describe('allinAdjusted', () => {
  it('EV = équité × (pot − rake) − investi ≈ −rake/2 ; chop → chance 0', () => {
    // board 5 cartes neutres (chop), héros collecte la moitié (190/2 = 95), net = -5.
    const h = hand({ actions: allInFlop, heroNet: -5 });
    const res = allinAdjusted([h], rng);
    expect(res.hands).toBe(1);
    expect(res.skipped).toBe(0);
    // EV = 0,5 × (200 − 10) − 100 = -5 = -rake/2
    expect(res.evCents).toBeCloseTo(-5, 1);
    expect(res.luckCents).toBeCloseTo(0, 1); // réel (-5) − EV (-5)
  });

  it('veinard : même spot mais le héros a gagné tout le pot → chance positive', () => {
    const h = hand({ actions: allInFlop, heroNet: 90 }); // a gagné 190 − investi 100
    const res = allinAdjusted([h], rng);
    expect(res.luckCents).toBeCloseTo(95, 0); // réel 90 − EV (-5)
  });

  it('multiway / side pot 3ᵉ joueur non montré → compté à part (skipped)', () => {
    const h = hand({ actions: allInFlop, playersDealt: 3 }); // 3 joueurs non couchés
    const res = allinAdjusted([h], rng);
    expect(res.hands).toBe(0);
    expect(res.skipped).toBe(1);
  });

  it('pas de tapis avant la river (board incomplet ou aucun all-in) → ignoré', () => {
    expect(allinAdjusted([hand({ actions: [], board: ['2c', '7h', 'Tc', '3d', '8s'] })], rng).hands).toBe(0);
    expect(allinAdjusted([hand({ actions: allInFlop, board: ['2c', '7h', 'Tc'] })], rng).hands).toBe(0); // non payé
  });
});
