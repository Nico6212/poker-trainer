import { createDeck, mulberry32, rankValue, type Card, type RNG, type Rank } from '../cards';
import { calcEquity } from '../equity';
import { boardTexture, categoryOf, categoryRank } from '../hand-reading';
import { weakRange, type Calibration } from './calibration';
import { hasBigDraw } from './draws';
import { extractSpots, type HeroSpot } from './extract-spots';
import type { ParsedHand } from './parse-pokerstars';
import type { VillainAction } from './showdown-stats';

// Classification des erreurs d'un spot importé. Deux familles :
// - déterministes (sizing préflop, call de 4-bet) — pas d'équité ;
// - fondées sur l'équité contre un profil « population NL2 » value-heavy.

export type MistakeType =
  | 'open-limp'
  | 'open-size'
  | 'small-3bet'
  | '4bet-call'
  | 'call-sans-cote'
  | 'call-raise-faible'
  | 'fold-avec-cote'
  | 'jam-main-moyenne';

export type Mistake = {
  handId: string;
  type: MistakeType;
  detail: string;
  spot: HeroSpot;
  equity?: number;
  required?: number;
  /** Range retenue pour l'équité (ex. la ligne river modélisée), affichée au rejeu. */
  villainRange?: string;
};

const EQUITY_ITERS = 6000;
/** Un call face à une mise est une erreur si équité < requis − 5 points (incertitude des ranges). */
const CALL_MARGIN = 0.05;
/** Un fold est une erreur si équité ≥ requis + 10 points. */
const FOLD_MARGIN = 0.1;
/** Un tapis (jam) avec une main médiocre : équité contre la range qui paie (peu de fold equity à NL2). */
export const JAM_WEAK = 0.4;
/** Au-dessus de ~⅓ pot, l'agression est value-heavy (range nuttée) ; en dessous, elle est large. */
const NUTTED_PRESSURE = 0.3;

/** Affichage d'équité : jamais « 0 % » — sous 5 points on écrit « < 5 % ». */
export function equityLabel(equity: number): string {
  return equity < 0.05 ? '< 5 %' : `${Math.round(equity * 100)} %`;
}

/**
 * Combos adverses « population NL2 ». Une agression sizeable (nutted=true) est très
 * orientée valeur ; une petite agression (nutted=false) → range large (on renvoie []
 * et l'appelant traite comme une main aléatoire).
 */
export function nl2VillainRange(
  board: Card[],
  dead: Card[],
  opts: { preAggressor: boolean; nutted: boolean; jamCall?: boolean },
): [Card, Card][] {
  if (!opts.nutted) return [];
  const deadSet = new Set<Card>([...board, ...dead]);
  const deck = createDeck().filter((c) => !deadSet.has(c));
  const boardRanks = new Set(board.map((c) => c[0]));
  const boardMax = board.length ? Math.max(...board.map((c) => rankValue(c[0] as Rank))) : 0;
  const texture = boardTexture(board);
  const wet = texture.threeFlush || texture.fourStraight;

  const combos: [Card, Card][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const combo: [Card, Card] = [deck[i], deck[j]];
      const cat = categoryRank(categoryOf([...combo, ...board]));
      let include = cat >= 3; // brelan+ (sets, quintes, couleurs, fulls, carrés)

      // Overpairs + top paire gros kicker : un 3-bettor préflop en arrive, ET la population
      // NL2 paie un tapis avec ces mains de seconde valeur (sinon un overpair comme QQ est
      // accusé à tort — il bat justement toute cette portion large qui paie).
      if (!include && (opts.preAggressor || opts.jamCall)) {
        const pocketPair = combo[0][0] === combo[1][0];
        if (pocketPair && rankValue(combo[0][0] as Rank) > boardMax) include = true;
        else {
          const pairsTop = combo.some((c) => rankValue(c[0] as Rank) === boardMax);
          const bigKicker = combo.some((c) => c[0] === 'A' || c[0] === 'K');
          if (pairsTop && bigKicker) include = true;
        }
      }

      // Deux paires « réelles » : sur board sec pour la value ; sur tout board si on paie un tapis.
      if (!include && cat === 2 && (opts.jamCall || !wet)) {
        if (
          boardRanks.has(combo[0][0]) &&
          boardRanks.has(combo[1][0]) &&
          combo[0][0] !== combo[1][0]
        ) {
          include = true;
        }
      }

      // Gros tirages (couleur, quinte bilatérale) : seulement dans la range qui paie un tapis.
      if (!include && opts.jamCall && hasBigDraw(combo, board)) include = true;

      if (include) combos.push(combo);
    }
  }
  return combos;
}


