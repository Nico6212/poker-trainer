import type { Card } from '../cards';

// Parseur d'historiques PokerStars (cash Hold'em, anglais), 100 % navigateur.
// Robuste aux BOM/CRLF, lignes parasites, « posts small & big blinds », « Uncalled
// bet returned ». Les historiques français sont détectés et signalés, jamais plantants.

export type ParsedStreet = 'preflop' | 'flop' | 'turn' | 'river';

export type ParsedActionType =
  | 'blind'
  | 'ante'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'uncalled';

export type ParsedAction = {
  street: ParsedStreet;
  seat: number;
  name: string;
  type: ParsedActionType;
  /** Montant en centimes : ce qui est ajouté (call/bet/raise = incrément), ou rendu (uncalled). */
  amount: number;
  /** Pour une relance : le total « to » en centimes. */
  toAmount?: number;
  allIn?: boolean;
};

export type ParsedSeat = { seat: number; name: string; stack: number };

export type ParsedHand = {
  id: string;
  sb: number;
  bb: number;
  ante: number;
  maxSeats: number;
  buttonSeat: number;
  table: string;
  /** Horodatage epoch (ms, fuseau ignoré), ou null si illisible. Sert aux tables simultanées. */
  playedAt: number | null;
  seats: ParsedSeat[];
  heroName: string;
  heroSeat: number;
  heroCards: [Card, Card];
  board: Card[];
  actions: ParsedAction[];
  /** Net du héros sur la main (gagné − investi), en centimes. Pour le bilan €/BB. */
  heroNet: number;
  /** Ce que le héros a mis dans le pot (net des mises non payées rendues). Pour le rake contribué. */
  heroInvested: number;
  /** Rake prélevé par le site sur la main, en centimes (0 si « no flop, no drop »). */
  rake: number;
  /** « Total pot » du résumé, en centimes (pot total sur lequel porte le rake). */
  totalPot: number;
  /** Nombre de joueurs distribués (le plafond de rake en dépend). */
  playersDealt: number;
  /** Cartes montrées à l'abattage, par siège (pour « Revoir la main »). */
  shown: Record<number, [Card, Card]>;
};

export type SkipReason = 'french' | 'tournament' | 'notHoldem' | 'format';

export type ParseResult = {
  hands: ParsedHand[];
  skipped: { reason: SkipReason; id?: string }[];
};

const SUPPORTED_SKIP: Record<SkipReason, string> = {
  french: 'Historique en français : active l’historique en anglais dans PokerStars.',
  tournament: 'Tournoi : non supporté en v1.2 (cash uniquement).',
  notHoldem: 'Variante non supportée (Hold’em uniquement).',
  format: 'Format de main non reconnu.',
};

export function skipLabel(reason: SkipReason): string {
  return SUPPORTED_SKIP[reason];
}

