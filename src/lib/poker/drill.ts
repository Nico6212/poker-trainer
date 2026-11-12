import { createDeck, shuffle, type Card, type RNG } from './cards';
import { calcEquity } from './equity';
import { findOuts } from './outs';
import {
  CHART_LABELS,
  PUSH_BUCKETS,
  shouldCallPush,
  shouldPush,
  type CallChart,
  type PushChart,
} from './pushfold';
import {
  OPEN_RANGES,
  THREEBET_RANGES,
  expandNotation,
  handClass,
  type PositionLabel,
} from './ranges';
import {
  generateHandReading,
  gradeHandReading,
  type Category,
  type HandReadingQuestion,
} from './hand-reading';
import { median } from './session';

// Mode Drill : spots statiques générés par le moteur pur, pour répéter le geste
// cible (cote du pot, outs, équité, tailles, ranges) 10 à 20 fois plus densément
// qu'en jouant des mains complètes.

export type DrillKind =
  | 'potOdds'
  | 'sizeFlash'
  | 'betSize'
  | 'outs'
  | 'equity'
  | 'openRange'
  | 'pushFold'
  | 'handReading';
export type DrillPack = DrillKind | 'mixed';

export type DrillQuestion =
  | {
      kind: 'potOdds';
      /** Montants en centimes. */
      pot: number;
      bet: number;
      call: number;
      answerPct: number;
    }
  | { kind: 'sizeFlash'; fractionLabel: string; answerPct: number }
  | {
      kind: 'outs';
      hero: [Card, Card];
      board: Card[];
      /** La main adverse exacte, AFFICHÉE : la réponse est entièrement déterminée. */
      villain: [Card, Card];
      villainDescription: string;
      answer: number;
      outs: Card[];
    }
  | {
      kind: 'equity';
      hero: [Card, Card];
      board: Card[];
      rangeLabel: string;
      answerPct: number;
    }
  | { kind: 'openRange'; cards: [Card, Card]; hand: string; position: PositionLabel; answer: boolean }
  // « Combien miser ? » : le miroir offensif de la cote du pot.
  | { kind: 'betSize'; variant: 'amount'; potBB: number; fractionLabel: string; answerBB: number }
  | {
      kind: 'betSize';
      variant: 'fraction';
      targetPct: number;
      answerLabel: string;
      options: string[];
    }
  | { kind: 'betSize'; variant: 'open'; limpers: number; answerBB: number }
  | {
      kind: 'betSize';
      variant: 'threebet';
      openBB: number;
      inPosition: boolean;
      callers: number;
      answerBB: number;
    }
  | { kind: 'betSize'; variant: 'bluff'; betBB: number; potBB: number; answerPct: number }
  | {
      kind: 'pushFold';
      cards: [Card, Card];
      hand: string;
      /** « push ? » (open-shove) ou « payer un push ? » (call). */
      mode: 'push' | 'call';
      chart: PushChart | CallChart;
      chartLabel: string;
      stackBB: number;
      answer: boolean;
    }
  | { kind: 'handReading'; q: HandReadingQuestion };

/** La table des tailles standard : mise en fraction du pot → équité requise f/(1+2f). */
export const SIZE_TABLE: { fraction: number; label: string }[] = [
  { fraction: 1 / 4, label: '¼ pot' },
  { fraction: 1 / 3, label: '⅓ pot' },
  { fraction: 1 / 2, label: '½ pot' },
  { fraction: 2 / 3, label: '⅔ pot' },
  { fraction: 3 / 4, label: '¾ pot' },
  { fraction: 1, label: 'pot' },
  { fraction: 1.5, label: '1,5× pot' },
  { fraction: 2, label: '2× pot' },
];

export function requiredForFraction(fraction: number): number {
  return fraction / (1 + 2 * fraction);
}

/** Les montants du drill sont en centimes avec bb = 2 : l'affichage se fait en BB. */
export const DRILL_BB_CENTS = 2;

const fmtBB = (bb: number): string =>
  Number.isInteger(bb) ? String(bb) : bb.toFixed(1).replace('.', ',');
const inBB = (cents: number): string => fmtBB(cents / DRILL_BB_CENTS);

const DRILL_KINDS: DrillKind[] = [
  'potOdds',
  'sizeFlash',
  'betSize',
  'outs',
  'equity',
  'openRange',
  'pushFold',
  'handReading',
];

