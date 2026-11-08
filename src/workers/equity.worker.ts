import { mulberry32, type Card } from '@/lib/poker/cards';
import { calcEquity } from '@/lib/poker/equity';
import { findOuts } from '@/lib/poker/outs';

export type EquityWorkerRequest = {
  id: number;
  hero: [Card, Card];
  board: Card[];
  /** Combos de la range estimée ; null = main aléatoire. */
  villainCombos: [Card, Card][] | null;
  iterations: number;
};

export type EquityWorkerResponse = {
  id: number;
  equity: number;
  win: number;
  tie: number;
  iterations: number;
  outs: Card[];
  aheadNow: boolean;
};

/** Calcule équité + outs hors du thread UI : la table ne doit jamais ramer. */
export function compute(request: EquityWorkerRequest): EquityWorkerResponse {
  const { id, hero, board, villainCombos, iterations } = request;
  const equity = calcEquity({ hero, board, villainCombos, iterations });
  // RNG dérivé du spot : l'échantillonnage de la range est le même à chaque
  // recalcul du même spot (notation d'examen et reclassement cohérents).
  const seed = [...hero, ...board].join('').split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
  const outs =
    board.length === 3 || board.length === 4
      ? findOuts({ hero, board, villainCombos, rng: mulberry32(seed) })
      : { outs: [], aheadNow: false, aheadShare: 0 };
  return {
    id,
    equity: equity.equity,
    win: equity.win,
    tie: equity.tie,
    iterations: equity.iterations,
    outs: outs.outs,
    aheadNow: outs.aheadNow,
  };
}

// Dans un worker, window n'existe pas ; ce module peut aussi être importé
// sur le thread principal en repli, sans écraser window.onmessage.
if (typeof window === 'undefined') {
  self.onmessage = (event: MessageEvent<EquityWorkerRequest>) => {
    self.postMessage(compute(event.data));
  };
}
