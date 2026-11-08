import { legalActions, playerAt, type HandState } from './engine';

export type RaiseAdvice = {
  kind: 'open' | 'isolation' | '3bet' | 'bet' | 'raise';
  /** Montant total conseillé (« raise to »), déjà légal (clampé min/tapis). */
  amount: number;
  isAllIn: boolean;
  /** La recette utilisée, ex. « open standard : 3 BB ». */
  recipe: string;
  /** Ce que tu ajoutes réellement au pot. */
  risk: number;
  /** Le pot au moment de la décision (mises en cours comprises). */
  potBefore: number;
  /** Ce que l'adversaire devra payer s'il suit. */
  villainCall: number;
  /** Pot final si l'adversaire paie. */
  finalIfCalled: number;
  /** Cote offerte à l'adversaire : call ÷ pot final. */
  villainOdds: number;
  /** Part de folds nécessaire pour qu'un bluff PUR soit rentable : risque ÷ (risque + pot). */
  foldEquityNeeded: number;
};

/** Vrai si `a` parle après `b` postflop (plus proche du bouton dans le sens horaire). */
function actsAfterPostflop(state: HandState, a: number, b: number): boolean {
  const order = [
    ...state.players.filter((p) => p.seat > state.buttonSeat),
    ...state.players.filter((p) => p.seat <= state.buttonSeat),
  ].map((p) => p.seat);
  return order.indexOf(a) > order.indexOf(b);
}

/**
 * Taille de mise/relance conseillée (recettes NL2 standard) et son calcul de
 * rentabilité en fonction du pot. Logique pure, sans regarder les cartes de personne.
 */
export function suggestRaise(
  state: HandState,
  heroSeat: number,
  villainSeat: number,
): RaiseAdvice | null {
  if (state.result || state.toActSeat !== heroSeat) return null;
  const la = legalActions(state);
  if (!la.canBet && !la.canRaise) return null;

  const hero = playerAt(state, heroSeat);
  const villain = playerAt(state, villainSeat);
  const bb = state.blinds.bb;
  const potBefore = state.pot + state.players.reduce((sum, p) => sum + p.streetBet, 0);

  let kind: RaiseAdvice['kind'];
  let target: number;
  let recipe: string;

  if (state.street === 'preflop') {
    if (state.currentBet <= bb) {
      // Personne n'a relancé : open, ou isolation des limpeurs.
      const limpers = state.history.filter(
        (h) => h.street === 'preflop' && h.action.type === 'call',
      ).length;
      target = 3 * bb + limpers * bb;
      kind = limpers > 0 ? 'isolation' : 'open';
      recipe =
        limpers > 0 ? `3 BB + 1 BB par limpeur (${limpers})` : 'open standard : 3 BB';
    } else {
      // Suiveurs à froid depuis la DERNIÈRE relance : chacun grossit le pot à attaquer.
      let callers = 0;
      for (const entry of state.history) {
        if (entry.street !== 'preflop') break;
        if (entry.action.type === 'raise' || entry.action.type === 'bet') callers = 0;
        else if (entry.action.type === 'call') callers++;
      }
      const inPosition = actsAfterPostflop(state, heroSeat, villainSeat);
      const mult = inPosition ? 3 : 4;
      target = (mult + callers) * state.currentBet;
      kind = '3bet';
      recipe =
        callers > 0
          ? `${mult}× sa relance + 1× par suiveur (${callers}), ${inPosition ? 'en position' : 'hors position'}`
          : `${mult}× sa relance (${inPosition ? 'en position' : 'hors position'})`;
    }
  } else if (la.canBet) {
    target = Math.round((potBefore * 2) / 3);
    kind = 'bet';
    recipe = '⅔ du pot';
  } else {
    target = 3 * state.currentBet;
    kind = 'raise';
    recipe = '3× sa mise';
  }

  const min = la.canBet ? la.minBet : la.minRaiseTo;
  const amount = Math.min(Math.max(Math.round(target), min), la.maxTo);
  const isAllIn = amount === la.maxTo;

  const villainCall = Math.max(0, Math.min(amount - villain.streetBet, villain.stack));
  const potAfterRaise = potBefore - hero.streetBet + amount;
  const finalIfCalled = potAfterRaise + villainCall;
  const risk = amount - hero.streetBet;

  return {
    kind,
    amount,
    isAllIn,
    recipe,
    risk,
    potBefore,
    villainCall,
    finalIfCalled,
    villainOdds: finalIfCalled > 0 ? villainCall / finalIfCalled : 0,
    foldEquityNeeded: risk + potBefore > 0 ? risk / (risk + potBefore) : 0,
  };
}