function handClassOf(cards: [Card, Card]): string {
  const a = cards[0][0];
  const b = cards[1][0];
  return a === b ? `${a}${a}` : '';
}

// --- Range river : dépend de la LIGNE de l'adversaire, pas d'un réglage global ---
//  passive  : il a seulement payé/checké avant puis mise la river → value élargie + bluffs.
//  hardened : il a relancé ou check-raisé au turn puis mise/tapis river → strict two-pair+.
//  raise    : il relance ou check-raise la river → strict, la plus serrée (brelan+).
type RiverLine = 'passive' | 'hardened' | 'raise';

export const RIVER_LINE_DESC: Record<RiverLine, string> = {
  passive:
    'Contre une ligne passive puis mise river : top paire / 2ᵉ paire bon kicker, deux paires, brelans, quintes, couleurs, + ~15 % de bluffs (tirages ratés).',
  hardened:
    'Contre un durcissement au turn (relance/check-raise) + mise ou tapis river : deux paires, brelans, quintes, couleurs.',
  raise: 'Contre une relance/check-raise river : value la plus serrée (brelans, quintes, couleurs, fulls).',
};

const RIVER_BLUFF_RATIO = 0.15;

function genuineTwoPair(combo: [Card, Card], boardRanks: Set<string>): boolean {
  return (
    boardRanks.has(combo[0][0]) && boardRanks.has(combo[1][0]) && combo[0][0] !== combo[1][0]
  );
}

/**
 * Range qui mise/relance la river selon la ligne. Pour la ligne passive on mélange ~15 %
 * de bluffs (hauteurs = tirages ratés) : contre une main faite, le héros les bat tous.
 */
function riverVillainRange(board: Card[], dead: Card[], line: RiverLine): [Card, Card][] {
  const deadSet = new Set<Card>([...board, ...dead]);
  const deck = createDeck().filter((c) => !deadSet.has(c));
  const boardRanks = new Set(board.map((c) => c[0]));
  const vals = board.map((c) => rankValue(c[0] as Rank)).sort((a, b) => b - a);
  const topV = vals[0] ?? 0;
  const secondV = vals.find((v) => v < topV) ?? -1;

  const value: [Card, Card][] = [];
  const bluffs: [Card, Card][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const combo: [Card, Card] = [deck[i], deck[j]];
      const cat = categoryRank(categoryOf([...combo, ...board]));

      let include = cat >= 3; // brelan+ (toutes les lignes)
      if (!include && line !== 'raise' && cat === 2 && genuineTwoPair(combo, boardRanks)) {
        include = true; // deux paires : lignes passive & hardened
      }
      if (!include && line === 'passive' && cat === 1) {
        const pairsTop = combo.some((c) => rankValue(c[0] as Rank) === topV);
        const pairs2nd = combo.some((c) => rankValue(c[0] as Rank) === secondV);
        const goodKicker = combo.some((c) => c[0] === 'A' || c[0] === 'K' || c[0] === 'Q');
        if (pairsTop || (pairs2nd && goodKicker)) include = true;
      }
      if (include) value.push(combo);
      else if (line === 'passive' && cat === 0) bluffs.push(combo); // hauteur = bluff potentiel
    }
  }

  if (line !== 'passive' || value.length === 0 || bluffs.length === 0) return value;

  // Sous-échantillonne les bluffs pour peser ~15 % de la range finale.
  const nBluff = Math.min(bluffs.length, Math.round((value.length * RIVER_BLUFF_RATIO) / (1 - RIVER_BLUFF_RATIO)));
  if (nBluff <= 0) return value;
  const step = Math.max(1, Math.floor(bluffs.length / nBluff));
  const chosen: [Card, Card][] = [];
  for (let k = 0; k < bluffs.length && chosen.length < nBluff; k += step) chosen.push(bluffs[k]);
  return [...value, ...chosen];
}