/** « €0.02 », « €2 », « $0.50 », « 0.02 » → centimes entiers. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[€$£,\s]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function normalize(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Découpe le fichier en blocs, un par main, via l'en-tête (anglais ou français). */
function splitHands(text: string): string[] {
  return normalize(text)
    .split(/(?=^(?:PokerStars (?:Zoom )?Hand #|Main PokerStars))/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

const CARD = /^[2-9TJQKA][hdcs]$/;
function toCards(raw: string): Card[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((c) => CARD.test(c)) as Card[];
}

/** Parse un bloc = une main. Retourne la main, ou la raison du rejet. */
function parseHand(block: string): ParsedHand | SkipReason {
  if (/^Main PokerStars/.test(block)) return 'french';
  const header = block.match(/Hand #(\d+):\s*(.*)/);
  if (!header) return 'format';
  const id = header[1];
  const headerRest = header[2];
  if (/Tournament #/.test(block)) return 'tournament';
  if (!/Hold'em/.test(headerRest)) return 'notHoldem';

  const blinds = headerRest.match(/\((\S+)\/(\S+)(?:\s+\w+)?\)/);
  if (!blinds) return 'format';
  const sb = parseAmount(blinds[1]);
  const bb = parseAmount(blinds[2]);

  const table = block.match(/^Table '(.+?)' (\d+)-max.*?Seat #(\d+) is the button/m);
  if (!table) return 'format';
  const tableName = table[1];
  const maxSeats = Number.parseInt(table[2], 10);
  const buttonSeat = Number.parseInt(table[3], 10);

  // Horodatage « - 2024/01/15 20:00:00 CET » → epoch (fuseau ignoré). PokerStars ne
  // zéro-padde PAS l'heure avant 10h (« 9:34:20 ») : on l'accepte et on la padde.
  const ts = block.match(/- (\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})/);
  const playedAt = ts
    ? Date.parse(`${ts[1]}-${ts[2]}-${ts[3]}T${ts[4].padStart(2, '0')}:${ts[5]}:${ts[6]}`)
    : NaN;

  const seats: ParsedSeat[] = [];
  const nameToSeat = new Map<string, number>();
  for (const line of block.split('\n')) {
    const m = line.match(/^Seat (\d+): (.+?) \((\S+) in chips\)/);
    if (m) {
      const seat = Number.parseInt(m[1], 10);
      const name = m[2];
      seats.push({ seat, name, stack: parseAmount(m[3]) });
      nameToSeat.set(name, seat);
    }
  }
  if (seats.length < 2) return 'format';

  const dealt = block.match(/^Dealt to (.+?) \[([2-9TJQKA][hdcs]) ([2-9TJQKA][hdcs])\]/m);
  if (!dealt) return 'format'; // pas de cartes héros : main inutilisable
  const heroName = dealt[1];
  const heroSeat = nameToSeat.get(heroName);
  if (heroSeat === undefined) return 'format';
  const heroCards: [Card, Card] = [dealt[2] as Card, dealt[3] as Card];

  // Streets et actions, dans l'ordre.
  const actions: ParsedAction[] = [];
  const board: Card[] = [];
  let ante = 0;
  let street: ParsedStreet = 'preflop';
  let started = false; // on ignore tout avant HOLE CARDS sauf blindes/antes

  const push = (name: string, type: ParsedActionType, amount: number, extra?: Partial<ParsedAction>) => {
    const seat = nameToSeat.get(name);
    if (seat === undefined) return;
    actions.push({ street, seat, name, type, amount, ...extra });
  };

  for (const line of block.split('\n')) {
    let m: RegExpMatchArray | null;

    if (/^\*\*\* HOLE CARDS \*\*\*/.test(line)) {
      started = true;
      street = 'preflop';
      continue;
    }
    if ((m = line.match(/^\*\*\* FLOP \*\*\* \[(.+?)\]/))) {
      street = 'flop';
      board.push(...toCards(m[1]));
      continue;
    }
    if ((m = line.match(/^\*\*\* TURN \*\*\* \[.+?\] \[(.+?)\]/))) {
      street = 'turn';
      board.push(...toCards(m[1]));
      continue;
    }
    if ((m = line.match(/^\*\*\* RIVER \*\*\* \[.+?\] \[(.+?)\]/))) {
      street = 'river';
      board.push(...toCards(m[1]));
      continue;
    }
    if (/^\*\*\* (SHOW ?DOWN|SUMMARY|FIRST|SECOND) /.test(line)) break; // on s'arrête aux décisions

    // Blindes et antes (avant comme après HOLE CARDS).
    if ((m = line.match(/^(.+?): posts small & big blinds (\S+)/))) {
      push(m[1], 'blind', parseAmount(m[2]));
      continue;
    }
    if ((m = line.match(/^(.+?): posts (?:small|big) blind (\S+)/))) {
      push(m[1], 'blind', parseAmount(m[2]));
      continue;
    }
    if ((m = line.match(/^(.+?): posts the ante (\S+)/))) {
      const a = parseAmount(m[2]);
      ante = Math.max(ante, a);
      push(m[1], 'ante', a);
      continue;
    }

    if (!started) continue; // tout le reste n'a de sens qu'après HOLE CARDS

    if ((m = line.match(/^(.+?): folds/))) push(m[1], 'fold', 0);
    else if ((m = line.match(/^(.+?): checks/))) push(m[1], 'check', 0);
    else if ((m = line.match(/^(.+?): calls (\S+)( and is all-in)?/)))
      push(m[1], 'call', parseAmount(m[2]), { allIn: !!m[3] });
    else if ((m = line.match(/^(.+?): bets (\S+)( and is all-in)?/)))
      push(m[1], 'bet', parseAmount(m[2]), { allIn: !!m[3] });
    else if ((m = line.match(/^(.+?): raises (\S+) to (\S+)( and is all-in)?/)))
      push(m[1], 'raise', parseAmount(m[2]), { toAmount: parseAmount(m[3]), allIn: !!m[4] });
    else if ((m = line.match(/^Uncalled bet \((\S+)\) returned to (.+)/)))
      push(m[2], 'uncalled', parseAmount(m[1]));
    // tout le reste (connected, sits out, said, shows, collected…) est ignoré sans planter
  }

  // Cartes montrées à l'abattage (pour la revue de main).
  const shown: Record<number, [Card, Card]> = {};
  for (const sm of block.matchAll(
    /^(.+?): shows \[([2-9TJQKA][hdcs]) ([2-9TJQKA][hdcs])\]/gm,
  )) {
    const seat = nameToSeat.get(sm[1]);
    if (seat !== undefined) shown[seat] = [sm[2] as Card, sm[3] as Card];
  }

  // Net du héros : ce qu'il a collecté (pots, side pots, splits) − ce qu'il a investi.
  let heroCollected = 0;
  for (const cm of block.matchAll(/^(.+?) collected (\S+) from/gm)) {
    if (cm[1] === heroName) heroCollected += parseAmount(cm[2]);
  }
  let heroInvested = 0;
  let invStreet: ParsedStreet = 'preflop';
  let heroStreetInv = 0;
  for (const a of actions) {
    if (a.street !== invStreet) {
      invStreet = a.street;
      heroStreetInv = 0;
    }
    if (a.seat !== heroSeat) continue;
    if (a.type === 'blind' || a.type === 'ante' || a.type === 'call' || a.type === 'bet') {
      heroInvested += a.amount;
      heroStreetInv += a.amount;
    } else if (a.type === 'raise') {
      const to = a.toAmount ?? heroStreetInv + a.amount;
      heroInvested += to - heroStreetInv;
      heroStreetInv = to;
    } else if (a.type === 'uncalled') {
      heroInvested -= a.amount;
      heroStreetInv -= a.amount;
    }
  }

  // Rake et total pot : « Total pot €X [Main pot … Side pot …] | Rake €Y » (une seule ligne).
  const potLine = block.match(/Total pot (\S+).*?\| Rake (\S+)/);
  const totalPot = potLine ? parseAmount(potLine[1]) : 0;
  const rake = potLine ? parseAmount(potLine[2]) : 0;
  // Joueurs distribués = sièges distincts ayant au moins une action préflop (exclut les sitting out).
  const playersDealt = new Set(actions.filter((a) => a.street === 'preflop').map((a) => a.seat)).size;

  return {
    id,
    sb,
    bb,
    ante,
    maxSeats,
    buttonSeat,
    table: tableName,
    playedAt: Number.isNaN(playedAt) ? null : playedAt,
    seats,
    heroName,
    heroSeat,
    heroCards,
    board,
    actions,
    heroNet: heroCollected - heroInvested,
    heroInvested,
    rake,
    totalPot,
    playersDealt,
    shown,
  };
}

export function parsePokerStars(text: string): ParseResult {
  const hands: ParsedHand[] = [];
  const skipped: ParseResult['skipped'] = [];
  const seenIds = new Set<string>();

  for (const block of splitHands(text)) {
    const result = parseHand(block);
    if (typeof result === 'string') {
      const idMatch = block.match(/Hand #(\d+)/);
      skipped.push({ reason: result, id: idMatch?.[1] });
      continue;
    }
    if (seenIds.has(result.id)) continue; // dédoublonnage par numéro de main
    seenIds.add(result.id);
    hands.push(result);
  }

  return { hands, skipped };
}
