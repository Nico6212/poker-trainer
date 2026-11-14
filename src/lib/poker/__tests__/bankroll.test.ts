import { describe, expect, it } from 'vitest';
import { bankrollByLimit, cavesFor, recommendedMaxStake } from '../bankroll';

describe('cavesFor', () => {
  it('19 € en NL2 → 9,5 caves', () => {
    expect(cavesFor(1900, 2)).toBeCloseTo(9.5);
  });
  it('0,40 € en NL2 → 0,2 cave', () => {
    expect(cavesFor(40, 2)).toBeCloseTo(0.2);
  });
});

describe('bankrollByLimit', () => {
  it('alerte sous 20 caves', () => {
    const [nl2] = bankrollByLimit(1900, [2]);
    expect(nl2.caves).toBeCloseTo(9.5);
    expect(nl2.underMin).toBe(true);
  });
});

describe('recommendedMaxStake', () => {
  it('19 € : aucune limite à 30 caves, il faut 60 € pour NL2', () => {
    const r = recommendedMaxStake(1900);
    expect(r.bb).toBeNull();
    expect(r.neededCentsForNL2).toBe(6000);
  });
  it('70 € : NL2 OK (30 caves = 60 €), pas NL5', () => {
    expect(recommendedMaxStake(7000).bb).toBe(2);
  });
});
