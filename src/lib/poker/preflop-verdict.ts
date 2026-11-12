import { suggestRaise } from './advice';
import type { Rank } from './cards';
import { RANKS } from './cards';
import { legalActions, playerAt, type HandState } from './engine';
import { pushFoldSpot } from './pushfold';
import {
  callRangeFor,
  expandNotation,
  formatOf,
  handClass,
  openRangeFor,
  positionOf,
  threeBetRangeFor,
  type PositionLabel,
} from './ranges';

// Verdict préflop : la bonne décision dépend de la RANGE selon la position,
// pas d'une comparaison équité / cote. Logique pure, testée.

export type PreflopAction = 'raise' | 'call' | 'fold';

export type PreflopSituation = 'open' | 'vs-raise' | 'push-fold';

export type AidLevel = 'decouverte' | 'masque' | 'examen';

/**
 * Faut-il montrer les indices de l'action conseillée (texte du verdict, entourage
 * du bouton, grisé du limp, chip « Conseil ») AVANT la décision ?
 * Découverte : toujours. Masqué : jamais (révélé après coup). Examen : seulement
 * une fois la question répondue.
 */
export function preflopHintsVisible(aid: AidLevel, answered: boolean): boolean {
  if (aid === 'decouverte') return true;
  if (aid === 'masque') return false;
  return answered;
}

export type PreflopVerdict = {
  situation: PreflopSituation;
  position: PositionLabel;
  /** Heads-up : le bouton est aussi la petite blinde. */
  headsUp: boolean;
  /** Classe de main, ex. "76o". */
  hand: string;
  /** Action(s) recommandée(s) ; deux si la main est mixte (call OU 3-bet). */
  recommended: PreflopAction[];
  /** Montant total conseillé si « raise » est recommandé (centimes/jetons). */
  raiseTo: number | null;
  isAllIn: boolean;
  /** Compléter / limper est légal mais déconseillé → bouton Payer grisé. */
  limpDiscouraged: boolean;
  /** Libellé de la range utilisée, ex. « range d'open BTN ». */
  rangeLabel: string;
  /** Classes de la grille « Pourquoi ? » (fold = tout le reste). */
  chart: { raise: string[]; call: string[] };
  bb: number;
};

/** Au-delà, on joue au poker normal ; en dessous, c'est push ou fold. */
const SHORT_STACK_BB = 13.5;

function firstOpponent(state: HandState, heroSeat: number): number {
  const opp =
    state.players.find((p) => p.seat !== heroSeat && p.status !== 'folded') ??
    state.players.find((p) => p.seat !== heroSeat);
  return opp?.seat ?? heroSeat;
}

/**
 * Verdict de range pour le joueur dont c'est le tour, préflop.
 * null si on n'est pas préflop, ou si la grosse blinde peut checker gratuitement
 * (ce n'est pas un limp : rien à corriger).
 */
export function preflopVerdict(state: HandState, heroSeat: number): PreflopVerdict | null {
  if (state.street !== 'preflop' || state.result || state.toActSeat !== heroSeat) return null;
  const hero = playerAt(state, heroSeat);
  if (!hero.holeCards) return null;

  const la = legalActions(state);
  const bb = state.blinds.bb;
  const position = positionOf(state, heroSeat);
  const hand = handClass(hero.holeCards[0], hero.holeCards[1]);
  const format = formatOf(state.players.length);
  const headsUp = format === 2;
  const facingRaise = state.currentBet > bb;

  // Option de la BB : check gratuit, aucune décision à corriger.
  if (!facingRaise && la.canCheck) return null;

  // Tapis court : push ou fold, jamais « relance à 3 BB ».
  const heroEffBB = (hero.stack + hero.streetBet) / bb;
  if (heroEffBB <= SHORT_STACK_BB) {
    const spot = pushFoldSpot(state, heroSeat);
    let recommended: PreflopAction[];
    if (spot?.kind === 'open-shove') recommended = [spot.shove ? 'raise' : 'fold'];
    else if (spot?.kind === 'call-shove') recommended = [spot.call ? 'call' : 'fold'];
    else recommended = ['fold']; // non couvert par la table simplifiée : crochet prudent
    const push = recommended.includes('raise');
    return {
      situation: 'push-fold',
      position,
      headsUp,
      hand,
      recommended,
      raiseTo: push ? la.maxTo : null,
      isAllIn: push,
      limpDiscouraged: false,
      rangeLabel: `push/fold ≈ ${Math.round(heroEffBB)} BB`,
      chart: { raise: [], call: [] },
      bb,
    };
  }

  const villainSeat = state.lastAggressorSeat ?? firstOpponent(state, heroSeat);
  const advice = suggestRaise(state, heroSeat, villainSeat);

  if (!facingRaise) {
    const openList = openRangeFor(format, position);
    const openSet = expandNotation(openList);
    const inRange = openSet.has(hand);
    return {
      situation: 'open',
      position,
      headsUp,
      hand,
      recommended: inRange ? ['raise'] : ['fold'],
      raiseTo: inRange ? (advice?.amount ?? null) : null,
      isAllIn: inRange ? (advice?.isAllIn ?? false) : false,
      // Compléter la blinde est possible (callAmount > 0) mais à proscrire.
      limpDiscouraged: la.callAmount > 0,
      rangeLabel: `range d'open ${position}`,
      chart: { raise: [...openSet], call: [] },
      bb,
    };
  }

  const callSet = expandNotation(callRangeFor(format, position));
  const threeBetSet = expandNotation(threeBetRangeFor(format, position));
  const in3 = threeBetSet.has(hand);
  const inCall = callSet.has(hand);
  const recommended: PreflopAction[] =
    in3 && inCall ? ['raise', 'call'] : in3 ? ['raise'] : inCall ? ['call'] : ['fold'];
  return {
    situation: 'vs-raise',
    position,
    headsUp,
    hand,
    recommended,
    raiseTo: in3 ? (advice?.amount ?? null) : null,
    isAllIn: in3 ? (advice?.isAllIn ?? false) : false,
    limpDiscouraged: false,
    rangeLabel: `défense ${position} face à une relance`,
    chart: { raise: [...threeBetSet], call: [...callSet] },
    bb,
  };
}

// --- Grille 13×13 « Pourquoi ? » ---

export type GridAction = 'raise' | 'call' | 'fold';
export type GridCell = { hand: string; action: GridAction; isHero: boolean };

/** Rangs du haut (A) vers le bas (2), convention des grilles de range. */
export const GRID_RANKS: Rank[] = [...RANKS].reverse() as Rank[];

/**
 * Matrice 13×13 : diagonale = paires, triangle supérieur = suited, inférieur = offsuit.
 * Chaque case porte son action (raise/call/fold) et si c'est la main du héros.
 */
export function buildRangeGrid(verdict: PreflopVerdict): GridCell[][] {
  const raise = new Set(verdict.chart.raise);
  const call = new Set(verdict.chart.call);
  return GRID_RANKS.map((r1, i) =>
    GRID_RANKS.map((r2, j) => {
      const hand = i === j ? `${r1}${r1}` : i < j ? `${r1}${r2}s` : `${r2}${r1}o`;
      const action: GridAction = raise.has(hand) ? 'raise' : call.has(hand) ? 'call' : 'fold';
      return { hand, action, isHero: hand === verdict.hand };
    }),
  );
}
