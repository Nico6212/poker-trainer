import { createDeck, mulberry32, rankValue, type Card, type RNG, type Rank } from '../cards';
import { calcEquity } from '../equity';
import { boardTexture, categoryOf, categoryRank } from '../hand-reading';
import type { ParsedHand } from './parse-pokerstars';
import { extractSpots, type HeroSpot } from './extract-spots';

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

function suitCount(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c[1], (m.get(c[1]) ?? 0) + 1);
  return m;
}

/** Valeurs de rangs présentes (l'as compte haut ET bas), pour détecter les quintes. */
function rankValueSet(cards: Card[]): Set<number> {
  const s = new Set<number>();
  for (const c of cards) {
    const v = rankValue(c[0] as Rank);
    s.add(v);
    if (v === 14) s.add(1);
  }
  return s;
}

function hasStraight(vals: Set<number>): boolean {
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!vals.has(lo + k)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Nombre de rangs distincts qui complètent une quinte (≥ 2 = tirage bilatéral / double ventral). */
function straightCompletions(vals: Set<number>): number {
  let n = 0;
  for (let r = 2; r <= 14; r++) {
    if (vals.has(r)) continue;
    const s = new Set(vals);
    s.add(r);
    if (r === 14) s.add(1);
    if (hasStraight(s)) n += 1;
  }
  return n;
}

/** Tirage couleur (4 à la couleur avec une carte privée) ou tirage quinte à ≥ 2 outs. */
function hasBigDraw(combo: [Card, Card], board: Card[]): boolean {
  const counts = suitCount([...board, ...combo]);
  for (const [suit, cnt] of counts) {
    if (cnt === 4 && combo.some((c) => c[1] === suit)) return true;
  }
  const allVals = rankValueSet([...board, ...combo]);
  if (hasStraight(allVals)) return false; // quinte faite = value, déjà comptée
  const boardVals = rankValueSet(board);
  return (
    straightCompletions(allVals) >= 2 &&
    straightCompletions(allVals) > straightCompletions(boardVals)
  );
}

function handClassOf(cards: [Card, Card]): string {
  const a = cards[0][0];
  const b = cards[1][0];
  return a === b ? `${a}${a}` : '';
}

/** Un spot préflop ou postflop → une erreur, ou null. ctx.preAggressor = l'agresseur a 3-bet+ préflop. */
export function classifySpot(
  spot: HeroSpot,
  ctx: { preAggressor: boolean },
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
  // Un call face à une petite agression → range large ; sinon nuttée. La range qui PAIE
  // un tapis du héros est toujours value.
  const nutted = isJam ? true : pressure >= NUTTED_PRESSURE;
  const villain = nl2VillainRange(spot.board, spot.heroCards, {
    preAggressor: ctx.preAggressor,
    nutted,
    jamCall: isJam, // la range qui PAIE un tapis est plus large (overpairs, TP, tirages)
  });
  const seed =
    [...spot.heroCards, ...spot.board].join('').split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>>
    0;
  const { equity } = calcEquity({
    hero: spot.heroCards,
    board: spot.board,
    villainCombos: villain.length > 0 ? villain : null, // [] → main aléatoire (range large)
    iterations: EQUITY_ITERS,
    rng: rng ?? mulberry32(seed),
  });

  if (spot.heroAction.type === 'call') {
    // Strictement la cote du pot contre la range scénarisée : mieux vaut rater un spot
    // fin que classer à tort un call défendable (ex. brelan qui paie un check-raise turn).
    if (equity < required - CALL_MARGIN) {
      return strongAggression
        ? mk(
            'call-raise-faible',
            `Call derrière la range de value (${Math.round(equity * 100)} % pour ${Math.round(required * 100)} % requis) face à ${facingLabel(spot.facing)}.`,
            { equity, required },
          )
        : mk(
            'call-sans-cote',
            `Call sans la cote : ${Math.round(equity * 100)} % pour ${Math.round(required * 100)} % requis.`,
            { equity, required },
          );
    }
    return null;
  }

  if (spot.heroAction.type === 'fold') {
    if (equity >= required + FOLD_MARGIN) {
      return mk(
        'fold-avec-cote',
        `Fold avec la cote : ${Math.round(equity * 100)} % pour ${Math.round(required * 100)} % requis.`,
        { equity, required },
      );
    }
    return null;
  }

  // Tapis (jam) du héros avec une main médiocre contre la range qui paie.
  if (equity < JAM_WEAK) {
    return mk(
      'jam-main-moyenne',
      `Tapis avec ${Math.round(equity * 100)} % d'équité contre la range qui paie.`,
      { equity, required },
    );
  }
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

/** Classe toutes les décisions du héros d'une main importée. */
export function classifyHand(hand: ParsedHand): Mistake[] {
  const out: Mistake[] = [];
  for (const spot of extractSpots(hand)) {
    const m = classifySpot(spot, { preAggressor: isPreAggressor(hand, spot.aggressorSeat) });
    if (m) out.push(m);
  }
  return out;
}
