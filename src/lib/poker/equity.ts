import { Hand } from 'pokersolver';
import { createDeck, type Card, type RNG } from './cards';

export type EquityResult = {
  /** Probabilité de gagner, égalités comptées pour moitié. Entre 0 et 1. */
  equity: number;
  win: number;
  tie: number;
  lose: number;
  iterations: number;
};

/** Tire `count` cartes au hasard de `pool` (muté). */
function drawFrom(pool: Card[], count: number, rng: RNG): Card[] {
  const drawn: Card[] = [];
  for (let k = 0; k < count; k++) {
    const i = Math.floor(rng() * pool.length);
    drawn.push(pool[i]);
    pool[i] = pool[pool.length - 1];
    pool.pop();
  }
  return drawn;
}

function removeCard(pool: Card[], card: Card): void {
  const i = pool.indexOf(card);
  if (i >= 0) {
    pool[i] = pool[pool.length - 1];
    pool.pop();
  }
}

/**
 * Équité Monte-Carlo de la main héros contre une range, board partiel complété au hasard.
 * ~5 000 itérations suffisent pour ±1,5 point — à lancer dans le Web Worker côté UI.
 */
export function calcEquity(opts: {
  hero: [Card, Card];
  board: Card[];
  /** Combos possibles de l'adversaire ; null = main aléatoire (range inconnue). */
  villainCombos: [Card, Card][] | null;
  iterations?: number;
  rng?: RNG;
}): EquityResult {
  const { hero, board } = opts;
  const iterations = opts.iterations ?? 5000;
  const rng = opts.rng ?? Math.random;

  const dead = new Set<Card>([...hero, ...board]);
  const baseDeck = createDeck().filter((c) => !dead.has(c));
  const combos =
    opts.villainCombos?.filter(([a, b]) => !dead.has(a) && !dead.has(b)) ?? null;
  const useCombos = combos !== null && combos.length > 0;
  const toCome = 5 - board.length;

  let win = 0;
  let tie = 0;
  for (let n = 0; n < iterations; n++) {
    const pool = [...baseDeck];
    let villain: [Card, Card];
    if (useCombos) {
      villain = combos[Math.floor(rng() * combos.length)];
      removeCard(pool, villain[0]);
      removeCard(pool, villain[1]);
    } else {
      const [v1, v2] = drawFrom(pool, 2, rng);
      villain = [v1, v2];
    }
    const runout = drawFrom(pool, toCome, rng);
    const fullBoard = [...board, ...runout];
    const heroHand = Hand.solve([...hero, ...fullBoard]);
    const villainHand = Hand.solve([...villain, ...fullBoard]);
    const winners = Hand.winners([heroHand, villainHand]);
    if (winners.length === 2) tie++;
    else if (winners[0] === heroHand) win++;
  }

  return {
    equity: (win + tie / 2) / iterations,
    win,
    tie,
    lose: iterations - win - tie,
    iterations,
  };
}
