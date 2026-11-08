import type { Card } from './cards';
import type { ActionRecord, HandResult, Street } from './engine';

// Suivi de session : décisions face à une mise, mains jouées, stats.
// Persistance en localStorage (pas de base de données en v1).

export type ErrorKind = 'call-sans-cote' | 'fold-trop-serre';

/** Marge au-delà du prix à partir de laquelle un fold devient une erreur (10 points). */
export const FOLD_MARGIN = 0.1;

/** Tolérance du mode examen : ±5 points. */
export const EXAM_TOLERANCE = 0.05;

/** Écart relatif au conseil au-delà duquel une taille de mise est signalée. */
export const SIZE_WARNING_RATIO = 0.4;

export type ExamAnswer = {
  requiredGuess: number;
  equityGuess: number;
  requiredActual: number;
  equityActual: number;
  requiredOk: boolean;
  equityOk: boolean;
  /** Question outs (flop/turn uniquement). */
  outsGuess?: number | null;
  outsActual?: number | null;
  outsOk?: boolean | null;
  /** Confusion de méthode détectée (« tu as divisé par le pot sans ton call »…). */
  requiredDiagnosis?: string | null;
  equityDiagnosis?: string | null;
  elapsedMs?: number | null;
};

/** Photo de la situation au moment de la décision : sert au reclassement et au rejeu. */
export type DecisionSpot = {
  heroCards: [Card, Card];
  board: Card[];
  villainSeat: number;
  rangeLabel: string;
  /** Classes de la range estimée (sérialisées), null = main aléatoire. */
  rangeClasses: string[] | null;
  /** Adversaires non couchés au moment de la décision (absent = anciennes données). */
  activeOpponents?: number;
};

export type DecisionRecord = {
  /** `${handId}:${nb d'actions jouées}` — unique par point de décision. */
  id?: string;
  handId: number;
  street: Street;
  /** Équité contre la range estimée au moment de la décision (null si pas encore calculée). */
  equity: number | null;
  /** Équité minimale pour payer (cote du pot). 0 si pas face à une mise. */
  required: number;
  callAmount: number;
  potTotal: number;
  action: 'fold' | 'call' | 'raise' | 'bet';
  isError: boolean;
  errorKind: ErrorKind | null;
  exam: ExamAnswer | null;
  /** Temps de réflexion en millisecondes. */
  elapsedMs?: number | null;
  spot?: DecisionSpot | null;
  /** Nombre d'outs affichés au moment de la décision. */
  outsCount?: number | null;
  /** L'adversaire avait-il encore des jetons (cotes implicites possibles) ? */
  villainHadChips?: boolean;
  /** Le héros avait-il encore des jetons après son call (sinon : aucune cote implicite) ? */
  heroChipsBehind?: boolean;
  /** Taille jouée et taille conseillée pour les bets/raises. */
  sizeAmount?: number | null;
  sizeAdvised?: number | null;
  /** Taille très éloignée du conseil (avertissement, pas une erreur). */
  sizeWarning?: boolean;
};

export type HandPlayerSnapshot = {
  seat: number;
  name: string;
  holeCards: [Card, Card] | null;
  startStack: number;
};

export type HandRecord = {
  handId: number;
  heroSeat: number;
  buttonSeat: number;
  bb: number;
  players: HandPlayerSnapshot[];
  board: Card[];
  history: ActionRecord[];
  result: HandResult;
  /** Gain net du héros en centimes (gains − investi). */
  heroNet: number;
};

export type SessionData = {
  startedAt: string;
  decisions: DecisionRecord[];
  hands: HandRecord[];
};

