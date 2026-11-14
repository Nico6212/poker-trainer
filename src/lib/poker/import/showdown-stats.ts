import { rankValue, type Card, type Rank } from '../cards';
import { categoryOf, categoryRank } from '../hand-reading';
import { hasBigDraw } from './draws';
import type { ParsedHand, ParsedStreet } from './parse-pokerstars';

// Statistiques d'abattage : pour chaque action AGRESSIVE d'un adversaire MONTRÉ,
// on classe la force RELATIVE AU BOARD à la street de l'action. Une observation par
// action (une relance flop + un tapis river = deux observations). Base la calibration
// des ranges sur ce que les adversaires montrent vraiment. 100 % local.

export type VillainAction =
  | 'raiseFlop'
  | 'raiseTurn'
  | 'raiseRiver'
  | 'checkRaise'
  | 'jamRiver'
  | 'betRiverAfterPassive';

export type ShownStrength = 'twoPairPlus' | 'overpair' | 'topPair' | 'middlePair' | 'draw' | 'air';

const STREET_BOARD: Record<ParsedStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** Catégorie propre au board (0 hauteur … 7 carré). Manuel sous 5 cartes (pas de quinte/couleur faite). */
function boardCategoryRank(board: Card[]): number {
  if (board.length >= 5) return categoryRank(categoryOf(board));
  const counts = new Map<string, number>();
  for (const c of board) counts.set(c[0], (counts.get(c[0]) ?? 0) + 1);
  const vals = [...counts.values()].sort((a, b) => b - a);
  if ((vals[0] ?? 0) >= 4) return 7;
  if ((vals[0] ?? 0) === 3) return 3;
  if ((vals[0] ?? 0) === 2 && (vals[1] ?? 0) === 2) return 2;
  if ((vals[0] ?? 0) === 2) return 1;
  return 0;
}

/**
 * Force des cartes montrées RELATIVE au board (ce que le joueur apporte).
 *  - « deux paires+ » seulement si le joueur améliore la catégorie du board
 *    (board KK7 + 99 = paire moyenne ; board KK7 + Kx = brelan ; board 88552 + Ax = air).
 *  - sinon overpair / top paire / paire moyenne, ou (flop/turn) tirage, ou air.
 */
export function classifyShownStrength(hole: [Card, Card], board: Card[], allowDraw: boolean): ShownStrength {
  const playerCat = categoryRank(categoryOf([...hole, ...board]));
  const boardCat = boardCategoryRank(board);
  const boardRanks = new Set(board.map((c) => c[0]));
  const topBoard = board.length ? Math.max(...board.map((c) => rankValue(c[0] as Rank))) : 0;

  // Brelan+ seulement si le joueur dépasse la catégorie du board (pas un board déjà en brelan).
  if (playerCat >= 3 && playerCat > boardCat) return 'twoPairPlus';
  // Deux paires « réelles » : les DEUX cartes du joueur apparient deux rangs distincts du board.
  if (
    playerCat === 2 &&
    hole[0][0] !== hole[1][0] &&
    boardRanks.has(hole[0][0]) &&
    boardRanks.has(hole[1][0])
  ) {
    return 'twoPairPlus';
  }

  // Paire apportée par le joueur (poche, ou une carte appariant le board).
  let pairRank: number | null = null;
  if (hole[0][0] === hole[1][0]) pairRank = rankValue(hole[0][0] as Rank); // paire servie
  else {
    const matched = [hole[0][0], hole[1][0]].filter((r) => boardRanks.has(r));
    if (matched.length) pairRank = Math.max(...matched.map((r) => rankValue(r as Rank)));
  }
  if (pairRank !== null) {
    if (pairRank > topBoard) return 'overpair';
    if (pairRank === topBoard) return 'topPair';
    return 'middlePair';
  }

  if (allowDraw && hasBigDraw(hole, board)) return 'draw';
  return 'air';
}

const EMPTY_COUNTS = (): Record<ShownStrength, number> => ({
  twoPairPlus: 0,
  overpair: 0,
  topPair: 0,
  middlePair: 0,
  draw: 0,
  air: 0,
});

/** Intervalle de Wilson 95 % d'une proportion (succès sur n). */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export type ShowdownStat = {
  action: VillainAction;
  bb: number;
  showdowns: number;
  counts: Record<ShownStrength, number>;
  twoPairPlusRate: number;
  wilsonLow: number;
  wilsonHigh: number;
};

/** Agrège les abattages par action × limite. Une observation par action agressive. */
export function showdownStats(hands: ParsedHand[]): ShowdownStat[] {
  const agg = new Map<string, { bb: number; action: VillainAction; counts: Record<ShownStrength, number> }>();
  const record = (action: VillainAction, bb: number, strength: ShownStrength) => {
    const key = `${action}|${bb}`;
    let e = agg.get(key);
    if (!e) {
      e = { bb, action, counts: EMPTY_COUNTS() };
      agg.set(key, e);
    }
    e.counts[strength] += 1;
  };

  for (const hand of hands) {
    for (const seatStr of Object.keys(hand.shown)) {
      const seat = Number(seatStr);
      if (seat === hand.heroSeat) continue; // seulement les adversaires
      // Le vilain a-t-il gagné SANS être payé (mise non suivie) ? Alors il montre un
      // bluff volontairement : ce n'est pas un abattage contesté → on l'ignore (biais).
      if (hand.actions.some((a) => a.type === 'uncalled' && a.seat === seat)) continue;
      const hole = hand.shown[seat];
      let aggrFlopTurn = false; // le joueur a-t-il misé/relancé au flop/turn ?
      const checkedOn = new Set<ParsedStreet>();

      for (const a of hand.actions) {
        if (a.seat !== seat) continue;
        if (a.street === 'preflop') continue; // actions trackées = postflop uniquement
        if (a.type === 'check') {
          checkedOn.add(a.street);
          continue;
        }
        if (a.type !== 'bet' && a.type !== 'raise') continue;

        const board = hand.board.slice(0, STREET_BOARD[a.street]);
        let action: VillainAction | null = null;
        if (a.street === 'river' && a.allIn) action = 'jamRiver';
        else if (a.type === 'raise' && checkedOn.has(a.street)) action = 'checkRaise';
        else if (a.type === 'raise')
          action = a.street === 'flop' ? 'raiseFlop' : a.street === 'turn' ? 'raiseTurn' : 'raiseRiver';
        else if (a.street === 'river' && a.type === 'bet' && !a.allIn && !aggrFlopTurn)
          action = 'betRiverAfterPassive';

        if (action) record(action, hand.bb, classifyShownStrength(hole, board, a.street !== 'river'));
        if (a.street === 'flop' || a.street === 'turn') aggrFlopTurn = true;
      }
    }
  }

  return [...agg.values()]
    .map(({ action, bb, counts }) => {
      const showdowns = Object.values(counts).reduce((s, n) => s + n, 0);
      const w = wilson(counts.twoPairPlus, showdowns);
      return {
        action,
        bb,
        showdowns,
        counts,
        twoPairPlusRate: showdowns > 0 ? counts.twoPairPlus / showdowns : 0,
        wilsonLow: w.low,
        wilsonHigh: w.high,
      };
    })
    .sort((a, b) => a.bb - b.bb || a.action.localeCompare(b.action));
}
