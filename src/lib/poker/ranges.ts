import { RANKS, createDeck, cardRank, cardSuit, rankValue, type Card, type Rank } from './cards';
import type { HandState } from './engine';

export type PositionLabel = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/** Classe d'une main préflop : "AA", "AKs", "T9o"… */
export function handClass(c1: Card, c2: Card): string {
  const r1 = cardRank(c1);
  const r2 = cardRank(c2);
  if (r1 === r2) return `${r1}${r2}`;
  const [hi, lo] = rankValue(r1) > rankValue(r2) ? [r1, r2] : [r2, r1];
  return `${hi}${lo}${cardSuit(c1) === cardSuit(c2) ? 's' : 'o'}`;
}

/**
 * Étend la notation compacte en classes de mains :
 * "22+" → toutes les paires de 22 à AA ; "A2s+" → A2s à AKs ; "ATo+" → ATo à AKo ; "T9s" → T9s.
 * Le "+" sur une main non appariée monte la carte basse jusqu'à une sous la haute.
 */
export function expandNotation(items: string[]): Set<string> {
  const classes = new Set<string>();
  for (const item of items) {
    const plus = item.endsWith('+');
    const core = plus ? item.slice(0, -1) : item;
    const hi = core[0] as Rank;
    const lo = core[1] as Rank;
    if (hi === lo) {
      const start = RANKS.indexOf(hi);
      if (start < 0) throw new Error(`Notation invalide : ${item}`);
      const end = plus ? RANKS.length - 1 : start;
      for (let i = start; i <= end; i++) classes.add(`${RANKS[i]}${RANKS[i]}`);
    } else {
      const suffix = core[2];
      if ((suffix !== 's' && suffix !== 'o') || RANKS.indexOf(hi) < 0 || RANKS.indexOf(lo) < 0)
        throw new Error(`Notation invalide : ${item}`);
      const end = plus ? RANKS.indexOf(hi) - 1 : RANKS.indexOf(lo);
      for (let i = RANKS.indexOf(lo); i <= end; i++) classes.add(`${hi}${RANKS[i]}${suffix}`);
    }
  }
  return classes;
}

/** Tous les combos concrets d'un ensemble de classes, cartes mortes exclues. */
export function combosForClasses(classes: Set<string>, dead: Card[] = []): [Card, Card][] {
  const deadSet = new Set(dead);
  const deck = createDeck().filter((c) => !deadSet.has(c));
  const combos: [Card, Card][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (classes.has(handClass(deck[i], deck[j]))) combos.push([deck[i], deck[j]]);
    }
  }
  return combos;
}

/** Position d'un siège à la distribution (indépendante des folds). */
export function positionOf(
  state: Pick<HandState, 'players' | 'buttonSeat'>,
  seat: number,
): PositionLabel {
  const seats = state.players.map((p) => p.seat);
  if (seats.length === 2) return seat === state.buttonSeat ? 'BTN' : 'BB';
  const after = seats.filter((s) => s > state.buttonSeat);
  const before = seats.filter((s) => s <= state.buttonSeat);
  const fromSb = [...after, ...before]; // SB, BB, …, BTN
  const labelsBySize: Record<number, PositionLabel[]> = {
    3: ['SB', 'BB', 'BTN'],
    4: ['SB', 'BB', 'CO', 'BTN'],
    5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
    6: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
  };
  const index = fromSb.indexOf(seat);
  if (index < 0) throw new Error(`Siège ${seat} absent de la main`);
  return labelsBySize[seats.length][index];
}

// Ranges 6-max indicatives pour NL2, en notation compacte.
// « BB » en open = relance par-dessus un ou plusieurs limps.

export const OPEN_RANGES: Record<PositionLabel, string[]> = {
  UTG: ['66+', 'ATs+', 'KJs+', 'QJs', 'JTs', 'AJo+', 'KQo'],
  HJ: ['55+', 'A9s+', 'KTs+', 'QTs+', 'JTs', 'T9s', 'ATo+', 'KJo+', 'QJo'],
  CO: ['33+', 'A5s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', 'A9o+', 'KTo+', 'QTo+', 'JTo'],
  BTN: ['22+', 'A2s+', 'K6s+', 'Q8s+', 'J8s+', 'T8s+', '97s+', '87s', '76s', '65s', 'A2o+', 'K9o+', 'Q9o+', 'J9o+', 'T9o'],
  SB: ['22+', 'A2s+', 'K8s+', 'Q9s+', 'J9s+', 'T9s', '98s', 'A5o+', 'KTo+', 'QTo+', 'JTo'],
  BB: ['22+', 'A2s+', 'K9s+', 'QTs+', 'JTs', 'ATo+', 'KQo'],
};

export const CALL_RANGES: Record<PositionLabel, string[]> = {
  UTG: ['88+', 'AJs+', 'KQs', 'AQo+'],
  HJ: ['77+', 'ATs+', 'KQs', 'QJs', 'JTs', 'AQo+'],
  CO: ['55+', 'A9s+', 'KTs+', 'QTs+', 'JTs', 'T9s', 'AJo+', 'KQo'],
  BTN: ['22+', 'A7s+', 'K9s+', 'QTs+', 'JTs', 'T9s', '98s', '87s', 'ATo+', 'KJo+'],
  SB: ['44+', 'A9s+', 'KTs+', 'QTs+', 'JTs', 'AJo+', 'KQo'],
  BB: ['22+', 'A2s+', 'K5s+', 'Q8s+', 'J8s+', 'T7s+', '97s+', '86s+', '75s+', '65s', '54s', 'A7o+', 'KTo+', 'QTo+', 'JTo', 'T9o'],
};

