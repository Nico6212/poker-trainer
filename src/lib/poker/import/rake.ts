import type { ParsedHand } from './parse-pokerstars';

// Rake du héros et agrégats pour le bilan. Deux méthodes d'attribution :
//  - CONTRIBUÉ (principale) : rake × (investi du héros ÷ total pot) ;
//  - par main distribuée (ancienne méthode PokerStars) : rake ÷ joueurs distribués.

/**
 * Rake attribué au héros sur une main (méthode contribuée), en centimes DÉCIMAUX.
 * On n'arrondit JAMAIS par main : sur les petits pots la part (0,3-0,4 c) tomberait
 * à 0 et des centimes disparaîtraient sur le total. L'arrondi se fait à l'affichage.
 */
export function rakeContributed(hand: ParsedHand): number {
  if (hand.totalPot <= 0) return 0;
  return (hand.rake * hand.heroInvested) / hand.totalPot;
}

/** Rake par main distribuée (info) : rake ÷ nombre de joueurs distribués, en centimes. */
export function rakeByDistributedHand(hand: ParsedHand): number {
  return hand.playersDealt > 0 ? hand.rake / hand.playersDealt : 0;
}

export type RakeSummary = {
  hands: number;
  /** Rake contribué total, en centimes. */
  rakeCents: number;
  rakeBB100: number;
  /** Winrate net (réel, après rake) en BB/100. */
  netBB100: number;
  /** Winrate brut (avant rake) = net + rake contribué, en BB/100. */
  grossBB100: number;
  /** Rakeback récupéré (centimes) et winrate net ajusté. */
  rakebackCents: number;
  adjustedBB100: number;
};

/** Agrège le rake et les winrates sur un lot de mains (une session, une limite, tout l'import). */
export function rakeSummary(hands: ParsedHand[], rakeback = 0): RakeSummary {
  let netBB = 0;
  let rakeBB = 0;
  let rakeCents = 0;
  for (const h of hands) {
    const contributed = rakeContributed(h);
    rakeCents += contributed;
    if (h.bb > 0) {
      netBB += h.heroNet / h.bb;
      rakeBB += contributed / h.bb;
    }
  }
  const n = hands.length;
  const per100 = (bb: number) => (n > 0 ? (bb / n) * 100 : 0);
  const rakebackCents = rakeCents * rakeback; // décimal, arrondi à l'affichage
  return {
    hands: n,
    rakeCents,
    rakeBB100: per100(rakeBB),
    netBB100: per100(netBB),
    grossBB100: per100(netBB + rakeBB),
    rakebackCents,
    adjustedBB100: per100(netBB + rakeBB * rakeback),
  };
}

/** Bilan du rake par limite (grosse blinde en centimes), trié par BB croissante. */
export function rakeByLimit(hands: ParsedHand[], rakeback = 0): { bb: number; summary: RakeSummary }[] {
  const byBb = new Map<number, ParsedHand[]>();
  for (const h of hands) {
    const list = byBb.get(h.bb) ?? [];
    list.push(h);
    byBb.set(h.bb, list);
  }
  return [...byBb.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bb, hs]) => ({ bb, summary: rakeSummary(hs, rakeback) }));
}
