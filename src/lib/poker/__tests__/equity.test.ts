import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards';
import { calcEquity } from '../equity';
import { combosForClasses, expandNotation } from '../ranges';

describe('calcEquity (Monte-Carlo)', () => {
  it('AA contre KK préflop ≈ 82 %', () => {
    const hero: ['As', 'Ac'] = ['As', 'Ac'];
    const villainCombos = combosForClasses(expandNotation(['KK']), hero);
    const { equity } = calcEquity({
      hero,
      board: [],
      villainCombos,
      iterations: 5000,
      rng: mulberry32(1),
    });
    expect(equity).toBeGreaterThan(0.79);
    expect(equity).toBeLessThan(0.85);
  });

  it('tirage couleur au flop contre un overpair ≈ 35 % sur deux cartes', () => {
    const { equity } = calcEquity({
      hero: ['6h', '5h'],
      board: ['Ah', '9h', '2c'],
      villainCombos: [['Kc', 'Kd']],
      iterations: 5000,
      rng: mulberry32(2),
    });
    expect(equity).toBeGreaterThan(0.3);
    expect(equity).toBeLessThan(0.41);
  });

  it('AA contre une main aléatoire ≈ 85 %', () => {
    const { equity } = calcEquity({
      hero: ['Ah', 'Ad'],
      board: [],
      villainCombos: null,
      iterations: 5000,
      rng: mulberry32(3),
    });
    expect(equity).toBeGreaterThan(0.81);
    expect(equity).toBeLessThan(0.89);
  });

  it('est déterministe à graine fixée', () => {
    const run = () =>
      calcEquity({
        hero: ['Qs', 'Js'],
        board: ['Ts', '4d', '2c'],
        villainCombos: null,
        iterations: 1000,
        rng: mulberry32(42),
      });
    expect(run()).toEqual(run());
  });

  it('écarte les combos en conflit avec les cartes mortes', () => {
    // Tous les combos KK contiennent Kc ou Kd morts sauf KhKs.
    const { equity, iterations } = calcEquity({
      hero: ['Kc', 'Kd'],
      board: [],
      villainCombos: combosForClasses(expandNotation(['KK'])),
      iterations: 500,
      rng: mulberry32(4),
    });
    expect(iterations).toBe(500);
    // KK contre KK restant : quasi que des partages.
    expect(equity).toBeGreaterThan(0.4);
    expect(equity).toBeLessThan(0.6);
  });
});