export const THREEBET_RANGES: Record<PositionLabel, string[]> = {
  UTG: ['QQ+', 'AKs', 'AKo'],
  HJ: ['QQ+', 'AKs', 'AKo'],
  CO: ['JJ+', 'AQs+', 'AKo', 'A5s'],
  BTN: ['TT+', 'AQs+', 'AQo+', 'A5s', 'KQs'],
  SB: ['TT+', 'AQs+', 'AQo+', 'A5s'],
  BB: ['TT+', 'AQs+', 'AQo+', 'A5s', '76s', '65s'],
};

// --- Ranges par format de table ---
// En heads-up, positionOf renvoie 'BTN' pour le bouton (= petite blinde, parle
// en premier) et 'BB' pour l'autre. On ouvre très large au bouton, on défend
// largement la grosse blinde.

export type TableFormat = 2 | 3 | 6;

export function formatOf(numPlayers: number): TableFormat {
  if (numPlayers <= 2) return 2;
  if (numPlayers <= 3) return 3;
  return 6;
}

/** Open SB heads-up ≈ 81 % : on ne jette que les pires dépareillées (72o, 32o, T2o…). */
const HU_SB_OPEN: string[] = [
  '22+',
  'A2s+', 'K2s+', 'Q2s+', 'J2s+', 'T2s+', '92s+', '82s+', '72s+', '62s+', '52s+', '42s+', '32s',
  'A2o+', 'K2o+', 'Q2o+', 'J4o+', 'T5o+', '95o+', '85o+', '75o+', '64o+', '54o',
];

/** 3-bet de la BB heads-up face à l'open SB : value + quelques semi-bluffs suités. */
const HU_BB_3BET: string[] = ['TT+', 'AJs+', 'AQo+', 'A5s', 'A4s', 'KQs', '76s', '65s'];

/** Call de la BB heads-up face à l'open SB. Union avec le 3-bet ≈ 68 % (défense large). */
const HU_BB_CALL: string[] = [
  '22+',
  'A2s+', 'K2s+', 'Q4s+', 'J5s+', 'T6s+', '95s+', '85s+', '75s+', '64s+', '54s', '43s',
  'A2o+', 'K5o+', 'Q7o+', 'J7o+', 'T7o+', '97o+', '86o+', '76o', '65o',
];

const OPEN_BY_FORMAT: Record<TableFormat, Partial<Record<PositionLabel, string[]>>> = {
  2: { BTN: HU_SB_OPEN },
  3: {}, // Spin & Go — à remplir ; pour l'instant repli sur le 6-max
  6: OPEN_RANGES,
};

const CALL_BY_FORMAT: Record<TableFormat, Partial<Record<PositionLabel, string[]>>> = {
  2: { BB: HU_BB_CALL },
  3: {},
  6: CALL_RANGES,
};

const THREEBET_BY_FORMAT: Record<TableFormat, Partial<Record<PositionLabel, string[]>>> = {
  2: { BB: HU_BB_3BET },
  3: {},
  6: THREEBET_RANGES,
};

/** Range d'ouverture selon le format, avec repli sur le 6-max si le format est vide. */
export function openRangeFor(format: TableFormat, position: PositionLabel): string[] {
  return OPEN_BY_FORMAT[format][position] ?? OPEN_RANGES[position];
}

export function callRangeFor(format: TableFormat, position: PositionLabel): string[] {
  return CALL_BY_FORMAT[format][position] ?? CALL_RANGES[position];
}

export function threeBetRangeFor(format: TableFormat, position: PositionLabel): string[] {
  return THREEBET_BY_FORMAT[format][position] ?? THREEBET_RANGES[position];
}

export type RangeEstimate = {
  /** Description courte pour l'affichage, ex. « open BTN ». */
  label: string;
  /** null = range inconnue ou très large : traiter comme une main aléatoire. */
  classes: Set<string> | null;
};

/**
 * Range estimée d'un joueur à partir de ses actions PRÉFLOP uniquement —
 * jamais de ses vraies cartes. Sa dernière action informative l'emporte.
 */
export function estimatePreflopRange(state: HandState, seat: number): RangeEstimate {
  const position = positionOf(state, seat);
  const format = formatOf(state.players.length);
  let raisesBefore = 0;
  let estimate: RangeEstimate | null = null;

  for (const entry of state.history) {
    if (entry.street !== 'preflop') break;
    const isRaise = entry.action.type === 'raise' || entry.action.type === 'bet';
    if (entry.seat === seat) {
      if (isRaise) {
        estimate =
          raisesBefore === 0
            ? { label: `open ${position}`, classes: expandNotation(openRangeFor(format, position)) }
            : { label: `3-bet ${position}`, classes: expandNotation(threeBetRangeFor(format, position)) };
      } else if (entry.action.type === 'call') {
        estimate =
          raisesBefore === 0
            ? { label: `limp ${position} : très large`, classes: null }
            : { label: `paie une relance (${position})`, classes: expandNotation(callRangeFor(format, position)) };
      } else if (entry.action.type === 'check' && !estimate) {
        estimate = { label: 'check BB : très large', classes: null };
      }
    }
    if (isRaise) raisesBefore++;
  }

  return estimate ?? { label: 'pas encore d’action : large', classes: null };
}
