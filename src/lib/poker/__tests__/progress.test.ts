import { describe, expect, it } from 'vitest';
import {
  dailySeries,
  recordInto,
  summarizeProgress,
  type DayProgress,
} from '../progress';

const day = (date: string, p: Partial<DayProgress>): DayProgress => ({
  date,
  examAsked: 0,
  examCorrect: 0,
  drillAttempts: 0,
  drillCorrect: 0,
  ...p,
});

describe('recordInto — cumule dans le seau du jour', () => {
  it('crée puis incrémente la journée', () => {
    let data: DayProgress[] = [];
    data = recordInto(data, { examAsked: 2, examCorrect: 1 }, new Date('2026-11-10T09:00:00Z'));
    data = recordInto(data, { drillAttempts: 1, drillCorrect: 1 }, new Date('2026-11-10T21:00:00Z'));
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      date: '2026-11-10',
      examAsked: 2,
      examCorrect: 1,
      drillAttempts: 1,
      drillCorrect: 1,
    });
  });
});

describe('summarizeProgress — fenêtres 7 et 30 jours', () => {
  const now = new Date('2026-11-30T12:00:00Z');
  const data: DayProgress[] = [
    day('2026-11-28', { examAsked: 4, examCorrect: 3, drillAttempts: 10, drillCorrect: 8 }), // dans 7 j
    day('2026-11-20', { examAsked: 6, examCorrect: 3, drillAttempts: 10, drillCorrect: 5 }), // dans 30 j
    day('2026-10-01', { examAsked: 100, examCorrect: 0, drillAttempts: 100, drillCorrect: 0 }), // hors 30 j
  ];

  it('7 jours : ne prend que la journée récente', () => {
    const w = summarizeProgress(data, 7, now);
    expect(w.examRate).toBeCloseTo(3 / 4);
    expect(w.drillRate).toBeCloseTo(0.8);
  });

  it('30 jours : agrège les deux journées dans la fenêtre, ignore la vieille', () => {
    const w = summarizeProgress(data, 30, now);
    expect(w.examRate).toBeCloseTo((3 + 3) / (4 + 6));
    expect(w.drillRate).toBeCloseTo((8 + 5) / (10 + 10));
  });

  it('aucune donnée dans la fenêtre → null', () => {
    expect(summarizeProgress([], 7, now).examRate).toBeNull();
  });
});

describe('dailySeries', () => {
  it('retourne un point par jour de la fenêtre, le plus récent en dernier', () => {
    const now = new Date('2026-11-30T12:00:00Z');
    const data = [day('2026-11-30', { drillAttempts: 2, drillCorrect: 2 })];
    const series = dailySeries(data, 7, now);
    expect(series).toHaveLength(7);
    expect(series[6].date).toBe('2026-11-30');
    expect(series[6].drillRate).toBeCloseTo(1);
    expect(series[6].drillCount).toBe(2);
    expect(series[0].drillRate).toBeNull(); // journée vide
    expect(series[0].drillCount).toBe(0);
  });
});