export type SessionStats = {
  handsPlayed: number;
  netCents: number;
  netBB: number;
  /** % de mains où le héros a volontairement mis de l'argent préflop (blindes exclues). */
  vpip: number | null;
  /** % de mains où le héros a relancé préflop. */
  pfr: number | null;
  /** % de 3-bet sur les occasions (héros a parlé face à une relance préflop). */
  threeBet: number | null;
  /** Fréquence d'agression postflop : (bets + raises) ÷ (bets + raises + calls). */
  aggression: number | null;
  examAsked: number;
  examCorrect: number;
  errors: number;
  /** Tailles de mise signalées « hors norme ». */
  sizeWarnings: number;
  /** Temps de réflexion médian (ms) sur les décisions chronométrées. */
  medianDecisionMs: number | null;
  /** Marge moyenne (équité − requis) en POINTS sur les calls à équité connue : qualité du process. */
  avgCallMarginPts: number | null;
};

export function classifyDecision(
  action: 'fold' | 'call' | 'raise',
  equity: number | null,
  required: number,
): { isError: boolean; errorKind: ErrorKind | null } {
  if (equity === null) return { isError: false, errorKind: null };
  if (action === 'call' && equity < required) {
    return { isError: true, errorKind: 'call-sans-cote' };
  }
  if (action === 'fold' && equity > required + FOLD_MARGIN) {
    return { isError: true, errorKind: 'fold-trop-serre' };
  }
  return { isError: false, errorKind: null };
}

export function gradeExam(guess: number, actual: number, tolerance = EXAM_TOLERANCE): boolean {
  return Math.abs(guess - actual) <= tolerance + 1e-9;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeStats(data: SessionData): SessionStats {
  let netCents = 0;
  let netBB = 0;
  let vpipCount = 0;
  let pfrCount = 0;
  let threeBetCount = 0;
  let threeBetOpportunities = 0;
  let aggressive = 0;
  let passive = 0;

  for (const hand of data.hands) {
    netCents += hand.heroNet;
    netBB += hand.heroNet / hand.bb;

    let raisesBefore = 0;
    let vpip = false;
    let pfr = false;
    let hadThreeBetSpot = false;
    let didThreeBet = false;

    for (const entry of hand.history) {
      const isRaise = entry.action.type === 'raise' || entry.action.type === 'bet';
      if (entry.street === 'preflop') {
        if (entry.seat === hand.heroSeat) {
          if (raisesBefore >= 1) hadThreeBetSpot = true;
          if (entry.action.type === 'call') vpip = true;
          if (isRaise) {
            vpip = true;
            pfr = true;
            if (raisesBefore >= 1) didThreeBet = true;
          }
        }
        if (isRaise) raisesBefore++;
      } else if (entry.seat === hand.heroSeat) {
        if (isRaise) aggressive++;
        else if (entry.action.type === 'call') passive++;
      }
    }

    if (vpip) vpipCount++;
    if (pfr) pfrCount++;
    if (hadThreeBetSpot) threeBetOpportunities++;
    if (didThreeBet) threeBetCount++;
  }

  const handsPlayed = data.hands.length;
  let examAsked = 0;
  let examCorrect = 0;
  for (const decision of data.decisions) {
    if (decision.exam) {
      examAsked += 2;
      if (decision.exam.requiredOk) examCorrect++;
      if (decision.exam.equityOk) examCorrect++;
      if (decision.exam.outsOk !== null && decision.exam.outsOk !== undefined) {
        examAsked += 1;
        if (decision.exam.outsOk) examCorrect++;
      }
    }
  }

  const callMargins = data.decisions
    .filter((d) => d.action === 'call' && d.equity !== null && d.callAmount > 0)
    .map((d) => (d.equity! - d.required) * 100);
  const times = data.decisions
    .map((d) => d.elapsedMs)
    .filter((t): t is number => typeof t === 'number' && t > 0);

  return {
    handsPlayed,
    netCents,
    netBB,
    vpip: handsPlayed > 0 ? vpipCount / handsPlayed : null,
    pfr: handsPlayed > 0 ? pfrCount / handsPlayed : null,
    threeBet: threeBetOpportunities > 0 ? threeBetCount / threeBetOpportunities : null,
    aggression: aggressive + passive > 0 ? aggressive / (aggressive + passive) : null,
    examAsked,
    examCorrect,
    errors: data.decisions.filter((d) => d.isError).length,
    sizeWarnings: data.decisions.filter((d) => d.sizeWarning).length,
    medianDecisionMs: median(times),
    avgCallMarginPts:
      callMargins.length > 0
        ? callMargins.reduce((sum, m) => sum + m, 0) / callMargins.length
        : null,
  };
}

// --- Persistance localStorage ---

const STORAGE_KEY = 'poker-session-v1';
const HISTORY_KEY = 'poker-sessions-history-v1';
const MAX_HANDS = 200;
const MAX_DECISIONS = 500;
const MAX_ARCHIVES = 50;

export function freshSession(startedAt = new Date().toISOString()): SessionData {
  return { startedAt, decisions: [], hands: [] };
}

/** Garde de forme : une décision importée/corrompue ne doit jamais faire planter l'appli. */
function isValidDecision(value: unknown): value is DecisionRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.handId === 'number' &&
    typeof r.street === 'string' &&
    (r.equity === null || typeof r.equity === 'number') &&
    typeof r.required === 'number' &&
    typeof r.callAmount === 'number' &&
    typeof r.potTotal === 'number' &&
    (r.action === 'fold' || r.action === 'call' || r.action === 'raise' || r.action === 'bet') &&
    typeof r.isError === 'boolean'
  );
}

