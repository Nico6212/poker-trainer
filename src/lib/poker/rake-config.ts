import type { ParsedHand } from './import/parse-pokerstars';

// Configuration du rake (prélèvement du site) pour la table d'entraînement et les
// calculs théoriques. Sur PokerStars.FR, le PLAFOND dépend du nombre de joueurs
// distribués (mesuré sur les historiques utilisateur, 11/2026) :
//   2-4 joueurs → 10 c · 5 joueurs → 15 c · 6 joueurs → 25 c (NL2).
// « No flop, no drop » : aucun rake si le flop n'est pas vu.

export type RakeEntry = {
  site: string;
  region: string;
  stake: string; // 'NL2' | 'NL5' | 'NL10'
  /** Tranche de joueurs distribués concernée (le plafond en dépend). */
  playersDealt: { min: number; max: number };
  rate: number; // fraction du pot (0.06)
  capCents: number | null; // plafond en centimes ; null si non mesuré/atteint
  noFlopNoDrop: boolean;
  effectiveFrom: string; // ISO
  source: string;
};

const MEASURED = 'mesuré sur historiques utilisateur, 11/2026';
const NOT_SEEN = 'plafond non atteint dans les mains, 11/2026';

export const RAKE_CONFIG: RakeEntry[] = [
  // NL2 — plafonds mesurés par tranche de joueurs distribués.
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL2', playersDealt: { min: 2, max: 4 }, rate: 0.06, capCents: 10, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: MEASURED },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL2', playersDealt: { min: 5, max: 5 }, rate: 0.06, capCents: 15, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: MEASURED },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL2', playersDealt: { min: 6, max: 9 }, rate: 0.06, capCents: 25, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: MEASURED },
  // NL5 / NL10 — plafond non mesuré : null par tranche tant que l'échantillon ne le montre pas.
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL5', playersDealt: { min: 2, max: 4 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL5', playersDealt: { min: 5, max: 5 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL5', playersDealt: { min: 6, max: 9 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL10', playersDealt: { min: 2, max: 4 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL10', playersDealt: { min: 5, max: 5 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
  { site: 'PokerStars.FR', region: 'FR', stake: 'NL10', playersDealt: { min: 6, max: 9 }, rate: 0.06, capCents: null, noFlopNoDrop: true, effectiveFrom: '2026-11-01', source: NOT_SEEN },
];

/** Étiquette de limite depuis la grosse blinde en centimes : 2 → « NL2 ». */
export function stakeLabel(bbCents: number): string {
  return `NL${bbCents}`;
}

const inBracket = (e: RakeEntry, pd: number) => pd >= e.playersDealt.min && pd <= e.playersDealt.max;

/** Entrée la plus spécifique (site + stake + tranche), repli sur même stake, puis NL2. */
export function rakeEntryFor(opts: { site?: string; stake?: string; playersDealt?: number }): RakeEntry {
  const site = opts.site ?? 'PokerStars.FR';
  const stake = opts.stake ?? 'NL2';
  const pd = opts.playersDealt ?? 6;
  return (
    RAKE_CONFIG.find((e) => e.site === site && e.stake === stake && inBracket(e, pd)) ??
    RAKE_CONFIG.find((e) => e.stake === stake && inBracket(e, pd)) ??
    RAKE_CONFIG.find((e) => e.stake === 'NL2' && inBracket(e, pd)) ??
    RAKE_CONFIG[RAKE_CONFIG.length - 1]
  );
}

/** Rake théorique d'un pot (centimes entiers) : 0 sans flop, sinon min(⌊pot×taux⌋, plafond). */
export function theoreticalRake(potCents: number, sawFlop: boolean, entry: RakeEntry): number {
  if (!sawFlop && entry.noFlopNoDrop) return 0;
  const raw = Math.floor(potCents * entry.rate);
  return entry.capCents === null ? raw : Math.min(raw, entry.capCents);
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const BRACKETS = [
  { min: 2, max: 4 },
  { min: 5, max: 5 },
  { min: 6, max: 9 },
];

export type RakeMeasure = {
  stake: string; // 'NL2'…
  min: number;
  max: number;
  /** Médiane rake/pot sur les pots ≥ 20 BB (null si aucun). */
  rate: number | null;
  /** Plafond retenu seulement si ≥ 3 pots partagent le rake maximal. */
  capCents: number | null;
  sampleSize: number;
};

/**
 * Mesure le taux et le plafond PAR LIMITE ET PAR TRANCHE de joueurs distribués
 * (le plafond dépend des deux ; mélanger les limites fausserait le max observé).
 */
export function measureRake(hands: ParsedHand[]): RakeMeasure[] {
  const stakes = [...new Set(hands.map((h) => h.bb))].sort((a, b) => a - b);
  const out: RakeMeasure[] = [];
  for (const bb of stakes) {
    for (const b of BRACKETS) {
      const pots = hands.filter(
        (h) =>
          h.bb === bb &&
          h.board.length >= 3 &&
          h.totalPot > 0 &&
          h.playersDealt >= b.min &&
          h.playersDealt <= b.max,
      );
      const ratios = pots.filter((h) => h.totalPot >= 20 * h.bb).map((h) => h.rake / h.totalPot);
      const maxRake = pots.reduce((m, h) => Math.max(m, h.rake), 0);
      const atMax = pots.filter((h) => h.rake === maxRake).length;
      out.push({
        stake: stakeLabel(bb),
        ...b,
        rate: median(ratios),
        capCents: maxRake > 0 && atMax >= 3 ? maxRake : null,
        sampleSize: pots.length,
      });
    }
  }
  return out;
}
