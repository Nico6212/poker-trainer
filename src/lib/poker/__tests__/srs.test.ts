import { describe, expect, it } from 'vitest';
import {
  SRS_INTERVALS_DAYS,
  addCard,
  cardFromDecision,
  dueCards,
  scheduleNext,
  type SrsCard,
} from '../srs';
import type { DecisionRecord } from '../session';

const NOW = new Date('2026-11-06T10:00:00.000Z');

const decision: DecisionRecord = {
  id: '12:4',
  handId: 12,
  street: 'flop',
  equity: 0.2,
  required: 0.29,
  callAmount: 20,
  potTotal: 48,
  action: 'call',
  isError: true,
  errorKind: 'call-sans-cote',
  exam: null,
  spot: {
    heroCards: ['6h', '5h'],
    board: ['Ah', '9h', '2c'],
    villainSeat: 1,
    rangeLabel: 'open BTN',
    rangeClasses: ['AA', 'AKs'],
  },
};

describe('cardFromDecision', () => {
  it('transforme une erreur en carte, bonne action dérivée de équité vs requis', () => {
    const card = cardFromDecision(decision, NOW)!;
    expect(card.id).toBe('12:4');
    expect(card.correctAction).toBe('fold'); // 20 % < 29 % requis
    expect(card.box).toBe(1);
    expect(new Date(card.dueAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('ignore les décisions correctes ou sans équité', () => {
    expect(cardFromDecision({ ...decision, isError: false, errorKind: null }, NOW)).toBeNull();
    expect(cardFromDecision({ ...decision, equity: null }, NOW)).toBeNull();
  });

  it('zone morte : pas de carte pour un call quasi break-even (bruit Monte-Carlo)', () => {
    // required 0.29 − equity 0.27 = 2 pts ≤ SRS_CALL_MARGIN → pas de carte.
    expect(cardFromDecision({ ...decision, equity: 0.27 }, NOW)).toBeNull();
    // 9 pts d'écart → carte créée.
    expect(cardFromDecision({ ...decision, equity: 0.2 }, NOW)).not.toBeNull();
  });

  it('exclut les spots multiway (équité mono-range non fiable) et copie la nuance', () => {
    const multiway = {
      ...decision,
      spot: { ...decision.spot!, activeOpponents: 2 },
    };
    expect(cardFromDecision(multiway, NOW)).toBeNull();

    const withNuance = cardFromDecision(
      { ...decision, outsCount: 9, villainHadChips: true },
      NOW,
    )!;
    expect(withNuance.outsCount).toBe(9);
    expect(withNuance.villainHadChips).toBe(true);
  });
});

describe('scheduleNext', () => {
  const card = cardFromDecision(decision, NOW)!;

  it('réussite : boîte suivante, échéance plus lointaine', () => {
    const after = scheduleNext(card, true, NOW);
    expect(after.box).toBe(2);
    expect(after.reps).toBe(1);
    const dueInDays = (new Date(after.dueAt).getTime() - NOW.getTime()) / 86_400_000;
    expect(dueInDays).toBeCloseTo(SRS_INTERVALS_DAYS[1]);
  });

  it('échec : retour en boîte 1', () => {
    const promoted = scheduleNext(scheduleNext(card, true, NOW), true, NOW);
    expect(promoted.box).toBe(3);
    const failed = scheduleNext(promoted, false, NOW);
    expect(failed.box).toBe(1);
    expect(failed.lapses).toBe(1);
  });

  it('plafonne à la dernière boîte', () => {
    let c = card;
    for (let i = 0; i < 10; i++) c = scheduleNext(c, true, NOW);
    expect(c.box).toBe(SRS_INTERVALS_DAYS.length);
  });
});

describe('dueCards et addCard', () => {
  it('ne retourne que les cartes échues, triées', () => {
    const card = cardFromDecision(decision, NOW)!;
    const future: SrsCard = { ...card, id: 'x', dueAt: '2026-12-01T00:00:00.000Z' };
    const past: SrsCard = { ...card, id: 'y', dueAt: '2026-11-01T00:00:00.000Z' };
    expect(dueCards([future, card, past], NOW).map((c) => c.id)).toEqual(['y', '12:4']);
  });

  it('dédoublonne par id', () => {
    const card = cardFromDecision(decision, NOW)!;
    expect(addCard(addCard([], card), card)).toHaveLength(1);
  });
});
