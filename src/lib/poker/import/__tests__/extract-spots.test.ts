import { describe, expect, it } from 'vitest';
import type { Card } from '../../cards';
import { extractSpots } from '../extract-spots';
import type { ParsedAction, ParsedHand } from '../parse-pokerstars';

const a = (
  seat: number,
  type: ParsedAction['type'],
  amount = 0,
  extra: Partial<ParsedAction> = {},
): ParsedAction => ({ street: 'preflop', seat, name: `S${seat}`, type, amount, ...extra });

describe('extractSpots — tapis effectif', () => {
  it('face à un 4-bet : min(mon tapis, tapis du 4-bettor), le joueur couché profond est ignoré', () => {
    // Héros 2 € (100 BB), 4-bettor 0,40 € (20 BB), un 3ᵉ joueur à 5 € qui OUVRE puis se couche.
    const hand: ParsedHand = {
      id: 'h',
      sb: 1,
      bb: 2,
      ante: 0,
      maxSeats: 6,
      buttonSeat: 3,
      table: 'T',
      playedAt: null,
      seats: [
        { seat: 1, name: 'Hero', stack: 200 },
        { seat: 2, name: 'V4bet', stack: 40 },
        { seat: 3, name: 'Deep', stack: 500 },
      ],
      heroName: 'Hero',
      heroSeat: 1,
      heroCards: ['Qs', 'Qd'] as [Card, Card],
      board: [],
      actions: [
        a(3, 'raise', 6, { toAmount: 6 }), // open du joueur profond (5 €)
        a(1, 'raise', 12, { toAmount: 18 }), // 3-bet du héros
        a(2, 'raise', 34, { toAmount: 40, allIn: true }), // 4-bet all-in du court (0,40 €)
        a(3, 'fold'), // le joueur profond se couche
        a(1, 'call', 22), // DÉCISION du héros : call du 4-bet
      ],
      heroNet: 0,
      heroInvested: 0,
      rake: 0,
      totalPot: 0,
      playersDealt: 3,
      shown: {},
    };

    const spots = extractSpots(hand);
    const call4bet = spots[spots.length - 1];
    expect(call4bet.facing).toBe('4bet+');
    expect(call4bet.heroAction.type).toBe('call');
    // min(100 BB, 20 BB) = 20 BB ; le 5 € couché n'entre pas en compte.
    expect(call4bet.effectiveBB).toBe(20);
  });

  it('multiway sans agresseur : le plus profond ENCORE en jeu, plafonné à mon tapis', () => {
    // Héros 1 € (50 BB) peut ouvrir ; un adversaire à 3 € encore en jeu, un à 5 € couché.
    const hand: ParsedHand = {
      id: 'h2',
      sb: 1,
      bb: 2,
      ante: 0,
      maxSeats: 6,
      buttonSeat: 1,
      table: 'T',
      playedAt: null,
      seats: [
        { seat: 1, name: 'Hero', stack: 100 },
        { seat: 2, name: 'Mid', stack: 300 },
        { seat: 3, name: 'Deep', stack: 500 },
      ],
      heroName: 'Hero',
      heroSeat: 1,
      heroCards: ['Ah', 'Kh'] as [Card, Card],
      board: [],
      actions: [
        a(3, 'fold'), // le plus profond se couche d'emblée
        a(1, 'raise', 6, { toAmount: 6 }), // le héros ouvre (pas d'agresseur devant)
      ],
      heroNet: 0,
      heroInvested: 0,
      rake: 0,
      totalPot: 0,
      playersDealt: 3,
      shown: {},
    };

    const open = extractSpots(hand)[0];
    // min(50 BB héros, 150 BB du Mid encore en jeu) = 50 BB ; le 5 € couché ignoré.
    expect(open.effectiveBB).toBe(50);
  });
});
