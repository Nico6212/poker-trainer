// Diagnostic des confusions de méthode : quand une réponse d'examen est fausse,
// on la compare aux résultats des formules fautives classiques pour nommer l'erreur.

const MATCH_TOLERANCE = 0.015;
const DISTINCT_FROM_ACTUAL = 0.02;

const pct = (x: number) => `${Math.round(x * 100)} %`;

function matches(guess: number, candidate: number, actual: number): boolean {
  return (
    Math.abs(guess - candidate) <= MATCH_TOLERANCE &&
    Math.abs(candidate - actual) > DISTINCT_FROM_ACTUAL
  );
}

/**
 * Pourquoi la réponse « il te faut X % » est fausse, si on reconnaît une formule fautive.
 * @param guess   réponse donnée (fraction)
 * @param callAmount  ce qu'il fallait payer
 * @param potTotal    pot au moment de la décision, mise adverse comprise, SANS le call
 * @param villainBet  la mise adverse sur la street
 */
export function diagnoseRequired(
  guess: number,
  { callAmount, potTotal, villainBet }: { callAmount: number; potTotal: number; villainBet: number },
): string | null {
  const actual = callAmount / (potTotal + callAmount);
  if (potTotal <= 0) return null;

  const dividedByPotWithoutCall = callAmount / potTotal;
  if (matches(guess, dividedByPotWithoutCall, actual)) {
    return `Tu as divisé par le pot SANS ton call (${pct(dividedByPotWithoutCall)}). Le pot final inclut ton call : la bonne réponse est ${pct(actual)}.`;
  }

  const potBeforeBet = potTotal - villainBet;
  if (potBeforeBet > 0) {
    const betOverPot = villainBet / potBeforeBet;
    if (matches(guess, betOverPot, actual)) {
      return `Tu as calculé SA mise ÷ le pot (${pct(betOverPot)}) : c'est la taille de sa mise, pas ce qu'il te faut. La bonne formule est ton call ÷ pot final = ${pct(actual)}.`;
    }
  }

  return null;
}

/**
 * Pourquoi la réponse « tu as X % de chances » est fausse : mauvais multiplicateur
 * de la règle du 2 et du 4.
 * @param cardsToCome  cartes réellement à venir pour toi (1 ou 2)
 */
export function diagnoseEquity(
  guess: number,
  { outsCount, cardsToCome, actual }: { outsCount: number; cardsToCome: 1 | 2; actual: number },
): string | null {
  if (outsCount <= 0) return null;
  const wrongCards = cardsToCome === 2 ? 1 : 2;
  const wrongEstimate = (outsCount * 2 * wrongCards) / 100;
  if (matches(guess, wrongEstimate, actual)) {
    return cardsToCome === 2
      ? `${outsCount} outs × 2 = ${pct(wrongEstimate)} : c'est le compte pour UNE carte. Ici tu vois turn ET river → × 4 ≈ ${pct((outsCount * 4) / 100)}.`
      : `${outsCount} outs × 4 = ${pct(wrongEstimate)} : le × 4 ne vaut que si tu vois turn ET river. Ici une seule carte → × 2 ≈ ${pct((outsCount * 2) / 100)}.`;
  }
  return null;
}
