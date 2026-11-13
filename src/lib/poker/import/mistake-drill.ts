import { equityLabel, type MistakeType } from './classify-mistake';
import type { StoredMistake } from './db';

// Transforme une erreur importée en question de décision rejouable : on te remet
// dans le spot, tu rejoues le geste, on te montre la bonne action et le pourquoi.
// Les erreurs de taille (open/3-bet) ne sont pas des décisions binaires : on les
// présente en revue, avec la recette correcte.

export type MistakeQuestion = {
  /** true = décision binaire notée ; false = fiche de revue (taille), simple validation. */
  decision: boolean;
  prompt: string;
  options: [string, string];
  /** La bonne action (celle que l'outil recommande). */
  correct: string;
  /** Ce que le héros a fait (l'erreur). */
  played: string;
  explain: string;
};

const pct = (x: number | undefined) => (x === undefined ? '?' : `${Math.round(x * 100)} %`);

const PLAY = 'Payer';
const FOLD = 'Se coucher';
const JAM = 'Tapis';
const CONTROL = 'Checker / contrôler';
const LIMP = 'Limper';
const OPEN = 'Ouvrir (relancer)';

export function mistakeQuestion(m: StoredMistake): MistakeQuestion {
  // Chiffres d'équité/cote, une seule fois (le detail du classifieur ne les répète plus ici).
  // Jamais « 0 % » : equityLabel écrit « < 5 % » sous 5 points.
  const eq = m.equity === undefined ? '?' : equityLabel(m.equity);
  const req = pct(m.required);
  const range = m.villainRange ? ` ${m.villainRange}` : ''; // range retenue, toujours jointe si dispo

  switch (m.type as MistakeType) {
    case 'call-sans-cote':
    case 'call-raise-faible':
      return {
        decision: true,
        prompt: 'Tu fais face à une mise. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: FOLD,
        played: PLAY,
        explain: `Ton équité (${eq}) est sous la cote requise (${req}) : tu paies trop cher${
          m.equity !== undefined && m.equity < 0.05
            ? ' (tu ne bats quasiment aucune main de la range de value)'
            : ''
        }.${range}`,
      };
    case 'fold-avec-cote':
      return {
        decision: true,
        prompt: 'Tu fais face à une mise. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: PLAY,
        played: FOLD,
        explain: `Tu avais la cote : ton équité (${eq}) dépasse le prix requis (${req}).${range}`,
      };
    case 'jam-main-moyenne':
      return {
        decision: true,
        prompt: 'Que fais-tu de ta main ?',
        options: [JAM, CONTROL],
        correct: CONTROL,
        played: JAM,
        explain: `Tapis avec seulement ${eq} d'équité contre la range qui paie — trop peu pour tout mettre dedans.${range}`,
      };
    case '4bet-call':
      return {
        decision: true,
        prompt: 'Tu fais face à un 4-bet en profond. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: FOLD,
        played: PLAY,
        explain: m.detail,
      };
    case 'open-limp':
      return {
        decision: true,
        prompt: 'Action au héros, pot non ouvert. Que fais-tu ?',
        options: [OPEN, LIMP],
        correct: OPEN,
        played: LIMP,
        explain: m.detail,
      };
    case 'open-size':
      return {
        decision: false,
        prompt: 'Taille d’ouverture à revoir',
        options: [OPEN, OPEN],
        correct: OPEN,
        played: OPEN,
        explain: `Taille d'open non standard : ${m.detail}`,
      };
    case 'small-3bet':
      return {
        decision: false,
        prompt: '3-bet trop petit à revoir',
        options: ['3-bet', '3-bet'],
        correct: '3-bet',
        played: '3-bet',
        explain: `Sous-dimensionné : ${m.detail}`,
      };
  }
}
