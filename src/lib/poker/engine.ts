import { Hand } from 'pokersolver';
import { createDeck, shuffle, type Card, type RNG } from './cards';
import { computePots, type Pot } from './pot';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type BotProfile = 'station' | 'tight' | 'aggro' | 'reg';
export type PlayerStatus = 'active' | 'folded' | 'all-in';

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `amount` = montant total misé sur la street. */
  | { type: 'bet'; amount: number }
  /** `amount` = montant total APRÈS relance (« raise to »). */
  | { type: 'raise'; amount: number };

export type Player = {
  id: string;
  name: string;
  seat: number;
  /** En centimes, comme tous les montants du moteur. */
  stack: number;
  holeCards: [Card, Card] | null;
  /** Engagé sur la street en cours. */
  streetBet: number;
  /** Engagé sur toute la main → calcul des side pots. */
  totalInvested: number;
  status: PlayerStatus;
  isBot: boolean;
  botProfile?: BotProfile;
};

export type ActionRecord = {
  /** Street au moment de l'action. */
  street: Street;
  seat: number;
  action: Action;
};

export type HandResult = {
  pots: Pot[];
  winners: { seat: number; amount: number; handName?: string }[];
  /** true si la main s'est terminée sans abattage (tout le monde s'est couché). */
  wonWithoutShowdown: boolean;
};

export type HandState = {
  handId: number;
  /** Toujours triés par numéro de siège. */
  players: Player[];
  buttonSeat: number;
  blinds: { sb: number; bb: number };
  deck: Card[];
  board: Card[];
  street: Street;
  /** Jetons collectés sur les streets déjà closes. */
  pot: number;
  /** Montant à égaliser sur la street en cours. */
  currentBet: number;
  /** Taille de la dernière relance complète → calcul de la relance minimum. */
  lastRaiseSize: number;
  /** Sièges ayant agi depuis la dernière relance complète sur cette street. */
  actedSeats: number[];
  /** null = main terminée ou aucune action attendue. */
  toActSeat: number | null;
  lastAggressorSeat: number | null;
  /** Toutes les actions jouées, dans l'ordre (les blindes n'y figurent pas). */
  history: ActionRecord[];
  /** Non null dès que la main est terminée. */
  result: HandResult | null;
};

export type SeatConfig = {
  id: string;
  name: string;
  seat: number;
  stack: number;
  isBot?: boolean;
  botProfile?: BotProfile;
};

export type LegalActions = {
  seat: number;
  canCheck: boolean;
  /** Ce qu'il reste à payer pour suivre, déjà plafonné au tapis. 0 si rien à payer. */
  callAmount: number;
  canBet: boolean;
  minBet: number;
  canRaise: boolean;
  /** Relance minimum légale en montant total, plafonnée au tapis. */
  minRaiseTo: number;
  /** Montant total maximum (tapis). */
  maxTo: number;
};

export function createHand(opts: {
  handId: number;
  seats: SeatConfig[];
  buttonSeat: number;
  blinds: { sb: number; bb: number };
  /** Paquet imposé (utilisé tel quel, sans mélange) pour les tests. */
  deck?: Card[];
  rng?: RNG;
}): HandState {
  const { seats, buttonSeat, blinds } = opts;
  if (seats.length < 2 || seats.length > 6) throw new Error('Il faut entre 2 et 6 joueurs');
  if (new Set(seats.map((s) => s.seat)).size !== seats.length) throw new Error('Sièges en double');
  if (!seats.some((s) => s.seat === buttonSeat)) throw new Error('Le bouton doit être sur un siège occupé');
  if (seats.some((s) => s.stack <= 0)) throw new Error('Tapis invalide');

  const players: Player[] = seats
    .map((s) => ({
      id: s.id,
      name: s.name,
      seat: s.seat,
      stack: s.stack,
      holeCards: null as [Card, Card] | null,
      streetBet: 0,
      totalInvested: 0,
      status: 'active' as PlayerStatus,
      isBot: s.isBot ?? false,
      botProfile: s.botProfile,
    }))
    .sort((a, b) => a.seat - b.seat);

  const state: HandState = {
    handId: opts.handId,
    players,
    buttonSeat,
    blinds,
    deck: opts.deck ? [...opts.deck] : shuffle(createDeck(), opts.rng ?? Math.random),
    board: [],
    street: 'preflop',
    pot: 0,
    currentBet: 0,
    lastRaiseSize: blinds.bb,
    actedSeats: [],
    toActSeat: null,
    lastAggressorSeat: null,
    history: [],
    result: null,
  };

  // Distribution : deux cartes consécutives par joueur, en partant de la gauche du bouton.
  for (const p of orderedFrom(state, buttonSeat)) {
    const c1 = state.deck.shift();
    const c2 = state.deck.shift();
    if (!c1 || !c2) throw new Error('Paquet trop petit');
    p.holeCards = [c1, c2];
  }

  // Blindes : en heads-up le bouton est la petite blinde.
  const order = orderedFrom(state, buttonSeat);
  const headsUp = players.length === 2;
  const sbPlayer = headsUp ? playerAt(state, buttonSeat) : order[0];
  const bbPlayer = headsUp ? order[0] : order[1];
  pay(sbPlayer, Math.min(blinds.sb, sbPlayer.stack));
  pay(bbPlayer, Math.min(blinds.bb, bbPlayer.stack));
  state.currentBet = blinds.bb;

  // Premier à parler préflop : à gauche de la grosse blinde.
  state.toActSeat = nextToAct(state, bbPlayer.seat);
  if (state.toActSeat === null) {
    // Les blindes ont mis tout le monde à tapis : on distribue jusqu'à l'abattage.
    return closeStreetAndContinue(state);
  }
  return state;
}

