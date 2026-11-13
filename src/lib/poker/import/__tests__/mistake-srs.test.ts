import { describe, expect, it } from 'vitest';
import { SRS_INTERVALS_DAYS } from '../../srs';
import {
  formatCost,
  isDue,
  mistakeCost,
  newReview,
  orderMistakes,
  scheduleReview,
  type Review,
} from '../mistake-srs';
import type { MistakeType } from '../classify-mistake';

const DAY = 24 * 60 * 60 * 1000;

type M = {
  type: MistakeType;
  equity?: number;
  required?: number;
  spot: {
    potBefore: number;
    toCall: number;
    heroStreetInvested?: number;
    heroAction?: { type: string; amount?: number; toAmount?: number };
    effectiveBB?: number;
    bb?: number;
  };
} & Review;

const mk = (over: Partial<M> & { type: MistakeType }): M => ({
  equity: undefined,
  required: undefined,
  spot: { potBefore: 0, toCall: 0 },
  ...newReview(0),
  ...over,
});

describe('mistakeCost', () => {
  it('call sans cote : (requis − équité) × pot final, en centimes', () => {
    // pot final = 100 + 20 = 120 ; (0.30 − 0.18) × 120 = 14.4 cents
    const c = mistakeCost(mk({ type: 'call-sans-cote', equity: 0.18, required: 0.3, spot: { potBefore: 100, toCall: 20 } }));
    expect(c).toBeCloseTo(14.4);
  });

  it('fold avec la cote : (équité − requis) × pot final', () => {
    const c = mistakeCost(mk({ type: 'fold-avec-cote', equity: 0.4, required: 0.25, spot: { potBefore: 80, toCall: 20 } }));
    expect(c).toBeCloseTo((0.4 - 0.25) * 100);
  });

  it('erreurs de taille et déterministes : coût 0', () => {
    expect(mistakeCost(mk({ type: 'open-size', spot: { potBefore: 50, toCall: 10 } }))).toBe(0);
    expect(mistakeCost(mk({ type: 'small-3bet' }))).toBe(0);
    expect(mistakeCost(mk({ type: 'open-limp' }))).toBe(0);
    expect(mistakeCost(mk({ type: '4bet-call' }))).toBe(0);
  });

  it('jamais négatif', () => {
    // équité au-dessus du requis : pas d'erreur de coût, plancher à 0
    expect(mistakeCost(mk({ type: 'call-sans-cote', equity: 0.5, required: 0.3, spot: { potBefore: 100, toCall: 20 } }))).toBe(0);
  });

  it('jam (bet dans un check) : pot final = potBefore + tapis + call adverse', () => {
    // bet 60 dans un pot de 100, pas de mise à suivre → pot final 100 + 60 + 60 = 220
    // (0.40 − 0.25) × 220 = 33 cents
    const c = mistakeCost(
      mk({
        type: 'jam-main-moyenne',
        equity: 0.25,
        spot: { potBefore: 100, toCall: 0, heroStreetInvested: 0, heroAction: { type: 'bet', amount: 60 } },
      }),
    );
    expect(c).toBeCloseTo(33);
  });

  it('jam (sur-relance d’une mise) : potBefore inclut la mise adverse, call = tapis − toCall', () => {
    // pot 40 + sa mise 20 = potBefore 60 (la mise de 20 est bien dedans), toCall 20.
    // je tapis à 100 → mon tapis = 100, son call = 100 − 20 = 80.
    // pot final = 60 + 100 + 80 = 240 ; (0.40 − 0.30) × 240 = 24 cents
    const c = mistakeCost(
      mk({
        type: 'jam-main-moyenne',
        equity: 0.3,
        spot: { potBefore: 60, toCall: 20, heroStreetInvested: 0, heroAction: { type: 'raise', toAmount: 100 } },
      }),
    );
    expect(c).toBeCloseTo(24);
  });

  it('jam : mon tapis est plafonné au tapis effectif (le plus petit des deux)', () => {
    // Je fais tapis pour 1,80 € (180) contre un joueur à 0,40 € (effectif 40).
    // Le call adverse et le pot final se basent sur 40, pas 180.
    // pot final = potBefore 20 + 40 (mon tapis plafonné) + 40 (son call) = 100.
    // (0.40 − 0.25) × 100 = 15 cents. Sans plafond : 20 + 180 + 180 = 380 → 57 cents.
    const c = mistakeCost(
      mk({
        type: 'jam-main-moyenne',
        equity: 0.25,
        spot: {
          potBefore: 20,
          toCall: 0,
          heroStreetInvested: 0,
          heroAction: { type: 'bet', amount: 180 },
          effectiveBB: 20,
          bb: 2, // 20 × 2 = 40 cents de tapis effectif
        },
      }),
    );
    expect(c).toBeCloseTo(15);
  });

  it('formatCost : mention « estimés » pour un jam', () => {
    expect(formatCost(33, true)).toBe('≈ 0,33 € estimés');
    expect(formatCost(33, false)).toBe('≈ 0,33 €');
    expect(formatCost(0, true)).toBe('');
  });
});

describe('scheduleReview (Leitner)', () => {
  it('réussi → boîte suivante, échéance repoussée', () => {
    const r = scheduleReview(newReview(0), true, 0);
    expect(r.box).toBe(2);
    expect(r.dueAt).toBe(SRS_INTERVALS_DAYS[1] * DAY);
    expect(r.reps).toBe(1);
    expect(r.lapses).toBe(0);
  });

  it('raté → retour boîte 1, dû immédiatement (revient plus tôt)', () => {
    const advanced: Review = { box: 4, dueAt: 100 * DAY, reps: 5, lapses: 0 };
    const r = scheduleReview(advanced, false, 50 * DAY);
    expect(r.box).toBe(1);
    expect(r.dueAt).toBe(50 * DAY); // boîte 1 = 0 jour → dû tout de suite
    expect(r.lapses).toBe(1);
    expect(isDue(r, 50 * DAY)).toBe(true);
  });
});

describe('orderMistakes', () => {
  it('dû en premier, trié par coût décroissant, fiches de taille à la fin', () => {
    const now = 10 * DAY;
    const cheap = mk({ type: 'call-sans-cote', equity: 0.2, required: 0.28, spot: { potBefore: 50, toCall: 10 } });
    const pricey = mk({ type: 'call-sans-cote', equity: 0.1, required: 0.35, spot: { potBefore: 300, toCall: 100 } });
    const sizing = mk({ type: 'open-size' });
    const future: M = { ...mk({ type: 'fold-avec-cote', equity: 0.5, required: 0.3, spot: { potBefore: 200, toCall: 50 } }), box: 3, dueAt: 100 * DAY, reps: 2, lapses: 0 };
    const ordered = orderMistakes([sizing, cheap, future, pricey], now);
    expect(ordered.map((m) => m.type)).toEqual([
      'call-sans-cote', // pricey (coût le plus élevé, dû)
      'call-sans-cote', // cheap (dû)
      'open-size', // fiche de taille (coût 0, dû) → après les erreurs chiffrées
      'fold-avec-cote', // pas encore dû → tout à la fin
    ]);
    expect(ordered[0]).toBe(pricey);
  });
});
