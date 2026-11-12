import { Hand } from 'pokersolver';
import { RANKS, createDeck, shuffle, type Card, type RNG } from './cards';

// Lecture de main : identifier sa propre combinaison (un brelan n'est pas un full)
// et repérer ce qui peut la battre selon la texture du board. Logique pure, testée.

export const CATEGORIES = [
  'Hauteur',
  'Paire',
  'Deux paires',
  'Brelan',
  'Quinte',
  'Couleur',
  'Full',
  'Carré',
  'Quinte flush',
] as const;
export type Category = (typeof CATEGORIES)[number];

const NAME_TO_CATEGORY: Record<string, Category> = {
  'High Card': 'Hauteur',
  Pair: 'Paire',
  'Two Pair': 'Deux paires',
  'Three of a Kind': 'Brelan',
  Straight: 'Quinte',
  Flush: 'Couleur',
  'Full House': 'Full',
  'Four of a Kind': 'Carré',
  'Straight Flush': 'Quinte flush',
  'Royal Flush': 'Quinte flush',
};

export function categoryOf(cards: Card[]): Category {
  return NAME_TO_CATEGORY[Hand.solve(cards).name] ?? 'Hauteur';
}

export function categoryRank(category: Category): number {
  return CATEGORIES.indexOf(category);
}

export type BoardTexture = { paired: boolean; threeFlush: boolean; fourStraight: boolean };

export function boardTexture(board: Card[]): BoardTexture {
  const rankCounts = new Map<string, number>();
  const suitCounts = new Map<string, number>();
  for (const card of board) {
    rankCounts.set(card[0], (rankCounts.get(card[0]) ?? 0) + 1);
    suitCounts.set(card[1], (suitCounts.get(card[1]) ?? 0) + 1);
  }
  const paired = [...rankCounts.values()].some((n) => n >= 2);
  const threeFlush = [...suitCounts.values()].some((n) => n >= 3);

  // 4 rangs distincts tenant dans une fenêtre de 5 (quinte à une carte près) ; As compte haut et bas.
  const values = new Set<number>();
  for (const card of board) {
    const v = RANKS.indexOf(card[0] as (typeof RANKS)[number]) + 2;
    values.add(v);
    if (v === 14) values.add(1); // roue A-2-3-4-5
  }
  let fourStraight = false;
  for (let low = 1; low <= 10; low++) {
    let count = 0;
    for (let r = low; r < low + 5; r++) if (values.has(r)) count++;
    if (count >= 4) fourStraight = true;
  }

  return { paired, threeFlush, fourStraight };
}

/** Catégories qu'un adversaire PEUT détenir sur ce board (toutes les mains à 2 cartes). */
export function possibleOpponentCategories(board: Card[], dead: Card[]): Category[] {
  const used = new Set<Card>([...board, ...dead]);
  const deck = createDeck().filter((c) => !used.has(c));
  const found = new Set<Category>();
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      found.add(categoryOf([deck[i], deck[j], ...board]));
    }
  }
  return [...found].sort((a, b) => categoryRank(a) - categoryRank(b));
}

export type HandReadingQuestion = {
  variant: 'yourHand' | 'whatBeats';
  hero: [Card, Card];
  board: Card[];
  heroCategory: Category;
  /** Catégories strictement supérieures possibles sur ce board (les vrais dangers). */
  dangers: Category[];
  options: Category[];
  answer: Category;
};

function shuffleCats(cats: Category[], rng: RNG): Category[] {
  return shuffle(cats, rng);
}

/** Génère une question de lecture de main, en biaisant vers les boards piégeux. */
export function generateHandReading(rng: RNG): HandReadingQuestion {
  let hero: [Card, Card] = ['Ah', 'Kh'];
  let board: Card[] = [];
  // On retire jusqu'à tomber sur un board pairé / 3-flush / 4-quinte (plus formateur).
  for (let attempt = 0; attempt < 12; attempt++) {
    const deck = shuffle(createDeck(), rng);
    hero = [deck[0], deck[1]];
    board = deck.slice(2, 7);
    const t = boardTexture(board);
    if (t.paired || t.threeFlush || t.fourStraight || attempt === 11) break;
  }

  const heroCategory = categoryOf([...hero, ...board]);
  const possible = possibleOpponentCategories(board, hero);
  const dangers = possible.filter((c) => categoryRank(c) > categoryRank(heroCategory));

  // « Qu'est-ce qui te bat ? » seulement si un danger existe ; sinon « Ta main ? ».
  const variant: HandReadingQuestion['variant'] =
    dangers.length > 0 && rng() < 0.5 ? 'whatBeats' : 'yourHand';

  if (variant === 'whatBeats') {
    const answer = dangers[0]; // le danger le plus immédiat (catégorie juste au-dessus)
    const distractors = CATEGORIES.filter(
      (c) => c !== answer && !dangers.includes(c),
    ).slice(-3); // des catégories qui ne te battent pas (ou impossibles ici)
    const options = shuffleCats([answer, ...distractors], rng);
    return { variant, hero, board, heroCategory, dangers, options, answer };
  }

  const answer = heroCategory;
  const r = categoryRank(answer);
  const near = CATEGORIES.filter((c) => c !== answer).sort(
    (a, b) => Math.abs(categoryRank(a) - r) - Math.abs(categoryRank(b) - r),
  );
  const options = shuffleCats([answer, ...near.slice(0, 3)], rng);
  return { variant, hero, board, heroCategory, dangers, options, answer };
}

export function gradeHandReading(
  question: HandReadingQuestion,
  chosen: Category,
): { ok: boolean; explain: string } {
  const exact = categoryOf([...question.hero, ...question.board]);
  if (question.variant === 'yourHand') {
    return {
      ok: chosen === question.answer,
      explain: `Ta main exacte : ${exact}.${
        question.dangers.length
          ? ` Attention, sur ce board ${question.dangers.join(', ').toLowerCase()} te battent.`
          : ' Rien ne te bat ici.'
      }`,
    };
  }
  return {
    ok: question.dangers.includes(chosen),
    explain: question.dangers.length
      ? `Te battent ici : ${question.dangers.join(', ')}. Tu as ${exact}.`
      : `Rien ne te bat : tu as ${exact}.`,
  };
}