export function legalActions(state: HandState): LegalActions {
  if (state.toActSeat === null) throw new Error('Aucune action attendue');
  const p = playerAt(state, state.toActSeat);
  const maxTo = p.streetBet + p.stack;
  const canCheck = state.currentBet === p.streetBet;
  const alreadyActed = state.actedSeats.includes(p.seat);
  return {
    seat: p.seat,
    canCheck,
    callAmount: canCheck ? 0 : Math.min(state.currentBet - p.streetBet, p.stack),
    canBet: state.currentBet === 0,
    minBet: Math.min(state.blinds.bb, maxTo),
    canRaise: state.currentBet > 0 && !alreadyActed && maxTo > state.currentBet,
    minRaiseTo: Math.min(state.currentBet + state.lastRaiseSize, maxTo),
    maxTo,
  };
}

/** Applique l'action du joueur dont c'est le tour. Retourne un nouvel état, sans muter l'entrée. */
export function applyAction(state: HandState, action: Action): HandState {
  const s = structuredClone(state);
  if (s.toActSeat === null) throw new Error('La main est terminée');
  const la = legalActions(s);
  const p = playerAt(s, s.toActSeat);

  switch (action.type) {
    case 'fold': {
      p.status = 'folded';
      break;
    }
    case 'check': {
      if (!la.canCheck) throw new Error('Impossible de checker face à une mise');
      s.actedSeats.push(p.seat);
      break;
    }
    case 'call': {
      if (la.callAmount <= 0) throw new Error('Rien à payer : check');
      pay(p, la.callAmount);
      s.actedSeats.push(p.seat);
      break;
    }
    case 'bet': {
      if (!la.canBet) throw new Error('Mise impossible ici : utilise raise');
      if (action.amount > la.maxTo) throw new Error('Mise supérieure au tapis');
      if (action.amount < la.minBet && action.amount !== la.maxTo)
        throw new Error(`Mise minimum : ${la.minBet}`);
      pay(p, action.amount - p.streetBet);
      s.currentBet = action.amount;
      s.lastRaiseSize = action.amount;
      s.actedSeats = [p.seat];
      s.lastAggressorSeat = p.seat;
      break;
    }
    case 'raise': {
      if (!la.canRaise) throw new Error('Relance non autorisée');
      if (action.amount > la.maxTo) throw new Error('Relance supérieure au tapis');
      if (action.amount <= s.currentBet)
        throw new Error('La relance doit dépasser la mise en cours');
      const raiseSize = action.amount - s.currentBet;
      const isAllIn = action.amount === la.maxTo;
      const isFullRaise = raiseSize >= s.lastRaiseSize;
      if (!isFullRaise && !isAllIn) throw new Error(`Relance minimum : ${la.minRaiseTo}`);
      pay(p, action.amount - p.streetBet);
      s.currentBet = action.amount;
      if (isFullRaise) {
        s.lastRaiseSize = raiseSize;
        s.actedSeats = [p.seat];
      } else {
        // All-in plus petit qu'une relance complète : ne rouvre pas l'action.
        s.actedSeats.push(p.seat);
      }
      s.lastAggressorSeat = p.seat;
      break;
    }
  }
  s.history.push({ street: state.street, seat: p.seat, action });
  return advance(s);
}

/** Siège occupé suivant dans le sens horaire (sert à faire tourner le bouton). */
export function nextSeatClockwise(seats: number[], from: number): number {
  const sorted = [...seats].sort((a, b) => a - b);
  return sorted.find((s) => s > from) ?? sorted[0];
}

export function playerAt(state: HandState, seat: number): Player {
  const p = state.players.find((pl) => pl.seat === seat);
  if (!p) throw new Error(`Aucun joueur au siège ${seat}`);
  return p;
}

/** Joueurs dans l'ordre horaire en partant du siège suivant `fromSeat` (exclu). */
function orderedFrom(state: HandState, fromSeat: number): Player[] {
  const after = state.players.filter((p) => p.seat > fromSeat);
  const before = state.players.filter((p) => p.seat <= fromSeat);
  return [...after, ...before];
}

function pay(p: Player, amount: number): void {
  if (amount > p.stack) throw new Error('Mise supérieure au tapis');
  p.stack -= amount;
  p.streetBet += amount;
  p.totalInvested += amount;
  if (p.stack === 0) p.status = 'all-in';
}

