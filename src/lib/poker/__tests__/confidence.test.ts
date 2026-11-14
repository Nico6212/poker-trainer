import { describe, expect, it } from 'vitest';
import { handsForMargin, normalCdf, winrateCI } from '../confidence';

describe('normalCdf', () => {
  it('Φ(0) = 0,5 ; symétrie ; queue', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-2.98)).toBeCloseTo(0.0014, 4);
  });
});

describe('handsForMargin', () => {
  it('±10 BB/100 à σ 90 ≈ 31 117 mains', () => {
    expect(handsForMargin(10, 90)).toBe(31117);
  });
});

describe('winrateCI', () => {
  it('exemple : 3000 mains, −49, σ 90 → ≈ [−81 ; −17], P(gagnant) < 1 %', () => {
    const ci = winrateCI(2, 3000, -49, -37, 90);
    expect(ci.tooSmall).toBe(false);
    expect(ci.marginBB100).toBeCloseTo(32.2, 1);
    expect(ci.lowBB100).toBeCloseTo(-81.2, 1);
    expect(ci.highBB100).toBeCloseTo(-16.8, 1);
    expect(ci.probWinning).not.toBeNull();
    expect(ci.probWinning!).toBeLessThan(0.01);
  });

  it('sous 1000 mains : échantillon trop petit (bornes/proba null)', () => {
    const ci = winrateCI(2, 800, -30, -20, 90);
    expect(ci.tooSmall).toBe(true);
    expect(ci.marginBB100).toBeNull();
    expect(ci.lowBB100).toBeNull();
    expect(ci.probWinning).toBeNull();
    expect(ci.handsForMargin10).toBe(31117); // toujours affiché
  });
});
