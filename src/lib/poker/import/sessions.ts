import type { ParsedHand } from './parse-pokerstars';
import type { Mistake, MistakeType } from './classify-mistake';

// Regroupement des mains importées en sessions (mains espacées de < 30 min) et
// bilan par session : résultat €/BB-100, VPIP/PFR/3-bet, tables simultanées, erreurs.

const SESSION_GAP_MS = 30 * 60_000;
const SIMULTANEOUS_WINDOW_MS = 5 * 60_000;

export type SessionStats = {
  hands: number;
  netCents: number;
  bb: number;
  /** Résultat en BB pour 100 mains, calculé main par main (chacune avec sa propre BB). */
  bb100: number;
  vpip: number | null;
  pfr: number | null;
  threeBet: number | null;
  /** Nombre maximum de tables jouées en même temps. */
  maxTables: number;
  tables: string[];
  /** Limites jouées sur la session (ex. ['NL2', 'NL10']), triées par BB croissante. */
  limits: string[];
  /** Plus grosse BB de la session, en centimes (pour l'alerte « limite au-dessus »). */
  maxBb: number;
  errorCounts: Record<MistakeType, number>;
  totalErrors: number;
  startAt: number | null;
  endAt: number | null;
};

export type Session = {
  handIds: string[];
  day: string;
  stats: SessionStats;
  /** La session est jouée à une limite supérieure à la limite habituelle. */
  aboveUsual: boolean;
};

/** Étiquette de limite depuis la grosse blinde en centimes : 2 → « NL2 », 10 → « NL10 ». */
export function nlLabel(bbCents: number): string {
  return `NL${bbCents}`;
}

function emptyErrorCounts(): Record<MistakeType, number> {
  return {
    'open-limp': 0,
    'open-size': 0,
    'small-3bet': 0,
    '4bet-call': 0,
    'call-sans-cote': 0,
    'call-raise-faible': 0,
    'fold-avec-cote': 0,
    'jam-main-moyenne': 0,
  };
}

/** Trie les mains par horodatage (les sans-date gardent leur ordre, à la fin). */
function sortByTime(hands: ParsedHand[]): ParsedHand[] {
  return [...hands].sort((a, b) => (a.playedAt ?? Infinity) - (b.playedAt ?? Infinity));
}