function roundComplete(s: HandState): boolean {
  return s.players
    .filter((p) => p.status === 'active')
    .every((p) => s.actedSeats.includes(p.seat) && p.streetBet === s.currentBet);
}

function nextToAct(s: HandState, fromSeat: number): number | null {
  for (const p of orderedFrom(s, fromSeat)) {
    if (p.status !== 'active') continue;
    if (!s.actedSeats.includes(p.seat) || p.streetBet < s.currentBet) return p.seat;
  }
  return null;
}

function advance(s: HandState): HandState {
  const inHand = s.players.filter((p) => p.status !== 'folded');
  if (inHand.length === 1) {
    refundUncalled(s);
    collectBets(s);
    const winner = inHand[0];
    winner.stack += s.pot;
    s.result = {
      pots: [{ amount: s.pot, eligibleSeats: [winner.seat] }],
      winners: [{ seat: winner.seat, amount: s.pot }],
      wonWithoutShowdown: true,
    };
    s.pot = 0;
    s.toActSeat = null;
    return s;
  }
  if (!roundComplete(s)) {
    s.toActSeat = nextToAct(s, s.toActSeat!);
    return s;
  }
  return closeStreetAndContinue(s);
}

function closeStreetAndContinue(s: HandState): HandState {
  refundUncalled(s);
  collectBets(s);
  for (;;) {
    if (s.street === 'river') return showdown(s);
    dealNextStreet(s);
    const canAct = s.players.filter((p) => p.status === 'active');
    if (canAct.length >= 2) {
      // Postflop, le premier à parler est le premier joueur actif à gauche du bouton.
      s.toActSeat = nextToAct(s, s.buttonSeat);
      return s;
    }
    // Un seul joueur (ou aucun) peut encore agir : plus d'enchères possibles, on déroule le board.
  }
}

/** Rembourse la part de mise non suivie au joueur qui a misé le plus sur la street. */
function refundUncalled(s: HandState): void {
  const inHand = s.players.filter((p) => p.status !== 'folded');
  let top: Player | null = null;
  let secondBet = 0;
  for (const p of inHand) {
    if (!top || p.streetBet > top.streetBet) {
      secondBet = top ? top.streetBet : 0;
      top = p;
    } else if (p.streetBet > secondBet) {
      secondBet = p.streetBet;
    }
  }
  if (!top || top.streetBet <= secondBet) return;
  const refund = top.streetBet - secondBet;
  top.stack += refund;
  top.streetBet -= refund;
  top.totalInvested -= refund;
  if (top.status === 'all-in' && top.stack > 0) top.status = 'active';
}

function collectBets(s: HandState): void {
  for (const p of s.players) {
    s.pot += p.streetBet;
    p.streetBet = 0;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.blinds.bb;
  s.actedSeats = [];
}

function dealNextStreet(s: HandState): void {
  const count = s.street === 'preflop' ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const card = s.deck.shift();
    if (!card) throw new Error('Paquet épuisé');
    s.board.push(card);
  }
  s.street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
}

function showdown(s: HandState): HandState {
  s.street = 'showdown';
  s.toActSeat = null;

  const pots = computePots(
    s.players.map((p) => ({ seat: p.seat, total: p.totalInvested, folded: p.status === 'folded' })),
  );
  const solved = new Map(
    s.players
      .filter((p) => p.status !== 'folded')
      .map((p) => [p.seat, Hand.solve([...p.holeCards!, ...s.board])] as const),
  );

  const amounts = new Map<number, number>();
  const names = new Map<number, string>();
  for (const pot of pots) {
    const hands = pot.eligibleSeats.map((seat) => solved.get(seat)!);
    const best = Hand.winners(hands);
    const winningSeats = orderSeatsFrom(
      pot.eligibleSeats.filter((seat) => best.includes(solved.get(seat)!)),
      s.buttonSeat,
    );
    const share = Math.floor(pot.amount / winningSeats.length);
    let remainder = pot.amount - share * winningSeats.length;
    for (const seat of winningSeats) {
      // Les centimes restants vont aux premiers sièges à gauche du bouton.
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      playerAt(s, seat).stack += share + extra;
      amounts.set(seat, (amounts.get(seat) ?? 0) + share + extra);
      names.set(seat, solved.get(seat)!.descr);
    }
  }

  s.result = {
    pots,
    winners: [...amounts.entries()].map(([seat, amount]) => ({
      seat,
      amount,
      handName: names.get(seat),
    })),
    wonWithoutShowdown: false,
  };
  s.pot = 0;
  return s;
}

/** Sièges triés dans l'ordre horaire en partant de la gauche de `fromSeat`. */
function orderSeatsFrom(seats: number[], fromSeat: number): number[] {
  const distance = (seat: number) => (seat > fromSeat ? seat - fromSeat : seat - fromSeat + 100);
  return [...seats].sort((a, b) => distance(a) - distance(b));
}
