import type { ParsedHand } from './import/parse-pokerstars';
import { rakeSummary } from './import/rake';

// Intervalle de confiance du winrate, STRICTEMENT par limite (les BB n'ont pas la
// même valeur d'une limite à l'autre). Sous MIN_SAMPLE mains : pas d'intervalle.

export const MIN_SAMPLE = 1000;
export const SIGMAS = [80, 90, 100] as const;
export const DEFAULT_SIGMA = 90;

/** CDF normale standard (Zelen & Severo, erreur < 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** Mains nécessaires pour une marge donnée (BB/100) : 100 × (1,96 σ / marge)². */
export function handsForMargin(targetBB100: number, sigma = DEFAULT_SIGMA): number {
  return Math.round(100 * ((1.96 * sigma) / targetBB100) ** 2);
}

export type WinrateCI = {
  bb: number;
  hands: number;
  netBB100: number;
  grossBB100: number;
  sigma: number;
  tooSmall: boolean;
  marginBB100: number | null;
  lowBB100: number | null;
  highBB100: number | null;
  probWinning: number | null;
  handsForMargin10: number;
};

/** IC du winrate pour UNE limite. Sous 1000 mains : tooSmall, bornes/proba = null. */
export function winrateCI(
  bb: number,
  hands: number,
  netBB100: number,
  grossBB100: number,
  sigma = DEFAULT_SIGMA,
): WinrateCI {
  const tooSmall = hands < MIN_SAMPLE;
  const se = hands > 0 ? sigma / Math.sqrt(hands / 100) : Infinity;
  const margin = tooSmall ? null : 1.96 * se;
  return {
    bb,
    hands,
    netBB100,
    grossBB100,
    sigma,
    tooSmall,
    marginBB100: margin,
    lowBB100: margin === null ? null : netBB100 - margin,
    highBB100: margin === null ? null : netBB100 + margin,
    probWinning: tooSmall ? null : normalCdf(netBB100 / se),
    handsForMargin10: handsForMargin(10, sigma),
  };
}

/** Groupe les mains par limite (bb) et calcule l'IC de chacune, séparément. */
export function winrateCIByLimit(hands: ParsedHand[], sigma = DEFAULT_SIGMA): WinrateCI[] {
  const byBb = new Map<number, ParsedHand[]>();
  for (const h of hands) {
    const list = byBb.get(h.bb) ?? [];
    list.push(h);
    byBb.set(h.bb, list);
  }
  return [...byBb.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bb, hs]) => {
      const s = rakeSummary(hs);
      return winrateCI(bb, hs.length, s.netBB100, s.grossBB100, sigma);
    });
}
