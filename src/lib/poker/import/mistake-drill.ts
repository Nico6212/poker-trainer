import type { MistakeType } from './classify-mistake';
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
  const odds =
    m.equity !== undefined && m.required !== undefined
      ? ` Équité ${pct(m.equity)} vs cote requise ${pct(m.required)}.`
      : '';

  switch (m.type as MistakeType) {
    case 'call-sans-cote':
    case 'call-raise-faible':
      return {
        decision: true,
        prompt: 'Tu fais face à une mise. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: FOLD,
        played: PLAY,
        explain: `Call sans la cote : tu paies trop cher pour ton équité.${odds} ${m.detail}`.trim(),
      };
    case 'fold-avec-cote':
      return {
        decision: true,
        prompt: 'Tu fais face à une mise. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: PLAY,
        played: FOLD,
        explain: `Fold avec la cote : tu avais le prix pour payer.${odds} ${m.detail}`.trim(),
      };
    case 'jam-main-moyenne':
      return {
        decision: true,
        prompt: 'Que fais-tu de ta main ?',
        options: [JAM, CONTROL],
        correct: CONTROL,
        played: JAM,
        explain: `Tapis avec une main moyenne : trop peu d'équité pour mettre tout dedans.${odds} ${m.detail}`.trim(),
      };
    case '4bet-call':
      return {
        decision: true,
        prompt: 'Tu fais face à un 4-bet en profond. Que fais-tu ?',
        options: [PLAY, FOLD],
        correct: FOLD,
        played: PLAY,
        explain: `Call de 4-bet hors AA/KK en stacks profonds : domination fréquente. ${m.detail}`.trim(),
      };
    case 'open-limp':
      return {
        decision: true,
        prompt: 'Action au héros, pot non ouvert. Que fais-tu ?',
        options: [OPEN, LIMP],
        correct: OPEN,
        played: LIMP,
        explain: `Open-limp : si la main se joue, elle se relance. ${m.detail}`.trim(),
      };
    case 'open-size':
      return {
        decision: false,
        prompt: 'Taille d’ouverture à revoir',
        options: [OPEN, OPEN],
        correct: OPEN,
        played: OPEN,
        explain: `Taille d'open non standard. Recette : 3 BB + 1 BB par limpeur. ${m.detail}`.trim(),
      };
    case 'small-3bet':
      return {
        decision: false,
        prompt: '3-bet trop petit à revoir',
        options: ['3-bet', '3-bet'],
        correct: '3-bet',
        played: '3-bet',
        explain: `3-bet sous-dimensionné : vise ≥ 3× (en position) / 4× (hors position) l'open. ${m.detail}`.trim(),
      };
  }
}
