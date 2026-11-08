import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { applyAction, createHand } from '../engine';
import {
  combosForClasses,
  estimatePreflopRange,
  expandNotation,
  handClass,
  positionOf,
} from '../ranges';

describe('handClass', () => {
  it('classe paires, suited et offsuit', () => {
    expect(handClass('Ah', 'Kh')).toBe('AKs');
    expect(handClass('Kd', 'Ah')).toBe('AKo');
    expect(handClass('7c', '7d')).toBe('77');
    expect(handClass('2s', '9s')).toBe('92s');
  });
});

describe('expandNotation', () => {
  it('étend les paires avec +', () => {
    expect(expandNotation(['22+']).size).toBe(13);
    expect([...expandNotation(['QQ+'])].sort()).toEqual(['AA', 'KK', 'QQ']);
  });

  it('étend les mains non appariées avec +', () => {
    expect(expandNotation(['A2s+']).size).toBe(12); // A2s à AKs
    expect([...expandNotation(['ATo+'])].sort()).toEqual(['AJo', 'AKo', 'AQo', 'ATo']);
    expect([...expandNotation(['T9s'])]).toEqual(['T9s']);
  });
});

describe('combosForClasses', () => {
  it('compte les combos et retire les cartes mortes', () => {
    expect(combosForClasses(expandNotation(['AA']))).toHaveLength(6);
    expect(combosForClasses(expandNotation(['AA']), ['Ah'])).toHaveLength(3);
    expect(combosForClasses(expandNotation(['AKs']))).toHaveLength(4);
    expect(combosForClasses(expandNotation(['AKo']))).toHaveLength(12);
  });
});

describe('positionOf', () => {
  const seats = (count: number) =>
    Array.from({ length: count }, (_, n) => ({
      id: `p${n}`,
      name: `J${n}`,
      seat: n,
      stack: 200,
    }));

  it('heads-up : bouton = BTN, l’autre = BB', () => {
    const state = createHand({ handId: 1, seats: seats(2), buttonSeat: 0, blinds: { sb: 1, bb: 2 } });
    expect(positionOf(state, 0)).toBe('BTN');
    expect(positionOf(state, 1)).toBe('BB');
  });

  it('6-max : SB, BB, UTG, HJ, CO, BTN', () => {
    const state = createHand({ handId: 1, seats: seats(6), buttonSeat: 2, blinds: { sb: 1, bb: 2 } });
    expect(positionOf(state, 3)).toBe('SB');
    expect(positionOf(state, 4)).toBe('BB');
    expect(positionOf(state, 5)).toBe('UTG');
    expect(positionOf(state, 0)).toBe('HJ');
    expect(positionOf(state, 1)).toBe('CO');
    expect(positionOf(state, 2)).toBe('BTN');
  });
});

describe('estimatePreflopRange', () => {
  const BLINDS = { sb: 1, bb: 2 };
  const deck: Card[] = ['Ah', 'Ad', 'Kh', 'Kd', '2c', '7d', '9s', '4c', 'Jh'];
  const huHand = () =>
    createHand({
      handId: 1,
      seats: [
        { id: 'hero', name: 'Héros', seat: 0, stack: 200 },
        { id: 'bot', name: 'Bot', seat: 1, stack: 200 },
      ],
      buttonSeat: 1, // le bot est au bouton
      blinds: BLINDS,
      deck,
    });

  it('relance en premier → range d’open de sa position', () => {
    const state = applyAction(huHand(), { type: 'raise', amount: 6 });
    const estimate = estimatePreflopRange(state, 1);
    expect(estimate.label).toBe('open BTN');
    expect(estimate.classes?.has('A2s')).toBe(true);
    expect(estimate.classes?.has('72o')).toBe(false);
  });

  it('limp → range très large (null)', () => {
    const state = applyAction(huHand(), { type: 'call' });
    const estimate = estimatePreflopRange(state, 1);
    expect(estimate.classes).toBeNull();
  });

  it('sur-relance → range de 3-bet', () => {
    let state = applyAction(huHand(), { type: 'raise', amount: 6 }); // bot open
    state = applyAction(state, { type: 'raise', amount: 18 }); // héros 3-bet
    state = applyAction(state, { type: 'raise', amount: 54 }); // bot 4-bet
    const estimate = estimatePreflopRange(state, 1);
    expect(estimate.label).toBe('3-bet BTN');
    expect(estimate.classes?.has('AA')).toBe(true);
    expect(estimate.classes?.has('A2s')).toBe(false);
  });

  it('paie une relance → range de call de sa position', () => {
    let state = applyAction(huHand(), { type: 'raise', amount: 6 }); // bot open
    state = applyAction(state, { type: 'raise', amount: 18 }); // héros (BB) 3-bet
    state = applyAction(state, { type: 'call' }); // bot paie le 3-bet
    const estimate = estimatePreflopRange(state, 1);
    expect(estimate.label).toBe('paie une relance (BTN)');
    expect(estimate.classes?.has('AA')).toBe(true);
  });

  it('la dernière action informative l’emporte et l’historique est bien rempli', () => {
    const state = applyAction(huHand(), { type: 'call' });
    expect(state.history).toEqual([
      { street: 'preflop', seat: 1, action: { type: 'call' } },
    ]);
  });
});