/** Jour local « AAAA-MM-JJ » (l'horodatage est lu en heure murale, fuseau ignoré). */
function localDay(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Découpe en sessions : nouvelle session dès qu'un trou dépasse 30 minutes. */
export function groupSessions(hands: ParsedHand[], gapMs = SESSION_GAP_MS): ParsedHand[][] {
  const sorted = sortByTime(hands);
  const sessions: ParsedHand[][] = [];
  let current: ParsedHand[] = [];
  let lastTime: number | null = null;
  for (const hand of sorted) {
    if (
      current.length > 0 &&
      lastTime !== null &&
      hand.playedAt !== null &&
      hand.playedAt - lastTime > gapMs
    ) {
      sessions.push(current);
      current = [];
    }
    current.push(hand);
    if (hand.playedAt !== null) lastTime = hand.playedAt;
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/** Nombre maximum de tables actives en même temps (fenêtre glissante de 5 min). */
export function maxSimultaneousTables(hands: ParsedHand[], windowMs = SIMULTANEOUS_WINDOW_MS): number {
  const timed = hands.filter((h) => h.playedAt !== null);
  let max = 1;
  for (const ref of timed) {
    const t = ref.playedAt!;
    const tables = new Set<string>();
    for (const h of timed) {
      if (h.playedAt! <= t && h.playedAt! > t - windowMs) tables.add(h.table);
    }
    max = Math.max(max, tables.size);
  }
  return max;
}

/** VPIP / PFR / 3-bet d'une main pour le héros. */
function heroPreflop(hand: ParsedHand): { vpip: boolean; pfr: boolean; threeBet: boolean; threeBetOpp: boolean } {
  let raises = 0;
  let vpip = false;
  let pfr = false;
  let threeBet = false;
  let threeBetOpp = false;
  for (const a of hand.actions) {
    if (a.street !== 'preflop') break;
    if (a.seat === hand.heroSeat) {
      if (raises >= 1 && !vpip && !pfr) threeBetOpp = true;
      if (a.type === 'call') vpip = true;
      if (a.type === 'raise') {
        vpip = true;
        pfr = true;
        if (raises >= 1) threeBet = true;
      }
    }
    if (a.type === 'raise') raises += 1;
  }
  return { vpip, pfr, threeBet, threeBetOpp };
}

export function sessionStats(hands: ParsedHand[], mistakes: Mistake[]): SessionStats {
  const bb = hands[0]?.bb ?? 2;
  let netCents = 0;
  let netBB = 0; // somme des net/BB, chaque main avec SA propre BB (sessions multi-limites)
  let vpipCount = 0;
  let pfrCount = 0;
  let threeBetCount = 0;
  let threeBetOpps = 0;
  const tables = new Set<string>();
  const bbCounts = new Map<number, number>();
  for (const hand of hands) {
    netCents += hand.heroNet;
    if (hand.bb > 0) netBB += hand.heroNet / hand.bb;
    bbCounts.set(hand.bb, (bbCounts.get(hand.bb) ?? 0) + 1);
    tables.add(hand.table);
    const pf = heroPreflop(hand);
    if (pf.vpip) vpipCount += 1;
    if (pf.pfr) pfrCount += 1;
    if (pf.threeBet) threeBetCount += 1;
    if (pf.threeBetOpp || pf.threeBet) threeBetOpps += 1;
  }
  const errorCounts = emptyErrorCounts();
  for (const m of mistakes) errorCounts[m.type] += 1;

  const n = hands.length;
  const bbs = [...bbCounts.keys()].sort((a, b) => a - b);
  const times = hands.map((h) => h.playedAt).filter((t): t is number => t !== null);
  return {
    hands: n,
    netCents,
    bb,
    bb100: n > 0 ? (netBB / n) * 100 : 0,
    vpip: n > 0 ? vpipCount / n : null,
    pfr: n > 0 ? pfrCount / n : null,
    threeBet: threeBetOpps > 0 ? threeBetCount / threeBetOpps : null,
    maxTables: maxSimultaneousTables(hands),
    tables: [...tables],
    limits: bbs.map(nlLabel),
    maxBb: bbs.length ? bbs[bbs.length - 1] : 0,
    errorCounts,
    totalErrors: mistakes.length,
    startAt: times.length ? Math.min(...times) : null,
    endAt: times.length ? Math.max(...times) : null,
  };
}

/** Limite « habituelle » = celle jouée sur le plus de mains (toutes sessions confondues). */
function usualBb(hands: ParsedHand[]): number {
  const counts = new Map<number, number>();
  for (const h of hands) counts.set(h.bb, (counts.get(h.bb) ?? 0) + 1);
  let usual = 0;
  let best = -1;
  for (const [bb, c] of counts) {
    if (c > best) {
      best = c;
      usual = bb;
    }
  }
  return usual;
}

/** Bilan complet : sessions (avec leur jour) + erreurs rattachées par numéro de main. */
export function buildSessions(hands: ParsedHand[], mistakes: Mistake[]): Session[] {
  const byHand = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const list = byHand.get(m.handId) ?? [];
    list.push(m);
    byHand.set(m.handId, list);
  }
  const usual = usualBb(hands);
  return groupSessions(hands).map((sessionHands) => {
    const sessionMistakes = sessionHands.flatMap((h) => byHand.get(h.id) ?? []);
    const start = sessionHands.find((h) => h.playedAt !== null)?.playedAt ?? null;
    const stats = sessionStats(sessionHands, sessionMistakes);
    return {
      handIds: sessionHands.map((h) => h.id),
      day: start !== null ? localDay(start) : 'sans date',
      stats,
      aboveUsual: usual > 0 && stats.maxBb > usual,
    };
  });
}
