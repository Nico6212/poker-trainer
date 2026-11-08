import type { Street } from './engine';
import type { DecisionRecord, DecisionSpot, ErrorKind } from './session';

// Répétition espacée des erreurs (système de Leitner) : chaque erreur devient une
// carte-spot persistante, rejouée à intervalles croissants tant qu'elle est réussie.

export type SrsCard = {
  /** Identifiant du point de décision d'origine (dédoublonnage). */
  id: string;
  createdAt: string;
  street: Street;
  spot: DecisionSpot;
  callAmount: number;
  potTotal: number;
  required: number;
  equity: number;
  /** La bonne action, dérivée de équité vs requis. */
  correctAction: 'call' | 'fold';
  errorKind: ErrorKind;
  /** Boîte de Leitner 1..5 : réussie → boîte suivante, ratée → boîte 1. */
  box: number;
  dueAt: string;
  reps: number;
  lapses: number;
  /** Nuance cotes implicites, copiée de la décision d'origine. */
  outsCount?: number | null;
  villainHadChips?: boolean;
};

/** Intervalles en jours par boîte (boîte 1 = re-due immédiatement). */
export const SRS_INTERVALS_DAYS = [0, 1, 3, 7, 16];

/**
 * Marge minimale (en points d'équité) pour qu'un call-sans-cote devienne une carte.
 * En dessous, le spot est quasi break-even : le bruit Monte-Carlo (±1-2 pts) et
 * l'incertitude de la range estimée interdisent d'en faire une vérité binaire.
 */
export const SRS_CALL_MARGIN = 0.03;

export function cardFromDecision(decision: DecisionRecord, now = new Date()): SrsCard | null {
  if (!decision.isError || !decision.errorKind || !decision.spot || decision.equity === null) {
    return null;
  }
  if (!decision.id) return null;
  // Spot limite mesuré au bruit près : on ne drille pas un quasi-coin-flip comme une vérité.
  if (
    decision.errorKind === 'call-sans-cote' &&
    decision.required - decision.equity <= SRS_CALL_MARGIN
  ) {
    return null;
  }
  // Multiway : l'équité est calculée contre UNE range, la « bonne action » n'est pas fiable.
  if ((decision.spot.activeOpponents ?? 1) > 1) return null;
  return {
    id: decision.id,
    createdAt: now.toISOString(),
    street: decision.street,
    spot: decision.spot,
    callAmount: decision.callAmount,
    potTotal: decision.potTotal,
    required: decision.required,
    equity: decision.equity,
    correctAction: decision.equity >= decision.required ? 'call' : 'fold',
    errorKind: decision.errorKind,
    box: 1,
    dueAt: now.toISOString(),
    reps: 0,
    lapses: 0,
    outsCount: decision.outsCount ?? null,
    villainHadChips: decision.villainHadChips ?? false,
  };
}

/** Replanifie une carte après une révision : réussie → boîte suivante, ratée → boîte 1. */
export function scheduleNext(card: SrsCard, correct: boolean, now = new Date()): SrsCard {
  const box = correct ? Math.min(card.box + 1, SRS_INTERVALS_DAYS.length) : 1;
  const days = SRS_INTERVALS_DAYS[box - 1];
  const dueAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return {
    ...card,
    box,
    dueAt,
    reps: card.reps + 1,
    lapses: card.lapses + (correct ? 0 : 1),
  };
}

export function dueCards(cards: SrsCard[], now = new Date()): SrsCard[] {
  return cards
    .filter((c) => new Date(c.dueAt).getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

// --- Persistance ---

const SRS_KEY = 'poker-srs-v1';
const MAX_CARDS = 200;

export function loadSrs(): SrsCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SRS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SrsCard[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // corrompu : on repart sans file
  }
  return [];
}

/**
 * Plafonne la file à MAX_CARDS en évinçant d'abord les cartes les mieux acquises
 * (boîte haute, échéance lointaine) : les erreurs actives sont conservées.
 */
export function capCards(cards: SrsCard[]): SrsCard[] {
  if (cards.length <= MAX_CARDS) return cards;
  const keep = new Set(
    [...cards]
      .sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt))
      .slice(0, MAX_CARDS)
      .map((c) => c.id),
  );
  return cards.filter((c) => keep.has(c.id));
}

export function saveSrs(cards: SrsCard[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SRS_KEY, JSON.stringify(capCards(cards)));
  } catch {
    // quota plein
  }
}

/** Ajoute une carte si elle n'existe pas déjà (même point de décision). */
export function addCard(cards: SrsCard[], card: SrsCard): SrsCard[] {
  if (cards.some((c) => c.id === card.id)) return cards;
  return capCards([...cards, card]);
}

export function updateCard(cards: SrsCard[], updated: SrsCard): SrsCard[] {
  return cards.map((c) => (c.id === updated.id ? updated : c));
}