function isValidHand(value: unknown): value is HandRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.handId === 'number' &&
    typeof r.heroSeat === 'number' &&
    typeof r.bb === 'number' &&
    r.bb > 0 &&
    typeof r.heroNet === 'number' &&
    Array.isArray(r.players) &&
    Array.isArray(r.board) &&
    Array.isArray(r.history) &&
    !!r.result &&
    typeof r.result === 'object' &&
    Array.isArray((r.result as HandResult).winners)
  );
}

export function loadSession(): SessionData {
  if (typeof window === 'undefined') return freshSession();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionData;
      if (Array.isArray(parsed.decisions) && Array.isArray(parsed.hands)) {
        return {
          startedAt:
            typeof parsed.startedAt === 'string' ? parsed.startedAt : new Date().toISOString(),
          decisions: parsed.decisions.filter(isValidDecision),
          hands: parsed.hands.filter(isValidHand),
        };
      }
    }
  } catch {
    // données corrompues : on repart de zéro
  }
  return freshSession();
}

export function saveSession(data: SessionData): void {
  if (typeof window === 'undefined') return;
  try {
    const hands = data.hands.slice(-MAX_HANDS);
    // Aligne la fenêtre des décisions sur celle des mains conservées (les décisions
    // de la main EN COURS ont un handId supérieur à la dernière main enregistrée).
    const minHandId = hands[0]?.handId ?? 0;
    const trimmed: SessionData = {
      ...data,
      hands,
      decisions: data.decisions.filter((d) => d.handId >= minHandId).slice(-MAX_DECISIONS),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota plein : la partie continue sans persistance
  }
}

/** Bilan archivé d'une session terminée : alimente l'écran de progression. */
export type SessionArchive = {
  startedAt: string;
  endedAt: string;
  stats: SessionStats;
};

export function saveHistory(history: SessionArchive[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_ARCHIVES)));
  } catch {
    // quota plein
  }
}

export function loadHistory(): SessionArchive[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionArchive[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignorée : l'historique n'est pas critique
  }
  return [];
}

/** Archive le bilan avant d'effacer une session (appelé par « Nouvelle session »). */
export function archiveSession(data: SessionData, endedAt = new Date().toISOString()): void {
  if (typeof window === 'undefined') return;
  const stats = computeStats(data);
  if (stats.handsPlayed === 0) return;
  try {
    // Idempotent : ré-archiver la même session remplace l'entrée au lieu de la dupliquer.
    const history = [
      ...loadHistory().filter((a) => a.startedAt !== data.startedAt),
      { startedAt: data.startedAt, endedAt, stats },
    ];
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_ARCHIVES)));
  } catch {
    // quota plein
  }
}
