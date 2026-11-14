// Garde-fous de bankroll. La bankroll est SAISIE par l'utilisateur (on ne peut pas
// la déduire des mains : dépôts et retraits manquent). Une « cave » = 100 BB.

export const CAVES_MIN = 20; // en dessous : alerte
export const CAVES_RECO = 30; // limite max conseillée

/** Échelle standard des limites (grosse blinde en centimes). */
const LADDER = [2, 5, 10, 25, 50, 100, 200];

/** Nombre de caves (100 BB) que couvre la bankroll à une limite donnée. */
export const cavesFor = (bankrollCents: number, bb: number): number =>
  bb > 0 ? bankrollCents / (100 * bb) : 0;

export type BankrollLimit = { bb: number; caves: number; underMin: boolean };

export function bankrollByLimit(bankrollCents: number, bbs: number[]): BankrollLimit[] {
  return [...new Set(bbs)]
    .sort((a, b) => a - b)
    .map((bb) => {
      const caves = cavesFor(bankrollCents, bb);
      return { bb, caves, underMin: caves < CAVES_MIN };
    });
}

/**
 * Limite max conseillée = plus haute limite où la bankroll couvre ≥ 30 caves.
 * null si même NL2 n'y est pas ; on indique alors le montant nécessaire pour NL2.
 */
export function recommendedMaxStake(bankrollCents: number): {
  bb: number | null;
  neededCentsForNL2: number;
} {
  let best: number | null = null;
  for (const bb of LADDER) {
    if (bankrollCents >= CAVES_RECO * 100 * bb) best = bb;
  }
  return { bb: best, neededCentsForNL2: CAVES_RECO * 100 * 2 };
}
