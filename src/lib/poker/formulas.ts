// Les trois nombres du poker qui découlent tous de b = la taille de la mise en
// FRACTION DU POT (½ pot → b = 0,5 ; pot → b = 1 ; 2× pot → b = 2).
//
//   équité requise pour payer         = b / (1 + 2b)   (ta part du pot final)
//   fold-équité requise d'un bluff pur = b / (1 + b)    (sinon ton bluff perd)
//   MDF (fréquence de défense min.)    = 1 / (1 + b)    (sinon tu te fais exploiter)
//
// Identité utile : MDF + fold-équité requise = 1 (ce que tu défends + ce que tu couches).

/** Équité minimale pour payer une mise de fraction b du pot : b / (1 + 2b). */
export function requiredEquityToCall(b: number): number {
  return b / (1 + 2 * b);
}

/** Fréquence de fold adverse qui rend un bluff pur rentable au point mort : b / (1 + b). */
export function bluffFoldEquity(b: number): number {
  return b / (1 + b);
}

/** Fréquence de défense minimale face à une mise de fraction b : 1 / (1 + b). */
export function mdf(b: number): number {
  return 1 / (1 + b);
}

export type BetFormulas = {
  /** b / (1 + 2b) */
  requiredToCall: number;
  /** b / (1 + b) */
  bluffFoldEquity: number;
  /** 1 / (1 + b) */
  mdf: number;
};

/** Regroupe les trois nombres issus d'une mise de fraction b du pot. */
export function formulasFromBet(b: number): BetFormulas {
  return {
    requiredToCall: requiredEquityToCall(b),
    bluffFoldEquity: bluffFoldEquity(b),
    mdf: mdf(b),
  };
}
