import { describe, expect, it } from 'vitest';
import { bluffFoldEquity, formulasFromBet, mdf, requiredEquityToCall } from '../formulas';

// b = taille de la mise en fraction du pot. Trois nombres en découlent :
//   équité requise pour payer = b / (1 + 2b)
//   fold-équité requise d'un bluff pur = b / (1 + b)
//   MDF (fréquence de défense minimale) = 1 / (1 + b)
// Identité : MDF + fold-équité requise = 1 (ce que tu défends + ce que tu couches).

describe('formulas — tout découle de b', () => {
  it('équité requise pour payer b/(1+2b)', () => {
    expect(requiredEquityToCall(0.5)).toBeCloseTo(0.25); // ½ pot → 25 %
    expect(requiredEquityToCall(1)).toBeCloseTo(1 / 3); // pot → 33 %
    expect(requiredEquityToCall(1 / 3)).toBeCloseTo(0.2); // ⅓ pot → 20 %
  });

  it('fold-équité requise d’un bluff b/(1+b)', () => {
    expect(bluffFoldEquity(1)).toBeCloseTo(0.5); // mise pot → il doit coucher 50 %
    expect(bluffFoldEquity(0.5)).toBeCloseTo(1 / 3); // ½ pot → 33 %
    expect(bluffFoldEquity(2)).toBeCloseTo(2 / 3); // 2× pot → 67 %
  });

  it('MDF 1/(1+b)', () => {
    expect(mdf(1)).toBeCloseTo(0.5); // mise pot → défends 50 %
    expect(mdf(0.5)).toBeCloseTo(2 / 3); // ½ pot → défends 67 %
    expect(mdf(2)).toBeCloseTo(1 / 3); // 2× pot → défends 33 %
  });

  it('identité : MDF + fold-équité requise = 1', () => {
    for (const b of [1 / 4, 1 / 3, 1 / 2, 2 / 3, 1, 1.5, 2]) {
      expect(mdf(b) + bluffFoldEquity(b)).toBeCloseTo(1);
    }
  });

  it('formulasFromBet regroupe les trois', () => {
    const f = formulasFromBet(1);
    expect(f.requiredToCall).toBeCloseTo(1 / 3);
    expect(f.bluffFoldEquity).toBeCloseTo(0.5);
    expect(f.mdf).toBeCloseTo(0.5);
  });
});