/** Infos internes exposées pour audit de la calibration (sans effet sur la classification). */
export type ClassifyDebug = {
  vAction: VillainAction | null;
  p: number;
  eqValue: number;
  eqWeak: number | null;
  equity: number;
  required: number;
};

/** Un spot préflop ou postflop → une erreur, ou null. ctx.preAggressor = l'agresseur a 3-bet+ préflop. */
export function classifySpot(
  spot: HeroSpot,
  ctx: {
    preAggressor: boolean;
    turnHardened?: boolean;
    calibration?: Calibration;
    debug?: (info: ClassifyDebug) => void;
  },
  rng?: RNG,
): Mistake | null {
  const mk = (type: MistakeType, detail: string, extra?: Partial<Mistake>): Mistake => ({
    handId: spot.handId,
    type,
    detail,
    spot,
    ...extra,
  });
  const bb = spot.bb;

  // --- Préflop : règles déterministes de sizing + call de 4-bet ---
  if (spot.street === 'preflop') {
    const to = spot.heroAction.toAmount ?? 0;
    if (spot.facing === 'unopened' || spot.facing === 'limped') {
      if (spot.heroAction.type === 'call') {
        return mk('open-limp', 'Open-limp : on ouvre par une relance ou on se couche, jamais limp.');
      }
      if (spot.heroAction.type === 'raise') {
        const expected = 3 * bb + spot.limpers * bb;
        if (Math.abs(to - expected) > bb + 1e-9) {
          return mk(
            'open-size',
            `Ouverture ${(to / bb).toFixed(1)} BB au lieu de ${(expected / bb).toFixed(0)} BB (3 BB + 1 BB/limper).`,
          );
        }
      }
      return null;
    }
    if (spot.facing === 'raise' && spot.heroAction.type === 'raise') {
      if (to < 2.5 * spot.facedRaiseTo - 1e-9) {
        return mk(
          'small-3bet',
          `3-bet à ${(to / bb).toFixed(1)} BB (< 2,5× la relance de ${(spot.facedRaiseTo / bb).toFixed(1)} BB).`,
        );
      }
      return null;
    }
    if (spot.facing === '4bet+' && spot.heroAction.type === 'call') {
      const cls = handClassOf(spot.heroCards);
      if (spot.effectiveBB >= 40 && cls !== 'AA' && cls !== 'KK') {
        return mk(
          '4bet-call',
          `Call d'un 4-bet avec ${cls || 'cette main'} à ${Math.round(spot.effectiveBB)} BB effectifs (réservé à AA/KK aussi profond).`,
        );
      }
      return null;
    }
    return null;
  }

  // --- Postflop : équité contre le profil « population NL2 » ---
  const required = spot.potBefore + spot.toCall > 0 ? spot.toCall / (spot.potBefore + spot.toCall) : 0;
  // La largeur de la range est portée par la taille de l'agression, pas par un seuil fixe.
  const pressure = spot.potBefore > 0 ? spot.toCall / spot.potBefore : 1;
  const strongAggression =
    spot.facing === 'raise' ||
    spot.facing === '3bet' ||
    spot.facing === 'raisePostflop' ||
    spot.facing === 'checkRaise';

  const needsEquity =
    (spot.heroAction.type === 'call' && spot.facingBet) ||
    (spot.heroAction.type === 'fold' && spot.facingBet) ||
    ((spot.heroAction.type === 'bet' || spot.heroAction.type === 'raise') && spot.heroAction.allIn);
  if (!needsEquity) return null;

  const isJam = spot.heroAction.type === 'bet' || spot.heroAction.type === 'raise';

  // Sur la river, un call/fold face à une mise ou relance : la range dépend de la LIGNE
  // du vilain (passive → élargie + bluffs ; durcie au turn → strict ; relance river → serré).
  let villainRangeDesc: string | undefined;
  let villain: [Card, Card][];
  if (spot.street === 'river' && !isJam && spot.facingBet) {
    const line: RiverLine =
      spot.facing === 'raisePostflop' || spot.facing === 'checkRaise'
        ? 'raise'
        : ctx.turnHardened
          ? 'hardened'
          : 'passive';
    villain = riverVillainRange(spot.board, spot.heroCards, line);
    villainRangeDesc = RIVER_LINE_DESC[line];
  } else {
    // Un call face à une petite agression → range large ; sinon nuttée. La range qui PAIE
    // un tapis du héros est toujours value.
    const nutted = isJam ? true : pressure >= NUTTED_PRESSURE;
    villain = nl2VillainRange(spot.board, spot.heroCards, {
      preAggressor: ctx.preAggressor,
      nutted,
      jamCall: isJam, // la range qui PAIE un tapis est plus large (overpairs, TP, tirages)
    });
    villainRangeDesc = isJam
      ? 'Contre la range qui paie un tapis à NL2 (value + top paire / 2ᵉ paire, gros tirages).'
      : nutted
        ? `Contre la range de value NL2 (brelans+, deux paires sur board sec${
            ctx.preAggressor ? ', overpairs/top paire gros kicker' : ''
          }).`
        : 'Contre une range large (petite agression, peu définie).';
  }
  const seed =
    [...spot.heroCards, ...spot.board].join('').split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>>
    0;
  const eqValue = calcEquity({
    hero: spot.heroCards,
    board: spot.board,
    villainCombos: villain.length > 0 ? villain : null, // [] → main aléatoire (range large)
    iterations: EQUITY_ITERS,
    rng: rng ?? mulberry32(seed),
  }).equity;

  // Calibration sur tes abattages : pour un call/fold face à une agression trackée,
  // on pondère value (a priori) et faible (observé). Sans données, p = 1 → équité inchangée.
  let equity = eqValue;
  let pDebug = 1;
  let eqWeakDebug: number | null = null;
  const vAction = !isJam && spot.facingBet ? spotVillainAction(spot) : null;
  if (ctx.calibration && vAction) {
    const p = ctx.calibration.strongFraction(vAction, spot.bb);
    pDebug = p;
    if (p < 0.999) {
      const weak = weakRange(spot.board, spot.heroCards, ctx.calibration.weakMix(vAction, spot.bb));
      const eqWeak = weak.length
        ? calcEquity({
            hero: spot.heroCards,
            board: spot.board,
            villainCombos: weak,
            iterations: EQUITY_ITERS,
            rng: rng ?? mulberry32((seed ^ 0x9e3779b9) >>> 0),
          }).equity
        : eqValue;
      eqWeakDebug = eqWeak;
      equity = p * eqValue + (1 - p) * eqWeak;
    }
  }
  ctx.debug?.({ vAction, p: pDebug, eqValue, eqWeak: eqWeakDebug, equity, required });

  if (spot.heroAction.type === 'call') {
    // Strictement la cote du pot contre la range scénarisée : mieux vaut rater un spot
    // fin que classer à tort un call défendable (ex. brelan qui paie un check-raise turn).
    if (equity < required - CALL_MARGIN) {
      return strongAggression
        ? mk(
            'call-raise-faible',
            `Call derrière la range de value (${equityLabel(equity)} pour ${Math.round(required * 100)} % requis) face à ${facingLabel(spot.facing)}.`,
            { equity, required, villainRange: villainRangeDesc },
          )
        : mk(
            'call-sans-cote',
            `Call sans la cote : ${equityLabel(equity)} pour ${Math.round(required * 100)} % requis.`,
            { equity, required, villainRange: villainRangeDesc },
          );
    }
    return null;
  }

  if (spot.heroAction.type === 'fold') {
    if (equity >= required + FOLD_MARGIN) {
      return mk(
        'fold-avec-cote',
        `Fold avec la cote : ${equityLabel(equity)} pour ${Math.round(required * 100)} % requis.`,
        { equity, required, villainRange: villainRangeDesc },
      );
    }
    return null;
  }

  // Tapis (jam) du héros avec une main médiocre contre la range qui paie.
  if (equity < JAM_WEAK) {
    return mk(
      'jam-main-moyenne',
      `Tapis avec ${equityLabel(equity)} d'équité contre la range qui paie.`,
      { equity, required, villainRange: villainRangeDesc },
    );
  }
  return null;
}

