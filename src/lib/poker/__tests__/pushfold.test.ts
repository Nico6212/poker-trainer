import { describe, expect, it } from 'vitest';
import type { Card } from '../cards';
import { applyAction, createHand } from '../engine';
import { combosForClasses, expandNotation } from '../ranges';
import {
  PUSH_BUCKETS,
  PUSH_RANGES,
  CALL_RANGES_VS_PUSH,
  bucketFor,
  pushFoldSpot,
  shouldCallPush,
  shouldPush,
} from '../pushfold';

describe('bucketFor', () => {
  it('choisit le palier supérieur ou égal, null au-delà de 13 BB', () => {
    expect(bucketFor(3)).toBe(5);
    expect(bucketFor(5.4)).toBe(5);
    expect(bucketFor(6)).toBe(8);
    expect(bucketFor(10.2)).toBe(10);
    expect(bucketFor(13.4)).toBe(13);
    expect(bucketFor(14)).toBeNull();
  });
});

describe('cohérence des tableaux', () => {
  it('AA se push et se paie partout', () => {
    for (const bucket of PUSH_BUCKETS) {
      expect(shouldPush('AA', 'SB_HU', bucket)).toBe(true);
      expect(shouldPush('AA', 'BTN_3MAX', bucket)).toBe(true);
      expect(shouldCallPush('AA', 'BB_VS_SB', bucket)).toBe(true);
      expect(shouldCallPush('AA', 'SB_VS_BTN', bucket)).toBe(true);
    }
  });

  it('72o ne se push jamais à 13 BB et ne paie jamais un push', () => {
    expect(shouldPush('72o', 'SB_HU', 13)).toBe(false);
    expect(shouldPush('72o', 'BTN_3MAX', 13)).toBe(false);
    for (const bucket of PUSH_BUCKETS) {
      expect(shouldCallPush('72o', 'BB_VS_BTN', bucket)).toBe(false);
    }
  });

  it('les ranges rétrécissent quand le tapis grandit (monotonie en combos)', () => {
    const count = (notation: string[]) => combosForClasses(expandNotation(notation)).length;
    for (const chart of ['SB_HU', 'BTN_3MAX'] as const) {
      for (let i = 1; i < PUSH_BUCKETS.length; i++) {
        expect(count(PUSH_RANGES[chart][PUSH_BUCKETS[i]])).toBeLessThan(
          count(PUSH_RANGES[chart][PUSH_BUCKETS[i - 1]]),
        );
      }
    }
    for (const chart of ['BB_VS_SB', 'BB_VS_BTN', 'SB_VS_BTN'] as const) {
      for (let i = 1; i < PUSH_BUCKETS.length; i++) {
        expect(count(CALL_RANGES_VS_PUSH[chart][PUSH_BUCKETS[i]])).toBeLessThanOrEqual(
          count(CALL_RANGES_VS_PUSH[chart][PUSH_BUCKETS[i - 1]]),
        );
      }
    }
  });

  it('le call est plus serré que le push correspondant', () => {
    const count = (notation: string[]) => combosForClasses(expandNotation(notation)).length;
    for (const bucket of PUSH_BUCKETS) {
      expect(count(CALL_RANGES_VS_PUSH.BB_VS_SB[bucket])).toBeLessThan(
        count(PUSH_RANGES.SB_HU[bucket]),
      );
    }
  });
});

describe('pushFoldSpot', () => {
  const BLINDS = { sb: 10, bb: 20 };
  const BOARD: Card[] = ['2c', '7d', '9s', '4c', 'Jh'];

  // Heads-up : siège 1 au bouton (SB), siège 0 en BB. Distribution : BB d'abord.
  const huShort = (sbCards: [Card, Card], bbCards: [Card, Card], sbStack = 160, bbStack = 400) =>
    createHand({
      handId: 1,
      seats: [
        { id: 'bb', name: 'BB', seat: 0, stack: bbStack },
        { id: 'sb', name: 'SB', seat: 1, stack: sbStack },
      ],
      buttonSeat: 1,
      blinds: BLINDS,
      deck: [...bbCards, ...sbCards, ...BOARD],
    });

  it('SB heads-up à 8 BB avec A2o : push', () => {
    const state = huShort(['Ah', '2c'], ['Kh', 'Kd']);
    const spot = pushFoldSpot(state, 1)!;
    expect(spot.kind).toBe('open-shove');
    if (spot.kind === 'open-shove') {
      expect(spot.chart).toBe('SB_HU');
      expect(spot.shove).toBe(true);
      expect(spot.stackBB).toBeCloseTo(8);
    }
  });

  it('SB heads-up à 13 BB avec J4o : fold', () => {
    const state = huShort(['Jh', '4c'], ['Kh', 'Kd'], 260);
    const spot = pushFoldSpot(state, 1)!;
    expect(spot.kind === 'open-shove' && spot.shove).toBe(false);
  });

  it('BB face au push du SB : K3o se couche, ATo paie (8 BB effectives)', () => {
    const fold = applyAction(huShort(['Ah', '2c'], ['Kh', '3c']), {
      type: 'raise',
      amount: 160,
    });
    const foldSpot = pushFoldSpot(fold, 0)!;
    expect(foldSpot.kind).toBe('call-shove');
    if (foldSpot.kind === 'call-shove') {
      expect(foldSpot.chart).toBe('BB_VS_SB');
      expect(foldSpot.call).toBe(false);
    }

    const call = applyAction(huShort(['Ah', '2c'], ['Ad', 'Tc']), {
      type: 'raise',
      amount: 160,
    });
    const callSpot = pushFoldSpot(call, 0)!;
    expect(callSpot.kind === 'call-shove' && callSpot.call).toBe(true);
  });

  it('hors périmètre : tapis profond ou pot limpé', () => {
    expect(pushFoldSpot(huShort(['Ah', '2c'], ['Kh', 'Kd'], 1000), 1)).toBeNull();
    const limped = applyAction(huShort(['Ah', '2c'], ['Kh', 'Kd']), { type: 'call' });
    expect(pushFoldSpot(limped, 0)).toBeNull();
  });
});
