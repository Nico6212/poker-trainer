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

/**
 * Valeur de préremplissage NEUTRE, indépendante de la main et de l'action conseillée :
 * 3 BB pour une ouverture préflop, ½ pot pour une mise postflop, 3× la mise en cours
 * face à une relance. En Masqué/Examen, on préremplit avec ça pour ne RIEN révéler.
 */
export function neutralPrefill(input: {
  currentBet: number;
  bb: number;
  callAmount: number;
  displayedPot: number;
  minTo: number;
  maxTo: number;
}): number {
  const clamp = (v: number) => Math.min(Math.max(Math.round(v), input.minTo), input.maxTo);
  if (input.currentBet === 0) {
    // Postflop, personne n'a misé : ½ pot.
    return betSizeTarget({
      facing: false,
      currentBet: 0,
      callAmount: 0,
      displayedPot: input.displayedPot,
      minTo: input.minTo,
      maxTo: input.maxTo,
      fraction: 1 / 2,
    });
  }
  // Préflop non relancé : ouverture 3 BB. Face à une mise/relance : 3× la mise en cours.
  return input.currentBet <= input.bb ? clamp(3 * input.bb) : clamp(3 * input.currentBet);
}

/**
 * Montant prérempli dans le champ de mise. On ne révèle le conseil qu'en Découverte ;
 * sinon on reste sur la valeur neutre pour ne pas trahir l'action recommandée.
 */
export function prefillAmount(
  revealAdvice: boolean,
  adviceAmount: number | null,
  neutral: number,
): number {
  return revealAdvice && adviceAmount !== null ? adviceAmount : neutral;
}