/** Cibles « % requis adverse → fraction du pot » sans ambiguïté (table inverse). */
const INVERSE_SIZE_PAIRS: { pct: number; label: string }[] = [
  { pct: 20, label: '⅓ pot' },
  { pct: 25, label: '½ pot' },
  { pct: 29, label: '⅔ pot' },
  { pct: 33, label: 'pot' },
  { pct: 40, label: '2× pot' },
];

const EQUITY_RANGES: { label: string; classes: string[] | null }[] = [
  { label: 'open du bouton', classes: OPEN_RANGES.BTN },
  { label: 'open UTG (serré)', classes: OPEN_RANGES.UTG },
  { label: '3-bet', classes: THREEBET_RANGES.BTN },
  { label: 'une main aléatoire', classes: null },
];

export const DRILL_EQUITY_ITERATIONS = 1500;

export function generateDrill(pack: DrillPack, rng: RNG): DrillQuestion {
  const kind: DrillKind =
    pack === 'mixed' ? DRILL_KINDS[Math.floor(rng() * DRILL_KINDS.length)] : pack;

  switch (kind) {
    case 'potOdds': {
      // Pot de 2 à 60 BB, mise = fraction standard du pot.
      const pot = (2 + Math.floor(rng() * 59)) * DRILL_BB_CENTS;
      const { fraction } = SIZE_TABLE[Math.floor(rng() * SIZE_TABLE.length)];
      const bet = Math.max(DRILL_BB_CENTS, Math.round(pot * fraction));
      return { kind, pot, bet, call: bet, answerPct: bet / (pot + bet + bet) };
    }
    case 'sizeFlash': {
      const { fraction, label } = SIZE_TABLE[Math.floor(rng() * SIZE_TABLE.length)];
      return { kind, fractionLabel: label, answerPct: requiredForFraction(fraction) };
    }
    case 'outs': {
      // On retire des spots jusqu'à trouver un vrai tirage (derrière, avec des outs).
      for (let attempt = 0; attempt < 40; attempt++) {
        const deck = shuffle(createDeck(), rng);
        const hero: [Card, Card] = [deck[0], deck[1]];
        const board = deck.slice(2, rng() < 0.5 ? 5 : 6);
        // L'adversaire tient une grosse main : la plus haute paire servie disponible.
        const villain = findHighPair(deck.slice(board.length + 2));
        if (!villain) continue;
        // Pas de brelan caché : la réponse doit être lisible depuis les cartes affichées.
        if (board.some((c) => c[0] === villain[0][0])) continue;
        const result = findOuts({ hero, board, villainCombos: [villain] });
        if (result.aheadNow || result.outs.length < 2 || result.outs.length > 15) continue;
        return {
          kind,
          hero,
          board,
          villain,
          villainDescription: `une paire de ${villain[0][0] === 'A' ? 'as' : villain[0][0] === 'K' ? 'rois' : 'dames'} servie`,
          answer: result.outs.length,
          outs: result.outs,
        };
      }
      // Spot de secours connu : tirage couleur classique, 9 outs.
      return {
        kind,
        hero: ['6h', '5h'],
        board: ['Ah', '9h', '2c'],
        villain: ['Ks', 'Kc'],
        villainDescription: 'une paire de rois servie',
        answer: 9,
        outs: ['Kh', 'Qh', 'Jh', 'Th', '8h', '7h', '4h', '3h', '2h'],
      };
    }
    case 'equity': {
      const deck = shuffle(createDeck(), rng);
      const hero: [Card, Card] = [deck[0], deck[1]];
      const board = rng() < 0.4 ? [] : deck.slice(2, 5);
      const range = EQUITY_RANGES[Math.floor(rng() * EQUITY_RANGES.length)];
      const villainCombos = range.classes
        ? expandClassesToCombos(range.classes, [...hero, ...board])
        : null;
      const { equity } = calcEquity({
        hero,
        board,
        villainCombos,
        iterations: DRILL_EQUITY_ITERATIONS,
        rng,
      });
      return { kind, hero, board, rangeLabel: range.label, answerPct: equity };
    }
    case 'openRange': {
      const positions: PositionLabel[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
      const position = positions[Math.floor(rng() * positions.length)];
      const deck = shuffle(createDeck(), rng);
      const cards: [Card, Card] = [deck[0], deck[1]];
      const hand = handClass(cards[0], cards[1]);
      return {
        kind,
        cards,
        hand,
        position,
        answer: expandNotation(OPEN_RANGES[position]).has(hand),
      };
    }
    case 'betSize': {
      const roll = rng();
      if (roll < 0.35) {
        // Fraction → montant : le calcul mental brut.
        const potBB = 4 + Math.floor(rng() * 27); // 4 à 30 BB
        const fractions = [
          { f: 1 / 3, label: '⅓ pot' },
          { f: 1 / 2, label: '½ pot' },
          { f: 2 / 3, label: '⅔ pot' },
          { f: 3 / 4, label: '¾ pot' },
          { f: 1, label: 'pot' },
        ];
        const pick = fractions[Math.floor(rng() * fractions.length)];
        return {
          kind,
          variant: 'amount',
          potBB,
          fractionLabel: pick.label,
          answerBB: Math.round(potBB * pick.f * 10) / 10,
        };
      }
      if (roll < 0.55) {
        // % cible → fraction : la table inverse.
        const pick = INVERSE_SIZE_PAIRS[Math.floor(rng() * INVERSE_SIZE_PAIRS.length)];
        return {
          kind,
          variant: 'fraction',
          targetPct: pick.pct,
          answerLabel: pick.label,
          options: INVERSE_SIZE_PAIRS.map((p) => p.label),
        };
      }
      if (roll < 0.7) {
        const limpers = Math.floor(rng() * 4); // 0 à 3
        return { kind, variant: 'open', limpers, answerBB: 3 + limpers };
      }
      if (roll < 0.85) {
        const openBB = [2, 3, 4][Math.floor(rng() * 3)];
        const inPosition = rng() < 0.5;
        const callers = rng() < 0.3 ? 1 : 0;
        return {
          kind,
          variant: 'threebet',
          openBB,
          inPosition,
          callers,
          answerBB: ((inPosition ? 3 : 4) + callers) * openBB,
        };
      }
      const potBB = 6 + Math.floor(rng() * 15); // 6 à 20 BB
      const betBB = Math.max(1, Math.round(potBB * [0.5, 2 / 3, 1][Math.floor(rng() * 3)]));
      return { kind, variant: 'bluff', betBB, potBB, answerPct: betBB / (betBB + potBB) };
    }
    case 'pushFold': {
      const deck = shuffle(createDeck(), rng);
      const cards: [Card, Card] = [deck[0], deck[1]];
      const hand = handClass(cards[0], cards[1]);
      // Tapis tiré dans un palier au hasard (3 à 13 BB).
      const bucket = PUSH_BUCKETS[Math.floor(rng() * PUSH_BUCKETS.length)];
      const stackBB = Math.max(3, bucket - Math.floor(rng() * 3));
      if (rng() < 0.65) {
        const chart: PushChart = rng() < 0.5 ? 'SB_HU' : 'BTN_3MAX';
        return {
          kind,
          cards,
          hand,
          mode: 'push',
          chart,
          chartLabel: CHART_LABELS[chart],
          stackBB,
          answer: shouldPush(hand, chart, stackBB) ?? false,
        };
      }
      const charts: CallChart[] = ['BB_VS_SB', 'BB_VS_BTN', 'SB_VS_BTN'];
      const chart = charts[Math.floor(rng() * charts.length)];
      return {
        kind,
        cards,
        hand,
        mode: 'call',
        chart,
        chartLabel: CHART_LABELS[chart],
        stackBB,
        answer: shouldCallPush(hand, chart, stackBB) ?? false,
      };
    }
    case 'handReading':
      return { kind, q: generateHandReading(rng) };
  }
}

function findHighPair(pool: Card[]): [Card, Card] | null {
  for (const rank of ['A', 'K', 'Q'] as const) {
    const matching = pool.filter((c) => c[0] === rank);
    if (matching.length >= 2) return [matching[0], matching[1]];
  }
  return null;
}

function expandClassesToCombos(classes: string[], dead: Card[]): [Card, Card][] {
  const set = expandNotation(classes);
  const deadSet = new Set(dead);
  const deck = createDeck().filter((c) => !deadSet.has(c));
  const combos: [Card, Card][] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (set.has(handClass(deck[i], deck[j]))) combos.push([deck[i], deck[j]]);
    }
  }
  return combos;
}

