import type { Card } from '../cards';
import type { ParsedHand, ParsedStreet } from './parse-pokerstars';

// Extraction des points de décision du héros : on rejoue chaque main pour reconstruire
// le pot, ce qu'il faut ajouter, le tapis effectif et la nature de ce qu'on affronte.

export type FacingKind =
  | 'unopened' // préflop, personne n'a relancé (le héros peut ouvrir)
  | 'limped' // préflop, un ou plusieurs limps devant
  | 'raise' // préflop, face à une ouverture
  | '3bet'
  | '4bet+'
  | 'checkPostflop' // postflop, rien à payer (le héros peut miser/checker)
  | 'bet' // postflop, face à une mise
  | 'raisePostflop' // postflop, face à une relance
  | 'checkRaise'; // postflop, face à un check-raise (très orienté valeur)

export type HeroAction = {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /** Incrément ajouté (call/bet) ou total « to » (raise). */
  amount: number;
  toAmount?: number;
  allIn?: boolean;
};

export type HeroSpot = {
  handId: string;
  street: ParsedStreet;
  heroCards: [Card, Card];
  board: Card[];
  bb: number;
  /** Tout ce qui est au milieu avant l'action du héros (mises de la street comprises). */
  potBefore: number;
  /** Ce que le héros doit AJOUTER pour suivre (0 s'il peut checker). */
  toCall: number;
  heroStreetInvested: number;
  currentBet: number;
  facingBet: boolean;
  facing: FacingKind;
  /** Tapis effectif héros/agresseur en BB (toutes les règles en dépendent). */
  effectiveBB: number;
  playersInHand: number;
  limpers: number;
  villainAllIn: boolean;
  aggressorSeat: number | null;
  /** Taille « to » de la relance affrontée (pour les règles de sizing). */
  facedRaiseTo: number;
  heroAction: HeroAction;
  /** Index de la décision du héros dans hand.actions (pour rejouer l'historique AVANT). */
  actionIndex: number;
};

type SeatState = { streetInvested: number; totalInvested: number; stack: number; folded: boolean };

const STREET_BOARD: Record<ParsedStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** Rejoue une main parsée et retourne tous les points de décision du héros. */
export function extractSpots(hand: ParsedHand): HeroSpot[] {
  const state = new Map<number, SeatState>();
  for (const s of hand.seats) {
    state.set(s.seat, { streetInvested: 0, totalInvested: 0, stack: s.stack, folded: false });
  }

  const spots: HeroSpot[] = [];
  let street: ParsedStreet = 'preflop';
  let currentBet = 0;
  let preflopRaises = 0;
  let streetBetsRaises = 0;
  let limpers = 0;
  let aggressorSeat: number | null = null;
  let aggressorAllIn = false;
  let aggressorCheckRaise = false;
  const checkedThisStreet = new Set<number>();

  const resetStreet = () => {
    for (const st of state.values()) st.streetInvested = 0;
    currentBet = 0;
    streetBetsRaises = 0;
    aggressorSeat = null;
    aggressorAllIn = false;
    aggressorCheckRaise = false;
    checkedThisStreet.clear();
  };

  const potNow = () => [...state.values()].reduce((sum, s) => sum + s.totalInvested, 0);
  const playersIn = () => [...state.values()].filter((s) => !s.folded).length;

  for (let actionIdx = 0; actionIdx < hand.actions.length; actionIdx++) {
    const action = hand.actions[actionIdx];
    if (action.street !== street) {
      street = action.street;
      resetStreet();
    }
    const self = state.get(action.seat);
    if (!self) continue;

    // Décision du héros : on la photographie AVANT de l'appliquer.
    if (
      action.seat === hand.heroSeat &&
      (action.type === 'fold' ||
        action.type === 'check' ||
        action.type === 'call' ||
        action.type === 'bet' ||
        action.type === 'raise')
    ) {
      const heroRemaining = self.stack - self.totalInvested;
      const toCall = Math.min(Math.max(0, currentBet - self.streetInvested), heroRemaining);
      const aggRemaining =
        aggressorSeat !== null
          ? state.get(aggressorSeat)!.stack - state.get(aggressorSeat)!.totalInvested
          : heroRemaining;
      const effectiveBB = Math.max(0, Math.min(heroRemaining, aggRemaining)) / hand.bb;

      let facing: FacingKind;
      if (street === 'preflop') {
        facing =
          preflopRaises === 0
            ? limpers > 0
              ? 'limped'
              : 'unopened'
            : preflopRaises === 1
              ? 'raise'
              : preflopRaises === 2
                ? '3bet'
                : '4bet+';
      } else if (toCall <= 0) {
        facing = 'checkPostflop';
      } else {
        facing = aggressorCheckRaise ? 'checkRaise' : streetBetsRaises >= 2 ? 'raisePostflop' : 'bet';
      }

      spots.push({
        handId: hand.id,
        street,
        heroCards: hand.heroCards,
        board: hand.board.slice(0, STREET_BOARD[street]),
        bb: hand.bb,
        potBefore: potNow(),
        toCall,
        heroStreetInvested: self.streetInvested,
        currentBet,
        facingBet: toCall > 0,
        facing,
        effectiveBB,
        playersInHand: playersIn(),
        limpers,
        villainAllIn: aggressorAllIn,
        aggressorSeat,
        facedRaiseTo: currentBet,
        heroAction: {
          type: action.type,
          amount: action.amount,
          toAmount: action.toAmount,
          allIn: action.allIn,
        },
        actionIndex: actionIdx,
      });
    }

    // Applique l'action à l'état.
    switch (action.type) {
      case 'blind': {
        self.streetInvested += action.amount;
        self.totalInvested += action.amount;
        currentBet = Math.max(currentBet, self.streetInvested);
        break;
      }
      case 'ante': {
        self.totalInvested += action.amount; // mort : ne compte pas comme mise à suivre
        break;
      }
      case 'fold':
        self.folded = true;
        break;
      case 'check':
        checkedThisStreet.add(action.seat);
        break;
      case 'call': {
        self.streetInvested += action.amount;
        self.totalInvested += action.amount;
        if (street === 'preflop' && preflopRaises === 0) limpers += 1;
        break;
      }
      case 'bet': {
        self.streetInvested += action.amount;
        self.totalInvested += action.amount;
        currentBet = self.streetInvested;
        streetBetsRaises += 1;
        aggressorSeat = action.seat;
        aggressorAllIn = !!action.allIn;
        aggressorCheckRaise = false;
        break;
      }
      case 'raise': {
        const to = action.toAmount ?? self.streetInvested + action.amount;
        const increment = to - self.streetInvested;
        self.streetInvested = to;
        self.totalInvested += increment;
        // Check-raise : l'agresseur avait checké cette street puis relance une mise.
        aggressorCheckRaise = checkedThisStreet.has(action.seat) && currentBet > 0;
        currentBet = to;
        streetBetsRaises += 1;
        aggressorSeat = action.seat;
        aggressorAllIn = !!action.allIn;
        if (street === 'preflop') preflopRaises += 1;
        break;
      }
      case 'uncalled': {
        self.streetInvested -= action.amount;
        self.totalInvested -= action.amount;
        break;
      }
    }
  }

  return spots;
}
