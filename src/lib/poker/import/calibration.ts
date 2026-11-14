import { createDeck, type Card } from '../cards';
import {
  classifyShownStrength,
  showdownStats,
  type ShowdownStat,
  type VillainAction,
} from './showdown-stats';
import type { ParsedHand } from './parse-pokerstars';

// Calibration des ranges sur les abattages observés, par PONDÉRATION D'ÉQUITÉ
// (on ne touche pas aux combos value validés). L'a priori p₀ = 1.0 = la range
// value-only actuelle : sans données, le classifieur est INCHANGÉ. Avec ≥ 15
// abattages, p baisse vers l'observé (range plus faible → moins d'accusations).

export const PRIOR_SHOWDOWNS = 30; // l'a priori « pèse » 30 abattages
export const MIN_SHOWDOWNS = 15; // sous ce seuil : a priori strict (w = 0)
export const PRIOR_STRONG = 1.0; // a priori = value-only (comportement actuel conservé)

/** Répartition par défaut des mains faibles quand l'observé manque (sans effet si p = 1). */
const DEFAULT_WEAK_MIX = { pair: 0.5, draw: 0.3, air: 0.2 };
const WEAK_SIZE = 180; // combos cibles dans la range faible mélangée

export type WeakMix = { pair: number; draw: number; air: number };

export type Calibration = {
  /** Fraction « value » calibrée (∈ [0,1]) pour une action, par limite. */
  strongFraction: (action: VillainAction, bb: number) => number;
  /** Répartition observée pair / draw / air des mains faibles (normalisée). */
  weakMix: (action: VillainAction, bb: number) => WeakMix;
};

export function buildCalibration(hands: ParsedHand[]): Calibration {
  const byKey = new Map<string, ShowdownStat>();
  for (const s of showdownStats(hands)) byKey.set(`${s.action}|${s.bb}`, s);

  // Repli NL2 (bb=2) si la limite n'a pas assez d'abattages pour l'action.
  const lookup = (action: VillainAction, bb: number): ShowdownStat | undefined => {
    const own = byKey.get(`${action}|${bb}`);
    if (own && own.showdowns >= MIN_SHOWDOWNS) return own;
    const nl2 = byKey.get(`${action}|2`);
    if (nl2 && nl2.showdowns >= MIN_SHOWDOWNS) return nl2;
    return own; // peut être undefined ou < seuil
  };

  const strongFraction = (action: VillainAction, bb: number): number => {
    const stat = lookup(action, bb);
    if (!stat || stat.showdowns < MIN_SHOWDOWNS) return PRIOR_STRONG; // a priori strict
    const w = stat.showdowns / (stat.showdowns + PRIOR_SHOWDOWNS);
    const p = w * stat.twoPairPlusRate + (1 - w) * PRIOR_STRONG;
    return Math.max(0, Math.min(1, p));
  };

  const weakMix = (action: VillainAction, bb: number): WeakMix => {
    const stat = lookup(action, bb);
    if (!stat || stat.showdowns < MIN_SHOWDOWNS) return DEFAULT_WEAK_MIX;
    const pair = stat.counts.overpair + stat.counts.topPair + stat.counts.middlePair;
    const draw = stat.counts.draw;
    const air = stat.counts.air;
    const total = pair + draw + air;
    if (total === 0) return DEFAULT_WEAK_MIX;
    return { pair: pair / total, draw: draw / total, air: air / total };
  };

  return { strongFraction, weakMix };
}

/** Range « faible » (une paire / tirage / air) mélangée selon les fractions observées. */
export function weakRange(board: Card[], dead: Card[], mix: WeakMix): [Card, Card][] {
  const deadSet = new Set<Card>([...board, ...dead]);
  const deck = createDeck().filter((c) => !deadSet.has(c));
  const allowDraw = board.length < 5;
  const pools: Record<'pair' | 'draw' | 'air', [Card, Card][]> = { pair: [], draw: [], air: [] };
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const combo: [Card, Card] = [deck[i], deck[j]];
      const s = classifyShownStrength(combo, board, allowDraw);
      if (s === 'twoPairPlus') continue; // value, pas « faible »
      if (s === 'draw') pools.draw.push(combo);
      else if (s === 'air') pools.air.push(combo);
      else pools.pair.push(combo); // overpair / top / moyenne
    }
  }
  const take = (pool: [Card, Card][], frac: number): [Card, Card][] => {
    const target = Math.round(WEAK_SIZE * frac);
    if (target <= 0 || pool.length === 0) return [];
    if (pool.length <= target) return pool;
    const step = pool.length / target;
    const out: [Card, Card][] = [];
    for (let k = 0; out.length < target && Math.floor(k) < pool.length; k += step) {
      out.push(pool[Math.floor(k)]);
    }
    return out;
  };
  const combos = [...take(pools.pair, mix.pair), ...take(pools.draw, mix.draw), ...take(pools.air, mix.air)];
  return combos.length > 0 ? combos : [...pools.pair, ...pools.air];
}