/** Mappe un spot (call/fold face à une agression) vers une action adverse trackée, pour la calibration. */
function spotVillainAction(spot: HeroSpot): VillainAction | null {
  if (spot.street === 'preflop') return null;
  if (spot.street === 'river') {
    if (spot.villainAllIn) return 'jamRiver';
    if (spot.facing === 'checkRaise') return 'checkRaise';
    if (spot.facing === 'raisePostflop') return 'raiseRiver';
    // Mise river : la stat « après ligne passive » ne vaut QUE si le vilain n'a pas
    // misé/relancé avant (sa population d'origine). Après une ligne agressive, pas de
    // stat appariée → p = 1 (value-only), on ne dilue pas.
    if (spot.facing === 'bet') return spot.villainPassiveLine ? 'betRiverAfterPassive' : null;
    return null;
  }
  // Un tapis flop/turn n'a pas de stat de TAILLE dédiée (raiseFlop/raiseTurn mélangent
  // toutes les relances, surtout les petites) et un shove est value → pas de calibration.
  if (spot.villainAllIn) return null;
  if (spot.facing === 'checkRaise') return 'checkRaise';
  if (spot.facing === 'raisePostflop') return spot.street === 'flop' ? 'raiseFlop' : 'raiseTurn';
  return null;
}

