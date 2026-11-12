// Calcul des tailles de mise des boutons ⅓ / ½ / ⅔ / Pot / Tapis.
// Logique pure, testée — pas de calcul dans le composant React.

export type SizeInput = {
  /** false = personne n'a misé (on OUVRE) ; true = face à une mise (on RELANCE). */
  facing: boolean;
  /** Mise en cours à égaliser (0 si personne n'a misé). */
  currentBet: number;
  /** Ce que le héros doit ajouter pour suivre. */
  callAmount: number;
  /** Le pot AFFICHÉ : tout le milieu, mises de la street comprises. */
  displayedPot: number;
  /** Montant total minimum légal (minBet ou minRaiseTo). */
  minTo: number;
  /** Montant total maximum (tapis). */
  maxTo: number;
  /** Fraction du pot, ou null pour « tapis ». */
  fraction: number | null;
};

/**
 * Montant total (« to ») d'un bouton de taille.
 * - Personne n'a misé : mise = fraction × pot affiché.
 * - Face à une mise : relance « f × pot » = mise en cours + f × (pot APRÈS ton call),
 *   c'est-à-dire tu paies le call, puis tu relances de la fraction du pot une fois ce call ajouté.
 */
export function betSizeTarget(input: SizeInput): number {
  if (input.fraction === null) return input.maxTo;
  const raw = input.facing
    ? input.currentBet + (input.displayedPot + input.callAmount) * input.fraction
    : input.displayedPot * input.fraction;
  return Math.min(Math.max(Math.round(raw), input.minTo), input.maxTo);
}
