import type { RNG } from '../cards';
import {
  legalActions,
  playerAt,
  type Action,
  type HandState,
  type LegalActions,
  type Player,
} from '../engine';
import { calcEquity } from '../equity';
import { potOdds } from '../pot';
import { pushFoldSpot } from '../pushfold';
import {
  CALL_RANGES,
  OPEN_RANGES,
  THREEBET_RANGES,
  combosForClasses,
  estimatePreflopRange,
  expandNotation,
  handClass,
  positionOf,
} from '../ranges';
import { PROFILES, type ProfileConfig } from './profiles';

export type BotOptions = {
  /** Itérations du Monte-Carlo rapide postflop (réduit dans les tests). */
  equityIterations?: number;
};

const DEFAULT_ITERATIONS = 250;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function call(la: LegalActions): Action {
  return la.callAmount > 0 ? { type: 'call' } : { type: 'check' };
}

function betOf(la: LegalActions, amount: number): Action {
  if (!la.canBet) return call(la);
  return { type: 'bet', amount: clamp(amount, la.minBet, la.maxTo) };
}

function raiseTo(la: LegalActions, amount: number): Action {
  if (!la.canRaise) return call(la);
  return { type: 'raise', amount: clamp(amount, la.minRaiseTo, la.maxTo) };
}

/** L'adversaire de référence : le dernier agresseur encore en jeu, sinon le premier actif. */
function pickOpponent(state: HandState, mySeat: number): number {
  if (state.lastAggressorSeat !== null && state.lastAggressorSeat !== mySeat) {
    const aggressor = playerAt(state, state.lastAggressorSeat);
    if (aggressor.status !== 'folded') return aggressor.seat;
  }
  const other = state.players.find((p) => p.seat !== mySeat && p.status !== 'folded');
  if (!other) throw new Error('Aucun adversaire en jeu');
  return other.seat;
}

function lastPreflopRaiser(state: HandState): number | null {
  let seat: number | null = null;
  for (const entry of state.history) {
    if (entry.street !== 'preflop') break;
    if (entry.action.type === 'raise' || entry.action.type === 'bet') seat = entry.seat;
  }
  return seat;
}

/**
 * Décision du bot dont c'est le tour. Préflop : ranges par position + action devant.
 * Postflop : équité rapide contre la range estimée de l'adversaire + facteur aléatoire du profil.
 */
export function decideBot(state: HandState, rng: RNG = Math.random, opts: BotOptions = {}): Action {
  const la = legalActions(state);
  const me = playerAt(state, la.seat);
  if (!me.holeCards) throw new Error('Le bot n’a pas de cartes');
  const profile = PROFILES[me.botProfile ?? 'station'];
  return state.street === 'preflop'
    ? preflop(state, la, me, profile, rng)
    : postflop(state, la, me, profile, rng, opts.equityIterations ?? DEFAULT_ITERATIONS);
}

function preflop(
  state: HandState,
  la: LegalActions,
  me: Player,
  profile: ProfileConfig,
  rng: RNG,
): Action {
  const bb = state.blinds.bb;

  // À tapis court, tous les profils basculent en push/fold (tableaux ~Nash) :
  // c'est la stratégie correcte, et le héros s'entraîne contre elle.
  const spot = pushFoldSpot(state, me.seat);
  if (spot) {
    if (spot.kind === 'open-shove') {
      if (spot.shove) return raiseTo(la, la.maxTo);
      return la.canCheck ? { type: 'check' } : { type: 'fold' };
    }
    if (spot.call) return call(la);
    return la.canCheck ? { type: 'check' } : { type: 'fold' };
  }
  const position = positionOf(state, me.seat);
  const cls = handClass(me.holeCards![0], me.holeCards![1]);
  const openRange = expandNotation(OPEN_RANGES[position]);
  const callRange = expandNotation(CALL_RANGES[position]);
  const threeBetRange = expandNotation(THREEBET_RANGES[position]);

  let raises = 0;
  let limpers = 0;
  for (const entry of state.history) {
    if (entry.street !== 'preflop') break;
    if (entry.action.type === 'raise' || entry.action.type === 'bet') raises++;
    else if (entry.action.type === 'call' && raises === 0) limpers++;
  }

  if (raises === 0) {
    const openTo = 3 * bb + limpers * bb;
    const playable = openRange.has(cls) || threeBetRange.has(cls);
    if (playable && rng() < profile.openFreq) return raiseTo(la, openTo);
    if (!playable && rng() < profile.openLoose) return raiseTo(la, openTo);
    if (la.canCheck) return { type: 'check' };
    if (playable || rng() < profile.limpLoose) return call(la); // limpe / complète
    return { type: 'fold' };
  }

  // Au moins une relance devant.
  if (threeBetRange.has(cls)) {
    if (la.canRaise && rng() >= profile.slowplay) return raiseTo(la, 3 * state.currentBet);
    return call(la);
  }
  if (callRange.has(cls)) {
    if (la.canRaise && rng() < profile.threeBetBluff) return raiseTo(la, 3 * state.currentBet);
    if (la.callAmount <= bb * 12 * profile.priceTolerancePre) return call(la);
    return { type: 'fold' };
  }
  if (rng() < profile.looseCallPre && la.callAmount <= bb * 4) return call(la);
  return la.canCheck ? { type: 'check' } : { type: 'fold' };
}

function postflop(
  state: HandState,
  la: LegalActions,
  me: Player,
  profile: ProfileConfig,
  rng: RNG,
  iterations: number,
): Action {
  const potTotal = state.pot + state.players.reduce((sum, p) => sum + p.streetBet, 0);
  const villainSeat = pickOpponent(state, me.seat);
  const range = estimatePreflopRange(state, villainSeat);
  const combos = range.classes
    ? combosForClasses(range.classes, [...me.holeCards!, ...state.board])
    : null;
  const { equity } = calcEquity({
    hero: me.holeCards!,
    board: state.board,
    villainCombos: combos,
    iterations,
    rng,
  });
  // Décote multi-way : l'équité est calculée contre UNE range, pas contre plusieurs mains.
  const opponents = state.players.filter(
    (p) => p.seat !== me.seat && p.status !== 'folded',
  ).length;
  const strength = equity - 0.07 * (opponents - 1);

  if (la.canCheck) {
    if (la.canBet) {
      if (strength >= profile.betValue && rng() < 0.85) {
        return betOf(la, potTotal * profile.betSize);
      }
      const cbetSpot = state.street === 'flop' && lastPreflopRaiser(state) === me.seat;
      if (cbetSpot && rng() < profile.cbet) return betOf(la, potTotal * profile.betSize);
      if (rng() < profile.bluffBet) return betOf(la, potTotal * profile.betSize);
    }
    return { type: 'check' };
  }

  const required = potOdds(la.callAmount, potTotal).required;
  if (strength >= profile.raiseValue && la.canRaise && rng() < 0.6) {
    return raiseTo(la, 3 * state.currentBet);
  }
  if (la.canRaise && rng() < profile.bluffRaise) return raiseTo(la, 3 * state.currentBet);
  if (strength >= required * profile.priceTolerance) return call(la);
  return { type: 'fold' };
}
