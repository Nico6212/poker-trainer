import { JAM_WEAK, type MistakeType } from './classify-mistake';
import { SRS_INTERVALS_DAYS } from '../srs';

// Répétition espacée des erreurs importées : même moteur de Leitner que le jeu live
// (intervalles SRS_INTERVALS_DAYS), appliqué aux erreurs rejouées dans « Mes erreurs ».
// Une erreur ratée au rejeu retombe en boîte 1 → due tout de suite → revient plus tôt.
//
// Et coût estimé en espérance, pour trier les erreurs (les plus chères d'abord) :
//   call      → (requis − équité) × pot final
//   fold+cote → (équité − requis) × pot final
//   taille/déterministes → 0 (placées en fin de liste)

const DAY_MS = 24 * 60 * 60 * 1000;

export type Review = { box: number; dueAt: number; reps: number; lapses: number };

export function newReview(now: number): Review {
  return { box: 1, dueAt: now, reps: 0, lapses: 0 };
}

/** Réussie → boîte suivante ; ratée → boîte 1 (due immédiatement). */
export function scheduleReview(r: Review, correct: boolean, now: number): Review {
  const box = correct ? Math.min(r.box + 1, SRS_INTERVALS_DAYS.length) : 1;
  const days = SRS_INTERVALS_DAYS[box - 1];
  return {
    box,
    dueAt: now + days * DAY_MS,
    reps: r.reps + 1,
    lapses: r.lapses + (correct ? 0 : 1),
  };
}

export function isDue(r: Review, now: number): boolean {
  return r.dueAt <= now;
}

type CostInput = {
  type: MistakeType;
  equity?: number;
  required?: number;
  spot: {
    potBefore: number;
    toCall: number;
    heroStreetInvested?: number;
    heroAction?: { type: string; amount?: number; toAmount?: number };
    /** Tapis effectif (le plus petit des deux) en BB, et taille de la BB : plafonne le tapis. */
    effectiveBB?: number;
    bb?: number;
  };
};

/** Jetons que le héros met dans le pot avec son tapis. */
function jamAdded(spot: CostInput['spot']): number {
  const a = spot.heroAction;
  if (!a) return 0;
  if (a.type === 'raise') return Math.max(0, (a.toAmount ?? 0) - (spot.heroStreetInvested ?? 0));
  if (a.type === 'bet') return a.amount ?? 0;
  return 0;
}

/** Le coût d'un jam est une estimation (pas une cote de pot) : à afficher comme telle. */
export function isCostEstimate(type: MistakeType): boolean {
  return type === 'jam-main-moyenne';
}

/** Coût estimé en espérance, en centimes (toujours ≥ 0). */
export function mistakeCost(m: CostInput): number {
  switch (m.type) {
    case 'call-sans-cote':
    case 'call-raise-faible':
      if (m.equity === undefined || m.required === undefined) return 0;
      return Math.max(0, (m.required - m.equity) * (m.spot.potBefore + m.spot.toCall));
    case 'fold-avec-cote':
      if (m.equity === undefined || m.required === undefined) return 0;
      return Math.max(0, (m.equity - m.required) * (m.spot.potBefore + m.spot.toCall));
    case 'jam-main-moyenne': {
      // Proxy : sous le point mort du tapis (~40 %), chaque point d'équité manquant
      // coûte sur le pot si l'adversaire paie = pot avant le tapis + mon tapis + son call.
      // On plafonne le tapis au tapis effectif : rien ne sert d'engager plus que le plus
      // petit des deux tapis (l'excédent serait rendu).
      if (m.equity === undefined) return 0;
      const effectiveCents =
        m.spot.effectiveBB !== undefined && m.spot.bb !== undefined
          ? m.spot.effectiveBB * m.spot.bb
          : Infinity;
      const added = Math.min(jamAdded(m.spot), effectiveCents);
      const villainCall = Math.max(0, added - m.spot.toCall);
      const potFinal = m.spot.potBefore + added + villainCall;
      return Math.max(0, (JAM_WEAK - m.equity) * potFinal);
    }
    default:
      return 0; // open-limp, open-size, small-3bet, 4bet-call : déterministes, non chiffrées
  }
}

/** « ≈ 0,35 € » (ou « ≈ 0,60 € estimés » pour un jam) ; vide si coût nul. */
export function formatCost(cents: number, estimate = false): string {
  if (cents <= 0) return '';
  return `≈ ${(cents / 100).toFixed(2).replace('.', ',')} €${estimate ? ' estimés' : ''}`;
}

/**
 * Ordre de rejeu : les erreurs dues d'abord, par coût décroissant (fiches de taille
 * à coût nul en fin de groupe) ; les cartes pas encore dues ensuite, par échéance.
 */
export function orderMistakes<T extends CostInput & Review>(list: T[], now: number): T[] {
  return [...list]
    .map((m) => ({ m, cost: mistakeCost(m), due: isDue(m, now) }))
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1; // dues d'abord
      if (b.cost !== a.cost) return b.cost - a.cost; // coût décroissant
      return a.m.dueAt - b.m.dueAt; // sinon, échéance la plus proche
    })
    .map((x) => x.m);
}
