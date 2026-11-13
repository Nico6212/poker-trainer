import { describe, expect, it } from 'vitest';
import type { StoredMistake } from '../db';
import { mistakeQuestion } from '../mistake-drill';

const base: Omit<StoredMistake, 'type'> = {
  id: 'x',
  handId: 'h1',
  detail: 'détail',
  spot: {} as never,
  createdAt: 0,
  box: 1,
  dueAt: 0,
  reps: 0,
  lapses: 0,
};

describe('mistakeQuestion', () => {
  it('call sans cote → la bonne action est de se coucher', () => {
    const q = mistakeQuestion({ ...base, type: 'call-sans-cote', equity: 0.18, required: 0.3 });
    expect(q.decision).toBe(true);
    expect(q.options).toEqual(['Payer', 'Se coucher']);
    expect(q.correct).toBe('Se coucher');
    expect(q.played).toBe('Payer');
    expect(q.explain).toContain('18 %');
    expect(q.explain).toContain('30 %');
    // Les chiffres ne doivent apparaître qu'une fois (pas de duplication explain+detail).
    expect(q.explain.split('18 %').length - 1).toBe(1);
    expect(q.explain.split('30 %').length - 1).toBe(1);
  });

  it('équité 0 % → explication explicite (ne bat aucune main de value)', () => {
    const q = mistakeQuestion({ ...base, type: 'call-sans-cote', equity: 0, required: 0.24 });
    expect(q.explain).toContain('0 %');
    expect(q.explain).toContain('aucune main');
    expect(q.explain.split('0 %').length - 1).toBe(1);
  });

  it('affiche la ligne river retenue si présente', () => {
    const q = mistakeQuestion({
      ...base,
      type: 'call-sans-cote',
      equity: 0.1,
      required: 0.3,
      villainRange: 'Contre un durcissement au turn + mise river : deux paires, brelans.',
    });
    expect(q.explain).toContain('durcissement au turn');
  });

  it('fold avec cote → la bonne action est de payer', () => {
    const q = mistakeQuestion({ ...base, type: 'fold-avec-cote', equity: 0.4, required: 0.25 });
    expect(q.correct).toBe('Payer');
    expect(q.played).toBe('Se coucher');
  });

  it('jam main moyenne → contrôler', () => {
    const q = mistakeQuestion({ ...base, type: 'jam-main-moyenne', equity: 0.33 });
    expect(q.correct).toBe('Checker / contrôler');
    expect(q.played).toBe('Tapis');
  });

  it('open-limp → ouvrir', () => {
    const q = mistakeQuestion({ ...base, type: 'open-limp' });
    expect(q.correct).toBe('Ouvrir (relancer)');
    expect(q.played).toBe('Limper');
  });

  it('erreurs de taille → fiche de revue (non notée)', () => {
    expect(mistakeQuestion({ ...base, type: 'open-size' }).decision).toBe(false);
    expect(mistakeQuestion({ ...base, type: 'small-3bet' }).decision).toBe(false);
  });
});
