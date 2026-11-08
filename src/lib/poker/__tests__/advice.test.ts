import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { suggestRaise } from '../advice';
import { applyAction, createHand } from '../engine';

const BLINDS = { sb: 1, bb: 2 };
const DECK: Card[] = ['Ah', 'Ad', 'Kh', 'Kd', '2c', '7d', '9s', '4c', 'Jh'];

function huHand(buttonSeat: 0 | 1 = 0, stacks: [number, number] = [200, 200]) {
  return createHand({
    handId: 1,
    seats: [
      { id: 'hero', name: 'Héros', seat: 0, stack: stacks[0] },
      { id: 'bot', name: 'Bot', seat: 1, stack: stacks[1] },
    ],
    buttonSeat,
    blinds: BLINDS,
    deck: DECK,
  });
}

describe('suggestRaise', () => {
  it('préflop sans relance : open 3 BB, avec la cote offerte à l’adversaire', () => {
    const advice = suggestRaise(huHand(0), 0, 1)!; // héros au bouton, premier à parler
    expect(advice.kind).toBe('open');
    expect(advice.amount).toBe(6); // 3 BB
    expect(advice.villainCall).toBe(4);
    expect(advice.finalIfCalled).toBe(12); // 8 après ma relance + son call de 4
    expect(advice.villainOdds).toBeCloseTo(1 / 3);
    // Bluff pur : je risque 5 (6 − ma SB) pour prendre les 3 du milieu.
    expect(advice.risk).toBe(5);
    expect(advice.foldEquityNeeded).toBeCloseTo(5 / 8);
  });

  it('face à un limp : isolation à 3 BB + 1 BB par limpeur', () => {
    const state = applyAction(huHand(1), { type: 'call' }); // le bot (BTN) limpe
    const advice = suggestRaise(state, 0, 1)!; // héros en BB
    expect(advice.kind).toBe('isolation');
    expect(advice.amount).toBe(8); // 3 BB + 1 BB
  });

  it('face à une open hors position : 3-bet à 4×', () => {
    const state = applyAction(huHand(1), { type: 'raise', amount: 6 }); // bot BTN open 3 BB
    const advice = suggestRaise(state, 0, 1)!; // héros BB, hors position
    expect(advice.kind).toBe('3bet');
    expect(advice.amount).toBe(24);
    expect(advice.recipe).toContain('4×');
  });

  it('squeeze : +1× la relance par suiveur à froid', () => {
    // 3 joueurs, bouton siège 0 : le bouton (UTG) ouvre 3 BB, la SB paie,
    // le héros en BB doit squeezer plus gros que face à l'open seule.
    let state = createHand({
      handId: 1,
      seats: [
        { id: 'btn', name: 'BTN', seat: 0, stack: 200 },
        { id: 'sb', name: 'SB', seat: 1, stack: 200 },
        { id: 'hero', name: 'Héros', seat: 2, stack: 200 },
      ],
      buttonSeat: 0,
      blinds: BLINDS,
      deck: ['Kh', 'Kd', 'Ah', 'Ad', 'Qh', 'Qd', '2c', '7d', '9s', '4c', 'Jh'],
    });
    state = applyAction(state, { type: 'raise', amount: 6 }); // open du bouton
    state = applyAction(state, { type: 'call' }); // la SB suit à froid
    const advice = suggestRaise(state, 2, 0)!; // héros BB, hors position vs BTN
    expect(advice.kind).toBe('3bet');
    expect(advice.amount).toBe(30); // (4 + 1 suiveur) × 6
    expect(advice.recipe).toContain('suiveur');
  });

  it('postflop sans mise : ⅔ du pot', () => {
    let state = applyAction(huHand(1), { type: 'call' }); // limp
    state = applyAction(state, { type: 'check' }); // flop, héros (BB) parle en premier
    const advice = suggestRaise(state, 0, 1)!;
    expect(advice.kind).toBe('bet');
    expect(advice.amount).toBe(3); // ⅔ × pot de 4, arrondi
  });

  it('la suggestion est plafonnée au tapis (all-in)', () => {
    let state = applyAction(huHand(1), { type: 'call' });
    state = applyAction(state, { type: 'check' }); // flop, pot 4
    state = applyAction(state, { type: 'bet', amount: 100 }); // héros surmise énorme
    const advice = suggestRaise(state, 1, 0)!; // conseil pour le bot : 3× = 300 > tapis
    expect(advice.amount).toBe(198); // son tapis (200 − 2 de BB déjà payés… il est BTN : 200 − 1 ? non : BTN a limpé 2)
    expect(advice.isAllIn).toBe(true);
  });

  it('null quand on ne peut ni miser ni relancer', () => {
    const state = huHand(0);
    expect(suggestRaise(state, 1, 0)).toBeNull(); // pas le tour du siège 1
  });
});
