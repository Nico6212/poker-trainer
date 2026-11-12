import type { Card } from './cards';
import type { Street } from './engine';

// Interface « Spot » : une situation de décision isolée, indépendante du moteur de
// partie. Prévue pour l'import futur d'historiques (PokerStars…) afin de transformer
// de vraies mains en questions de drill. Rien ne la consomme encore.

export type SpotAction = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export type Spot = {
  /** Origine : 'engine' (joué ici), 'import' (historique), 'drill' (généré). */
  source: 'engine' | 'import' | 'drill';
  /** Identifiant d'origine (main PokerStars, etc.), pour la déduplication. */
  sourceId?: string;
  street: Street;
  heroCards: [Card, Card];
  board: Card[];
  /** Nombre de joueurs encore en jeu à la décision. */
  players: number;
  heroPosition?: string;
  /** Montants en centimes. */
  potBefore: number;
  toCall: number;
  bb: number;
  /** Action réellement choisie par le héros, si connue. */
  heroAction?: SpotAction;
  /** Équité estimée au moment de la décision, si connue. */
  equity?: number | null;
};