export type DrillGrade = { ok: boolean; actualText: string; explain: string };

/** Tolérances par type : les flash-cards sont des faits exacts (±2), le reste ±5 / ±1 out. */
export function gradeDrill(question: DrillQuestion, answer: number | boolean | string): DrillGrade {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  switch (question.kind) {
    case 'potOdds': {
      const guess = (answer as number) / 100;
      const ok = Math.abs(guess - question.answerPct) <= 0.05 + 1e-9;
      return {
        ok,
        actualText: pct(question.answerPct),
        explain: `Call ÷ pot final : ${inBB(question.call)} ÷ (${inBB(question.pot)} + ${inBB(question.bet)} + ${inBB(question.call)}) BB = ${pct(question.answerPct)}.`,
      };
    }
    case 'sizeFlash': {
      const guess = (answer as number) / 100;
      const ok = Math.abs(guess - question.answerPct) <= 0.02 + 1e-9;
      return {
        ok,
        actualText: pct(question.answerPct),
        explain: `Mise ${question.fractionLabel} → ${pct(question.answerPct)}. À mémoriser comme un fait : ⅓→20, ½→25, ⅔→29, pot→33.`,
      };
    }
    case 'outs': {
      const ok = Math.abs((answer as number) - question.answer) <= 1;
      const onFlop = question.board.length === 3;
      const mult = onFlop ? 4 : 2;
      return {
        ok,
        actualText: `${question.answer} outs`,
        explain: `${question.answer} outs × ${mult} ≈ ${Math.min(100, question.answer * mult)} % sur ${onFlop ? 'deux cartes (turn + river)' : 'une carte (la river)'}.`,
      };
    }
    case 'equity': {
      const guess = (answer as number) / 100;
      const ok = Math.abs(guess - question.answerPct) <= 0.05 + 1e-9;
      return {
        ok,
        actualText: pct(question.answerPct),
        explain: `Monte-Carlo contre ${question.rangeLabel} : ${pct(question.answerPct)}.`,
      };
    }
    case 'openRange': {
      const ok = answer === question.answer;
      return {
        ok,
        actualText: question.answer ? 'Oui, ça s’ouvre' : 'Non, ça se jette',
        explain: question.answer
          ? `${question.hand} fait partie de la range d'open ${question.position}.`
          : `${question.hand} est hors de la range d'open ${question.position}.`,
      };
    }
    case 'betSize': {
      switch (question.variant) {
        case 'amount': {
          const guess = answer as number;
          // Plancher 0,5 BB : à 1 BB, ⅓ et ½ pot se validaient mutuellement sur les petits pots.
          const tolerance = Math.max(0.5, question.answerBB * 0.1);
          return {
            ok: Math.abs(guess - question.answerBB) <= tolerance + 1e-9,
            actualText: `≈ ${fmtBB(question.answerBB)} BB`,
            explain: `${question.fractionLabel} de ${question.potBB} BB ≈ ${fmtBB(question.answerBB)} BB. (Astuces : ⅔ = pot − ⅓ ; ¾ = moitié + quart.)`,
          };
        }
        case 'fraction': {
          return {
            ok: answer === question.answerLabel,
            actualText: question.answerLabel,
            explain: `Pour lui imposer ${question.targetPct} %, mise ${question.answerLabel}. La table inverse : ⅓→20, ½→25, ⅔→29, pot→33, 2×→40.`,
          };
        }
        case 'open': {
          // Recette exacte à mémoriser : ±1 BB rendrait les classes adjacentes indistinguables.
          return {
            ok: Math.abs((answer as number) - question.answerBB) < 0.5,
            actualText: `${question.answerBB} BB`,
            explain: `Open standard : 3 BB + 1 BB par limpeur (ici ${question.limpers}).`,
          };
        }
        case 'threebet': {
          // 10 % : à 20 %, oublier le « +1× par suiveur » hors position passait pile dans la tolérance.
          const tolerance = Math.max(1, question.answerBB * 0.1);
          return {
            ok: Math.abs((answer as number) - question.answerBB) <= tolerance + 1e-9,
            actualText: `≈ ${question.answerBB} BB`,
            explain: `3-bet : ${question.inPosition ? '3× (en position)' : '4× (hors position)'} son open${question.callers > 0 ? ' + 1× par suiveur' : ''} = ${question.answerBB} BB.`,
          };
        }
        case 'bluff': {
          const guess = (answer as number) / 100;
          return {
            ok: Math.abs(guess - question.answerPct) <= 0.05 + 1e-9,
            actualText: pct(question.answerPct),
            explain: `Risque ÷ (risque + pot) : ${question.betBB} ÷ (${question.betBB} + ${question.potBB}) = ${pct(question.answerPct)}. S'il couche moins souvent que ça, ton bluff pur perd.`,
          };
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'pushFold': {
      const ok = answer === question.answer;
      const verb = question.mode === 'push' ? 'push' : 'paie';
      return {
        ok,
        actualText: question.answer
          ? question.mode === 'push'
            ? 'PUSH'
            : 'CALL'
          : 'FOLD',
        explain: `${question.hand} à ${Math.round(question.stackBB)} BB, ${question.chartLabel} : ${
          question.answer ? `ça se ${verb}` : 'ça se jette'
        } (tableau ~Nash ≤ ${Math.round(question.stackBB)} BB).`,
      };
    }
    case 'handReading': {
      const g = gradeHandReading(question.q, answer as Category);
      return { ok: g.ok, actualText: question.q.answer, explain: g.explain };
    }
  }
}

// --- Stats de drill persistées (précision + temps par paquet) ---

export type DrillStats = Record<string, { attempts: number; correct: number; times: number[] }>;

/** Cible de vitesse par type : « Acquis » = précis ET sous cette médiane. */
export const TARGET_MS: Record<DrillKind, number> = {
  potOdds: 10_000,
  sizeFlash: 5_000,
  betSize: 8_000,
  outs: 15_000,
  equity: 15_000,
  openRange: 6_000,
  pushFold: 6_000,
  handReading: 12_000,
};

export type Mastery = {
  label: 'Pas encore testé' | 'À travailler' | 'En progrès' | 'Acquis';
  tone: 'none' | 'todo' | 'progress' | 'acquired';
  /** Précision 0-1, pour la mini-jauge. */
  precision: number;
};

/** Nombre minimum de réponses avant de juger un niveau de maîtrise. */
const MASTERY_MIN = 15;

/**
 * Niveau de maîtrise d'un paquet (précision × vitesse), sur ses dernières réponses.
 * Acquis = ≥ 90 % ET médiane sous la cible ; En progrès = ≥ 75 % ; sinon À travailler.
 * Sous 15 réponses, « Pas encore testé » (données insuffisantes, badge neutre).
 */
export function masteryLevel(
  kind: DrillKind,
  s: { attempts: number; correct: number; times: number[] } | undefined,
): Mastery {
  const precision = s && s.attempts > 0 ? s.correct / s.attempts : 0;
  if (!s || s.attempts < MASTERY_MIN) return { label: 'Pas encore testé', tone: 'none', precision };
  const med = median(s.times) ?? Infinity;
  if (precision >= 0.9 && med <= TARGET_MS[kind]) {
    return { label: 'Acquis', tone: 'acquired', precision };
  }
  if (precision >= 0.75) return { label: 'En progrès', tone: 'progress', precision };
  return { label: 'À travailler', tone: 'todo', precision };
}

const DRILL_STATS_KEY = 'poker-drill-stats-v1';
const MAX_TIMES = 50;

export function loadDrillStats(): DrillStats {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DRILL_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DrillStats;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // corrompu
  }
  return {};
}

export function saveDrillStats(stats: DrillStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRILL_STATS_KEY, JSON.stringify(stats));
  } catch {
    // quota plein
  }
}

export function recordDrillResult(
  stats: DrillStats,
  kind: DrillKind,
  ok: boolean,
  elapsedMs: number,
): DrillStats {
  const entry = stats[kind] ?? { attempts: 0, correct: 0, times: [] };
  const next: DrillStats = {
    ...stats,
    [kind]: {
      attempts: entry.attempts + 1,
      correct: entry.correct + (ok ? 1 : 0),
      times: [...entry.times, elapsedMs].slice(-MAX_TIMES),
    },
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DRILL_STATS_KEY, JSON.stringify(next));
    } catch {
      // quota plein
    }
  }
  return next;
}
