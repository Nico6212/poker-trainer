// Historique de progression par jour (examen + drill), en localStorage.
// Les fonctions pures prennent `now` en paramètre pour être testables.

export type DayProgress = {
  /** AAAA-MM-JJ. */
  date: string;
  examAsked: number;
  examCorrect: number;
  drillAttempts: number;
  drillCorrect: number;
};

export type ProgressDelta = Partial<Omit<DayProgress, 'date'>>;

const KEY = 'poker-progress-v1';
const MAX_DAYS = 120;

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Ajoute un delta dans le seau du jour (crée la journée si besoin). Fonction pure. */
export function recordInto(data: DayProgress[], delta: ProgressDelta, now: Date): DayProgress[] {
  const date = dayKey(now);
  const existing = data.find((d) => d.date === date);
  const base = existing ?? {
    date,
    examAsked: 0,
    examCorrect: 0,
    drillAttempts: 0,
    drillCorrect: 0,
  };
  const updated: DayProgress = {
    ...base,
    examAsked: base.examAsked + (delta.examAsked ?? 0),
    examCorrect: base.examCorrect + (delta.examCorrect ?? 0),
    drillAttempts: base.drillAttempts + (delta.drillAttempts ?? 0),
    drillCorrect: base.drillCorrect + (delta.drillCorrect ?? 0),
  };
  const others = data.filter((d) => d.date !== date);
  return [...others, updated].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
}

function withinWindow(data: DayProgress[], days: number, now: Date): DayProgress[] {
  const cutoff = new Date(now.getTime() - (days - 1) * 86_400_000);
  const cutoffKey = dayKey(cutoff);
  const todayKey = dayKey(now);
  return data.filter((d) => d.date >= cutoffKey && d.date <= todayKey);
}

export type ProgressWindow = {
  examRate: number | null;
  examCount: number;
  drillRate: number | null;
  drillCount: number;
};

/** Taux de réussite examen et drill sur les N derniers jours. */
export function summarizeProgress(data: DayProgress[], days: number, now: Date): ProgressWindow {
  const window = withinWindow(data, days, now);
  const examAsked = window.reduce((s, d) => s + d.examAsked, 0);
  const examCorrect = window.reduce((s, d) => s + d.examCorrect, 0);
  const drillAttempts = window.reduce((s, d) => s + d.drillAttempts, 0);
  const drillCorrect = window.reduce((s, d) => s + d.drillCorrect, 0);
  return {
    examRate: examAsked > 0 ? examCorrect / examAsked : null,
    examCount: examAsked,
    drillRate: drillAttempts > 0 ? drillCorrect / drillAttempts : null,
    drillCount: drillAttempts,
  };
}

export type DayPoint = {
  date: string;
  examRate: number | null;
  examCount: number;
  drillRate: number | null;
  drillCount: number;
};

/** Un point par jour sur la fenêtre (du plus ancien au plus récent), pour les courbes. */
export function dailySeries(data: DayProgress[], days: number, now: Date): DayPoint[] {
  const byDate = new Map(data.map((d) => [d.date, d]));
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(now.getTime() - i * 86_400_000));
    const d = byDate.get(date);
    points.push({
      date,
      examRate: d && d.examAsked > 0 ? d.examCorrect / d.examAsked : null,
      examCount: d?.examAsked ?? 0,
      drillRate: d && d.drillAttempts > 0 ? d.drillCorrect / d.drillAttempts : null,
      drillCount: d?.drillAttempts ?? 0,
    });
  }
  return points;
}

// --- Persistance ---

export function loadProgress(): DayProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DayProgress[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // corrompu : on repart à vide
  }
  return [];
}

/** Enregistre un delta dans le seau du jour et persiste. Retourne les données à jour. */
export function recordProgress(delta: ProgressDelta, now = new Date()): DayProgress[] {
  const next = recordInto(loadProgress(), delta, now);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // quota plein
    }
  }
  return next;
}
