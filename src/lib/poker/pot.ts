// Tous les montants du moteur sont en centimes (entiers) : jamais de flottants.

export type Pot = {
  amount: number;
  /** Sièges pouvant remporter ce pot (non couchés, ayant investi au moins ce niveau). */
  eligibleSeats: number[];
};

export type PotContribution = {
  seat: number;
  /** Total investi sur la main entière. */
  total: number;
  folded: boolean;
};

/**
 * Découpe les contributions en pot principal + side pots.
 * Les jetons d'un joueur couché restent dans les pots mais il n'est éligible à aucun.
 */
export function computePots(contributions: PotContribution[]): Pot[] {
  const levels = [
    ...new Set(contributions.filter((c) => !c.folded && c.total > 0).map((c) => c.total)),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previous = 0;
  for (const level of levels) {
    let amount = 0;
    const eligibleSeats: number[] = [];
    for (const c of contributions) {
      amount += Math.max(0, Math.min(c.total, level) - previous);
      if (!c.folded && c.total >= level) eligibleSeats.push(c.seat);
    }
    pots.push({ amount, eligibleSeats });
    previous = level;
  }

  // Filet de sécurité : des jetons couchés au-dessus du dernier niveau vivant
  // (impossible si les mises non suivies ont bien été remboursées) vont au dernier pot.
  const distributed = pots.reduce((sum, p) => sum + p.amount, 0);
  const total = contributions.reduce((sum, c) => sum + c.total, 0);
  if (total > distributed && pots.length > 0) {
    pots[pots.length - 1].amount += total - distributed;
  }

  // Fusionne les pots consécutifs ayant les mêmes éligibles (niveaux créés par un joueur couché).
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.eligibleSeats.length === pot.eligibleSeats.length &&
      last.eligibleSeats.every((seat, i) => seat === pot.eligibleSeats[i])
    ) {
      last.amount += pot.amount;
    } else {
      merged.push(pot);
    }
  }
  return merged;
}

export type PotOdds = {
  callAmount: number;
  /** Pot après ton call : pot actuel (mises comprises) + ton call. */
  finalPot: number;
  /** Équité minimale pour payer : callAmount / finalPot, entre 0 et 1. */
  required: number;
};

/**
 * Cote du pot telle qu'affichée par le panneau pédagogique :
 * « Pot 0,40 € + sa mise 0,20 € + ton call 0,20 € = pot final 0,80 € → il te faut 25 % ».
 *
 * @param callAmount ce qu'il reste à payer pour suivre
 * @param potTotal   tout ce qui est déjà au milieu, mise adverse comprise
 */
export function potOdds(callAmount: number, potTotal: number): PotOdds {
  const finalPot = potTotal + callAmount;
  return {
    callAmount,
    finalPot,
    required: finalPot === 0 ? 0 : callAmount / finalPot,
  };
}