function facingLabel(facing: HeroSpot['facing']): string {
  switch (facing) {
    case 'checkRaise':
      return 'un check-raise';
    case 'raise':
    case 'raisePostflop':
      return 'une relance';
    case '3bet':
      return 'une sur-relance';
    default:
      return 'une mise';
  }
}

/** L'agresseur principal du spot a-t-il 3-bet (ou plus) préflop ? */
function isPreAggressor(hand: ParsedHand, aggressorSeat: number | null): boolean {
  if (aggressorSeat === null) return false;
  let raises = 0;
  for (const a of hand.actions) {
    if (a.street !== 'preflop') break;
    if (a.type === 'raise') {
      if (a.seat === aggressorSeat && raises >= 1) return true; // a relancé une relance = 3-bet+
      raises += 1;
    }
  }
  return false;
}

/** Un adversaire a-t-il durci au turn (relance ou check-raise) ? (une relance = bet puis raise). */
function turnHardened(hand: ParsedHand): boolean {
  return hand.actions.some(
    (a) => a.street === 'turn' && a.type === 'raise' && a.seat !== hand.heroSeat,
  );
}

/** Classe toutes les décisions du héros d'une main importée. calibration optionnelle. */
export function classifyHand(hand: ParsedHand, calibration?: Calibration): Mistake[] {
  const out: Mistake[] = [];
  const hardened = turnHardened(hand);
  for (const spot of extractSpots(hand)) {
    const m = classifySpot(spot, {
      preAggressor: isPreAggressor(hand, spot.aggressorSeat),
      turnHardened: hardened,
      calibration,
    });
    if (m) out.push(m);
  }
  return out;
}
