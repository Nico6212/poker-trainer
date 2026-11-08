import type { BotProfile } from '../engine';

export const PROFILE_LABELS: Record<BotProfile, string> = {
  station: 'La station',
  tight: 'Le serré',
  aggro: 'L’agressif',
  reg: 'Le reg',
};

export const PROFILE_DESCRIPTIONS: Record<BotProfile, string> = {
  station: 'Paie beaucoup, relance peu, bluffe rarement (typique NL2).',
  tight: 'Joue peu de mains, mise fort quand il a quelque chose.',
  aggro: 'Ouvre large, c-bet souvent, bluffe.',
  reg: 'Solide et équilibré : le joueur type à partir de NL5.',
};

/** Tous les réglages d'un profil : des probabilités (0-1) et des seuils d'équité. */
export type ProfileConfig = {
  // --- Préflop ---
  /** Relance ses mains d'open (sinon il limpe avec). */
  openFreq: number;
  /** Relance une main HORS range (l'agressif ouvre large). */
  openLoose: number;
  /** Limpe une main hors range quand personne n'a relancé. */
  limpLoose: number;
  /** Se contente de payer avec une main de 3-bet (piège passif). */
  slowplay: number;
  /** 3-bet une main de simple call (bluff/pression). */
  threeBetBluff: number;
  /** Multiplie le prix max accepté préflop avec une main de call. */
  priceTolerancePre: number;
  /** Paie une petite relance avec n'importe quoi (curiosité de station). */
  looseCallPre: number;
  // --- Postflop ---
  /** Fréquence de c-bet au flop quand il était l'agresseur préflop. */
  cbet: number;
  /** Équité minimale pour miser pour la value. */
  betValue: number;
  /** Taille de mise en fraction du pot. */
  betSize: number;
  /** Mise sans équité (bluff pur) quand on checke vers lui. */
  bluffBet: number;
  /** Équité minimale pour relancer une mise. */
  raiseValue: number;
  /** Relance une mise en bluff. */
  bluffRaise: number;
  /** Multiplie le prix accepté face à une mise : >1 = serré, <1 = paie trop. */
  priceTolerance: number;
};

export const PROFILES: Record<BotProfile, ProfileConfig> = {
  station: {
    openFreq: 0.35,
    openLoose: 0.02,
    limpLoose: 0.75,
    slowplay: 0.5,
    threeBetBluff: 0,
    priceTolerancePre: 1.5,
    looseCallPre: 0.75,
    cbet: 0.3,
    betValue: 0.68,
    betSize: 0.5,
    bluffBet: 0.03,
    raiseValue: 0.85,
    bluffRaise: 0.02,
    priceTolerance: 0.55,
  },
  tight: {
    openFreq: 0.92,
    openLoose: 0.01,
    limpLoose: 0.05,
    slowplay: 0.12,
    threeBetBluff: 0.02,
    priceTolerancePre: 0.8,
    looseCallPre: 0.04,
    cbet: 0.5,
    betValue: 0.6,
    betSize: 0.75,
    bluffBet: 0.03,
    raiseValue: 0.72,
    bluffRaise: 0.02,
    priceTolerance: 1.15,
  },
  aggro: {
    openFreq: 0.95,
    openLoose: 0.35,
    limpLoose: 0.1,
    slowplay: 0.08,
    threeBetBluff: 0.16,
    priceTolerancePre: 1.1,
    looseCallPre: 0.25,
    cbet: 0.75,
    betValue: 0.55,
    betSize: 0.66,
    bluffBet: 0.2,
    raiseValue: 0.65,
    bluffRaise: 0.08,
    priceTolerance: 0.9,
  },
  reg: {
    openFreq: 0.97,
    openLoose: 0.12,
    limpLoose: 0,
    slowplay: 0.1,
    threeBetBluff: 0.1,
    priceTolerancePre: 1.0,
    looseCallPre: 0.08,
    cbet: 0.65,
    betValue: 0.58,
    betSize: 0.66,
    bluffBet: 0.12,
    raiseValue: 0.68,
    bluffRaise: 0.05,
    priceTolerance: 1.0,
  },
};
