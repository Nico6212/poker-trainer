import { Hand } from 'pokersolver';
import { createDeck, type Card, type RNG } from './cards';

export type OutsResult = {
  /** Les cartes qui te font passer devant la range. */
  outs: Card[];
  /** true si tu es déjà devant la majorité de la range : pas d'outs à compter. */
  aheadNow: boolean;
  /** Part des combos de la range contre lesquels tu es devant, maintenant (égalité = ½). */
  aheadShare: number;
};

/** Au-delà, on échantillonne la range pour garder le calcul rapide. */
const MAX_COMBOS = 60;

function aheadShare(hero: [Card, Card], board: Card[], combos: [Card, Card][]): number {
  if (combos.length === 0) return 0;
  const heroHand = Hand.solve([...hero, ...board]);
  let score = 0;
  for (const villain of combos) {
    const villainHand = Hand.solve([...villain, ...board]);
    const winners = Hand.winners([heroHand, villainHand]);
    if (winners.length === 2) score += 0.5;
    else if (winners[0] === heroHand) score += 1;
  }
  return score / combos.length;
}

/**
 * Outs pédagogiques : une carte est un out si, une fois tombée, tu passes devant
 * la majorité de la range estimée (alors que tu es derrière pour l'instant).
 * Ne s'applique qu'au flop et au turn.
 */
export function findOuts(opts: {
  hero: [Card, Card];
  board: Card[];
  /** Combos de la range estimée ; null = main aléatoire (on échantillonne). */
  villainCombos: [Card, Card][] | null;
  rng?: RNG;
}): OutsResult {
  const { hero, board } = opts;
  if (board.length < 3 || board.length >= 5) return { outs: [], aheadNow: false, aheadShare: 0 };

  const rng = opts.rng ?? Math.random;
  const dead = new Set<Card>([...hero, ...board]);
  const unseen = createDeck().filter((c) => !dead.has(c));

  let combos: [Card, Card][];
  if (opts.villainCombos) {
    combos = opts.villainCombos.filter(([a, b]) => !dead.has(a) && !dead.has(b));
  } else {
    combos = [];
    for (let i = 0; i < unseen.length; i++)
      for (let j = i + 1; j < unseen.length; j++) combos.push([unseen[i], unseen[j]]);
  }
  if (combos.length === 0) return { outs: [], aheadNow: false, aheadShare: 0 };
  while (combos.length > MAX_COMBOS) combos.splice(Math.floor(rng() * combos.length), 1);

  const current = aheadShare(hero, board, combos);
  if (current >= 0.5) return { outs: [], aheadNow: true, aheadShare: current };

  const outs: Card[] = [];
  for (const candidate of unseen) {
    // Si cette carte tombe, l'adversaire ne peut pas la tenir : on écarte les combos en conflit.
    const live = combos.filter(([a, b]) => a !== candidate && b !== candidate);
    if (live.length === 0) continue;
    if (aheadShare(hero, [...board, candidate], live) >= 0.5) outs.push(candidate);
  }
  return { outs, aheadNow: false, aheadShare: current };
}

/** Probabilité exacte de toucher un out (cartes non vues du point de vue du héros). */
export function hitOdds(outsCount: number, unseenCount: number, cardsToCome: 1 | 2): number {
  if (outsCount <= 0 || unseenCount <= 0) return 0;
  if (cardsToCome === 1) return outsCount / unseenCount;
  const missFirst = (unseenCount - outsCount) / unseenCount;
  const missSecond = (unseenCount - 1 - outsCount) / (unseenCount - 1);
  return 1 - missFirst * missSecond;
}

/** Règle du 2 et du 4 : outs × 2 par carte à venir, en fraction (9 outs × 2 → 0,18). */
export function ruleOf2and4(outsCount: number, cardsToCome: 1 | 2): number {
  return Math.min(1, (outsCount * 2 * cardsToCome) / 100);
}

/**
 * Règle du 2 et du 4 CORRIGÉE. Au-delà de 8 outs sur deux cartes, le × 4 surévalue
 * (il double-compte les tirages qui touchent aux deux cartes) : on passe à 3n + 8,
 * bien plus proche de l'exact (15 outs → 53 % au lieu de 60 %, exact ≈ 54 %).
 * Sur une seule carte, le × 2 ne surévalue pas : pas de correction.
 */
export function ruleOf2and4Corrected(outsCount: number, cardsToCome: 1 | 2): number {
  if (cardsToCome === 2 && outsCount > 8) return Math.min(1, (3 * outsCount + 8) / 100);
  return ruleOf2and4(outsCount, cardsToCome);
}
