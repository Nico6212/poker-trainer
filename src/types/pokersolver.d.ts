declare module 'pokersolver' {
  export interface SolvedHand {
    /** Nom court de la combinaison, ex. "Two Pair". */
    name: string;
    /** Description complète, ex. "Two Pair, A's & K's". */
    descr: string;
    rank: number;
  }

  export const Hand: {
    /** Cartes au format "Ah", "Td"… (5 à 7 cartes). */
    solve(cards: string[], game?: string): SolvedHand;
    /** Retourne les mains gagnantes (mêmes références que les objets passés). */
    winners(hands: SolvedHand[]): SolvedHand[];
  };
}
