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

export type PotOddsDetail = {
  /** Ce que le héros doit AJOUTER (mise adverse − ce qu'il a déjà mis sur la street). */
  toCall: number;
  /** Tout ce qui est au milieu, mises de la street en cours des deux joueurs comprises. */
  potBefore: number;
  /** potBefore + toCall. */
  finalPot: number;
  /** toCall / finalPot, entre 0 et 1. */
  required: number;
};

/**
 * Cote du pot à partir des montants bruts (centimes). Sépare clairement ce que le
 * héros AJOUTE de ce qu'il a déjà engagé : indispensable quand une blinde est déjà
 * postée (la petite blinde ne « paie » que la différence).
 */
export function potOddsDetail(opts: {
  /** Pot des streets déjà closes. */
  collectedPot: number;
  /** Ce que le héros a déjà mis sur la street en cours (blinde comprise). */
  heroStreetBet: number;
  /** Mise TOTALE de l'adversaire sur la street en cours. */
  villainBet: number;
}): PotOddsDetail {
  const toCall = Math.max(0, opts.villainBet - opts.heroStreetBet);
  const potBefore = opts.collectedPot + opts.heroStreetBet + opts.villainBet;
  const finalPot = potBefore + toCall;
  return { toCall, potBefore, finalPot, required: finalPot === 0 ? 0 : toCall / finalPot };
}

// Le % requis se mappe directement vers une fraction du pot, indépendamment de la
// façon dont le pot s'est construit (blindes comprises) — c'est l'antisèche du joueur.
const REQUIRED_LABELS: { required: number; label: string }[] = [
  { required: 0.17, label: '¼ pot' },
  { required: 0.2, label: '⅓ pot' },
  { required: 0.25, label: '½ pot' },
  { required: 0.29, label: '⅔ pot' },
  { required: 0.33, label: 'pot' },
  { required: 0.4, label: '2× pot' },
];

/** Fraction du pot correspondant au % requis, ou null si l'écart dépasse 2 points. */
export function potFractionLabel(required: number): string | null {
  let best: { required: number; label: string } | null = null;
  let bestDiff = Infinity;
  for (const row of REQUIRED_LABELS) {
    const diff = Math.abs(row.required - required);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return best && bestDiff <= 0.02 + 1e-9 ? best.label : null;
}

/**
 * Phrase pédagogique « ce qu'il te faut ».
 * - heroStreetBet === 0 (rien engagé sur la street) : « Il mise ½ pot → il te faut 25 % ».
 * - sinon (petite blinde, ou relance après avoir déjà misé) : on ne dit pas « il mise X »,
 *   on part de ce que TU ajoutes : « Tu ajoutes 0,01 € pour un pot final de 0,04 € →
 *   il te faut 25 %, comme face à une mise de ½ pot ».
 */
export function requiredSentence(
  detail: PotOddsDetail,
  heroStreetBet: number,
  fmt: (cents: number) => string,
): string {
  const label = potFractionLabel(detail.required);
  const pct = `${Math.round(detail.required * 100)} %`;
  const times = Math.max(2, Math.round(1 / Math.max(0.01, detail.required)));

  if (heroStreetBet === 0) {
    return label
      ? `Il mise ${label} → il te faut ${pct}, soit gagner environ 1 fois sur ${times}.`
      : `Il te faut ${pct}, soit gagner environ 1 fois sur ${times}.`;
  }

  const base = `Tu ajoutes ${fmt(detail.toCall)} pour un pot final de ${fmt(detail.finalPot)} → il te faut ${pct}`;
  return label
    ? `${base}, comme face à une mise de ${label}.`
    : `${base}, soit gagner environ 1 fois sur ${times}.`;
}
