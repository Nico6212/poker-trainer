import { describe, expect, it } from 'vitest';
import { createDeck, mulberry32, rankValue, shuffle } from '../cards';

describe('createDeck', () => {
  it('contient 52 cartes uniques', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });
});

describe('shuffle', () => {
  it('est déterministe avec la même graine', () => {
    const deck = createDeck();
    const a = shuffle(deck, mulberry32(42));
    const b = shuffle(deck, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('change avec une graine différente', () => {
    const deck = createDeck();
    const a = shuffle(deck, mulberry32(1));
    const b = shuffle(deck, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('est une permutation et ne mute pas l’entrée', () => {
    const deck = createDeck();
    const copy = [...deck];
    const shuffled = shuffle(deck, mulberry32(7));
    expect(deck).toEqual(copy);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });
});

describe('rankValue', () => {
  it('va de 2 pour le 2 à 14 pour l’as', () => {
    expect(rankValue('2')).toBe(2);
    expect(rankValue('T')).toBe(10);
    expect(rankValue('A')).toBe(14);
  });
});
