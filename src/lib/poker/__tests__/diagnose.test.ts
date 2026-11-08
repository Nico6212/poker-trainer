import { describe, expect, it } from 'vitest';
import { diagnoseEquity, diagnoseRequired } from '../diagnose';

describe('diagnoseRequired', () => {
  // Pot 40 + sa mise 20 = 60 au milieu, call 20 → requis 25 %.
  const spot = { callAmount: 20, potTotal: 60, villainBet: 20 };

  it('reconnaît la division par le pot sans le call (33 % au lieu de 25 %)', () => {
    const msg = diagnoseRequired(0.33, spot);
    expect(msg).toContain('SANS ton call');
  });

  it('reconnaît « sa mise ÷ pot » (50 % au lieu de 25 %)', () => {
    const msg = diagnoseRequired(0.5, spot);
    expect(msg).toContain('SA mise');
  });

  it('ne diagnostique rien pour une simple imprécision', () => {
    expect(diagnoseRequired(0.21, spot)).toBeNull();
    expect(diagnoseRequired(0.25, spot)).toBeNull();
  });
});

describe('diagnoseEquity', () => {
  it('reconnaît le ×2 au lieu du ×4 (18 % au lieu de 36 %)', () => {
    const msg = diagnoseEquity(0.18, { outsCount: 9, cardsToCome: 2, actual: 0.36 });
    expect(msg).toContain('UNE carte');
  });

  it('reconnaît le ×4 au lieu du ×2 (36 % au lieu de 18 %)', () => {
    const msg = diagnoseEquity(0.36, { outsCount: 9, cardsToCome: 1, actual: 0.19 });
    expect(msg).toContain('turn ET river');
  });

  it('rien sans outs ou pour une imprécision quelconque', () => {
    expect(diagnoseEquity(0.3, { outsCount: 0, cardsToCome: 2, actual: 0.4 })).toBeNull();
    expect(diagnoseEquity(0.3, { outsCount: 9, cardsToCome: 2, actual: 0.36 })).toBeNull();
  });
});
