import { describe, expect, it } from 'vitest';
import { mulberry32, type Card } from '../cards';
import {
  CATEGORIES,
  boardTexture,
  categoryOf,
  categoryRank,
  generateHandReading,
  gradeHandReading,
  possibleOpponentCategories,
} from '../hand-reading';

describe('categoryOf — identifier sa main (le brelan n’est pas un full)', () => {
  it('brelan, pas full', () => {
    // 5♣5♦ + 5♠ K Q 9 2 : brelan de 5, surtout pas un full.
    expect(categoryOf(['5c', '5d', '5s', 'Kh', 'Qd', '9c', '2h'])).toBe('Brelan');
  });
  it('full', () => {
    expect(categoryOf(['5c', '5d', '5s', 'Kh', 'Kd', '9c', '2h'])).toBe('Full');
  });
  it('deux paires, couleur, quinte', () => {
    expect(categoryOf(['Ac', 'Ad', 'Kc', 'Kd', '9s', '2h', '3h'])).toBe('Deux paires');
    expect(categoryOf(['Ah', 'Kh', 'Qh', '2h', '7h', '3c', '4d'])).toBe('Couleur');
    expect(categoryOf(['5c', '6d', '7s', '8h', '9c', 'Ah', '2d'])).toBe('Quinte');
  });
});

describe('boardTexture', () => {
  it('détecte board pairé, 3 cartes d’une couleur, 4 à la quinte', () => {
    expect(boardTexture(['Kh', 'Kd', '7c', '2s', '9h']).paired).toBe(true);
    expect(boardTexture(['Ah', '9h', '2h', 'Kd', '4c']).threeFlush).toBe(true);
    expect(boardTexture(['5c', '6d', '7s', '8h', 'Kd']).fourStraight).toBe(true);
    const dry = boardTexture(['Kh', '7d', '2c', '9s', '4h']);
    expect(dry.paired || dry.threeFlush || dry.fourStraight).toBe(false);
  });
});

describe('possibleOpponentCategories', () => {
  it('board pairé : un full (et plus) est possible pour l’adversaire', () => {
    const cats = possibleOpponentCategories(['Kh', 'Kd', '7c', '2s', '9h'], ['Ac', 'Ad']);
    expect(cats).toContain('Full');
  });
  it('board arc-en-ciel non connecté : pas de couleur possible', () => {
    const cats = possibleOpponentCategories(['Kh', '7d', '2c', '9s', '4h'], ['Ac', 'Ad']);
    expect(cats).not.toContain('Couleur');
  });
});

describe('generateHandReading + gradeHandReading', () => {
  it('produit des questions cohérentes et correctement notées', () => {
    for (let seed = 0; seed < 25; seed++) {
      const q = generateHandReading(mulberry32(seed));
      expect(CATEGORIES).toContain(q.heroCategory);
      expect(q.options).toContain(q.answer);
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      // La bonne réponse est notée juste, une mauvaise est notée fausse.
      expect(gradeHandReading(q, q.answer).ok).toBe(true);
      const wrong = q.options.find((o) => o !== q.answer && !gradeHandReading(q, o).ok);
      if (wrong) expect(gradeHandReading(q, wrong).ok).toBe(false);
      if (q.variant === 'yourHand') expect(q.answer).toBe(q.heroCategory);
      if (q.variant === 'whatBeats') {
        expect(categoryRank(q.answer)).toBeGreaterThan(categoryRank(q.heroCategory));
      }
    }
  });

  it('biaise vers les boards piégeux (pairé / 3-flush / 4-quinte)', () => {
    let tricky = 0;
    for (let seed = 0; seed < 40; seed++) {
      const t = boardTexture(generateHandReading(mulberry32(seed + 100)).board);
      if (t.paired || t.threeFlush || t.fourStraight) tricky++;
    }
    expect(tricky).toBeGreaterThan(28); // nette majorité
  });
});
