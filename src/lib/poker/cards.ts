export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['h', 'd', 'c', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** Carte au format compact "Ah", "Td"… directement compatible pokersolver. */
export type Card = `${Rank}${Suit}`;

/** Générateur pseudo-aléatoire dans [0, 1). Injectable pour des tests déterministes. */
export type RNG = () => number;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** Fisher-Yates, sans mutation de l'entrée. */
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardRank(card: Card): Rank {
  return card[0] as Rank;
}

export function cardSuit(card: Card): Suit {
  return card[1] as Suit;
}

/** Valeur numérique d'un rang : 2 → 2 … As → 14. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2;
}

/** PRNG mulberry32 : rapide et déterministe à partir d'une graine. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
