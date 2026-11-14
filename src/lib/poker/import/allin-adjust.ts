import { Hand } from 'pokersolver';
import { createDeck, mulberry32, type Card, type RNG } from '../cards';
import type { ParsedHand, ParsedStreet } from './parse-pokerstars';

// Résultat ajusté à l'all-in : pour les tapis AVANT la river avec cartes adverses
// connues, on remplace le résultat réel (chanceux) par l'espérance.
//   EV = équité × (total pot − rake) − investi du héros
// Flop/turn : énumération EXACTE (déterministe). Préflop : Monte-Carlo graine fixe.

const STREET_BOARD: Record<ParsedStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const PREFLOP_ITERS = 20000;

/** 1 si le héros gagne, 0,5 égalité, 0 défaite, sur un board complet (5 cartes). */
function resultOnBoard(hero: [Card, Card], villain: [Card, Card], full: Card[]): number {
  const h = Hand.solve([...hero, ...full]);
  const v = Hand.solve([...villain, ...full]);
  const winners = Hand.winners([h, v]);
  if (winners.length === 2) return 0.5;
  return winners[0] === h ? 1 : 0;
}

/** Équité héros vs une main adverse connue. Énumération exacte flop/turn, MC préflop. */
export function equityVsHand(hero: [Card, Card], villain: [Card, Card], board: Card[], rng: RNG): number {
  const dead = new Set<Card>([...hero, ...villain, ...board]);
  const remaining = createDeck().filter((c) => !dead.has(c));
  const toCome = 5 - board.length;

  if (toCome === 0) return resultOnBoard(hero, villain, board);
  if (toCome === 1) {
    let sum = 0;
    for (const c of remaining) sum += resultOnBoard(hero, villain, [...board, c]);
    return sum / remaining.length;
  }
  if (toCome === 2) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        sum += resultOnBoard(hero, villain, [...board, remaining[i], remaining[j]]);
        n += 1;
      }
    }
    return sum / n;
  }
  // Préflop (5 cartes à venir) : Monte-Carlo graine fixe.
  let sum = 0;
  for (let k = 0; k < PREFLOP_ITERS; k++) {
    const pool = [...remaining];
    const run: Card[] = [];
    for (let t = 0; t < toCome; t++) {
      const idx = Math.floor(rng() * pool.length);
      run.push(pool[idx]);
      pool[idx] = pool[pool.length - 1];
      pool.pop();
    }
    sum += resultOnBoard(hero, villain, [...board, ...run]);
  }
  return sum / PREFLOP_ITERS;
}

/** Détermine si une main est un tapis AVANT la river, heads-up, cartes adverses connues. */
function qualify(hand: ParsedHand): { villain: [Card, Card]; board: Card[] } | 'skip' | null {
  let allInStreet: ParsedStreet | null = null;
  for (const a of hand.actions) {
    if (a.allIn && a.street !== 'river') allInStreet = a.street;
  }
  if (!allInStreet) return null; // aucun tapis avant la river
  if (hand.board.length !== 5) return null; // tapis non payé (adversaire couché) : pas de confrontation

  const folded = new Set(hand.actions.filter((a) => a.type === 'fold').map((a) => a.seat));
  if (folded.has(hand.heroSeat)) return null;
  const nonFolded = hand.playersDealt - folded.size;
  const shownVillains = Object.keys(hand.shown)
    .map(Number)
    .filter((s) => s !== hand.heroSeat);

  // Heads-up strict : 2 joueurs non couchés et exactement un adversaire montré.
  // Sinon (multiway, side pot avec un 3ᵉ non montré, adversaire mucké) → compté à part.
  if (nonFolded === 2 && shownVillains.length === 1) {
    return { villain: hand.shown[shownVillains[0]], board: hand.board.slice(0, STREET_BOARD[allInStreet]) };
  }
  return 'skip';
}

function seedFrom(cards: Card[]): number {
  return cards.join('').split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
}

export type AllinLuck = {
  /** Mains tapis analysées (heads-up, cartes connues). */
  hands: number;
  /** Tapis ignorés (multiway / side pot 3ᵉ joueur / adversaire mucké). */
  skipped: number;
  actualNetCents: number;
  evCents: number;
  /** Chance totale = résultat réel − EV (positif = veinard), en centimes. */
  luckCents: number;
  /** Chance en BB/100 PAR LIMITE (les BB diffèrent). */
  byLimit: { bb: number; hands: number; luckBB100: number }[];
};

type HandEval = { net: number; ev: number; luck: number; bb: number };

/** Évalue une main (coûteux pour les tapis préflop : Monte-Carlo). */
function evalHand(hand: ParsedHand, rng?: RNG): HandEval | 'skip' | null {
  const q = qualify(hand);
  if (q === null) return null;
  if (q === 'skip') return 'skip';
  const r = rng ?? mulberry32(seedFrom([...hand.heroCards, ...q.villain, ...q.board]));
  const eq = equityVsHand(hand.heroCards, q.villain, q.board, r);
  const ev = eq * (hand.totalPot - hand.rake) - hand.heroInvested;
  return { net: hand.heroNet, ev, luck: hand.heroNet - ev, bb: hand.bb };
}

function aggregate(evals: HandEval[], skipped: number): AllinLuck {
  let actualNet = 0;
  let ev = 0;
  const byBb = new Map<number, { luckBB: number; n: number }>();
  for (const e of evals) {
    actualNet += e.net;
    ev += e.ev;
    const b = byBb.get(e.bb) ?? { luckBB: 0, n: 0 };
    b.luckBB += e.bb > 0 ? e.luck / e.bb : 0;
    b.n += 1;
    byBb.set(e.bb, b);
  }
  return {
    hands: evals.length,
    skipped,
    actualNetCents: actualNet,
    evCents: ev,
    luckCents: actualNet - ev,
    byLimit: [...byBb.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bb, b]) => ({ bb, hands: b.n, luckBB100: b.n > 0 ? (b.luckBB / b.n) * 100 : 0 })),
  };
}

/** Résultat ajusté à l'all-in (synchrone). rng optionnel pour les tests. */
export function allinAdjusted(hands: ParsedHand[], rng?: RNG): AllinLuck {
  const evals: HandEval[] = [];
  let skipped = 0;
  for (const hand of hands) {
    const e = evalHand(hand, rng);
    if (e === 'skip') skipped += 1;
    else if (e) evals.push(e);
  }
  return aggregate(evals, skipped);
}

/** Version chunkée (une main à la fois, rend la main au navigateur) pour ne pas geler l'UI. */
export async function allinAdjustedChunked(
  hands: ParsedHand[],
  onProgress?: (done: number, total: number) => void,
): Promise<AllinLuck> {
  let skipped = 0;
  const qualifying: ParsedHand[] = [];
  for (const hand of hands) {
    const q = qualify(hand);
    if (q === 'skip') skipped += 1;
    else if (q !== null) qualifying.push(hand);
  }
  const evals: HandEval[] = [];
  for (let i = 0; i < qualifying.length; i++) {
    const e = evalHand(qualifying[i]);
    if (e && e !== 'skip') evals.push(e);
    onProgress?.(i + 1, qualifying.length);
    await new Promise((r) => setTimeout(r, 0)); // laisse le navigateur respirer
  }
  return aggregate(evals, skipped);
}
