'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suggestRaise } from '@/lib/poker/advice';
import { diagnoseEquity, diagnoseRequired } from '@/lib/poker/diagnose';
import { loadDrillStats } from '@/lib/poker/drill';
import {
  getDisplayedPot,
  heroPotOdds,
  legalActions,
  playerAt,
  type Action,
  type HandState,
} from '@/lib/poker/engine';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import { hitOdds } from '@/lib/poker/outs';
import {
  preflopHintsVisible,
  preflopVerdict,
  type PreflopVerdict,
} from '@/lib/poker/preflop-verdict';
import { pushFoldSpot } from '@/lib/poker/pushfold';
import { combosForClasses, estimatePreflopRange } from '@/lib/poker/ranges';
import {
  SIZE_WARNING_RATIO,
  classifyDecision,
  gradeExam,
  median,
  type DecisionRecord,
  type ExamAnswer,
} from '@/lib/poker/session';
import {
  addCard,
  cardFromDecision,
  dueCards,
  loadSrs,
  saveSrs,
  scheduleNext,
  updateCard,
  type SrsCard,
} from '@/lib/poker/srs';
import { ActionBar } from './ActionBar';
import { CardView } from './CardView';
import { DecisionRecap } from './DecisionRecap';
import { ExamOverlay, ExamResult, PreflopExamOverlay } from './ExamOverlay';
import { Panel, PreflopSection } from './Panel';
import { ReviewQueue } from './ReviewQueue';
import { Seat } from './Seat';
import { SessionSummary } from './SessionSummary';
import { TableSetup } from './TableSetup';
import { HERO_SEAT, useGame } from './useGame';
import { useEquity } from './useEquity';
import { useSession } from './useSession';

const MODE_STORAGE_KEY = 'poker-display-mode';
const SHOW_BOTS_STORAGE_KEY = 'poker-show-bot-cards';
const EXAM_STORAGE_KEY = 'poker-exam-mode';
const AID_STORAGE_KEY = 'poker-aid-level';

/**
 * Niveaux d'étayage : découverte (tout visible — béquille assumée),
 * masqué (défaut : les chiffres n'arrivent QU'APRÈS la décision),
 * examen (questions avant révélation).
 */
type AidLevel = 'decouverte' | 'masque' | 'examen';
const AID_ORDER: AidLevel[] = ['decouverte', 'masque', 'examen'];
const AID_LABELS: Record<AidLevel, string> = {
  decouverte: 'Découverte',
  masque: 'Masqué',
  examen: 'Examen',
};

function BetPill({ amount, mode, bb }: { amount: number; mode: DisplayMode; bb: number }) {
  if (amount <= 0) return <div className="h-6" />;
  return (
    <div className="flex h-6 items-center gap-1 rounded-full bg-black/50 px-2 text-xs font-semibold text-amber-200">
      <span className="h-3 w-3 rounded-full border border-amber-200 bg-amber-500" />
      {formatAmount(amount, mode, bb)}
    </div>
  );
}

function ResultBanner({
  hand,
  mode,
  coach,
  hotkeysEnabled,
  onNext,
}: {
  hand: HandState;
  mode: DisplayMode;
  coach: string | null;
  hotkeysEnabled: boolean;
  onNext: () => void;
}) {
  const result = hand.result!;
  const bb = hand.blinds.bb;

  useEffect(() => {
    if (!hotkeysEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === 'n' || event.key === 'Enter') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, hotkeysEnabled]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-black/10 bg-white/80 p-4 text-center shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/80">
      <p className="font-semibold">
        {result.winners
          .map((w) => {
            const name = playerAt(hand, w.seat).name;
            const gain = formatAmount(w.amount, mode, bb);
            return result.wonWithoutShowdown
              ? `${name} remporte ${gain} sans abattage`
              : `${name} remporte ${gain}${w.handName ? ` avec ${w.handName}` : ''}`;
          })
          .join(' · ')}
      </p>
      {coach && (
        <p className="text-sm font-medium text-sky-700 dark:text-sky-300">💡 {coach}</p>
      )}
      <button
        type="button"
        onClick={onNext}
        className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
      >
        Nouvelle main <span className="opacity-60">(N)</span>
      </button>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Distribution automatique dans quelques secondes…
      </p>
    </div>
  );
}

const DRILL_LABELS: Record<string, string> = {
  potOdds: 'Cote du pot',
  sizeFlash: 'Tailles → % (flash)',
  betSize: 'Combien miser ?',
  outs: 'Outs',
  equity: 'Équité',
  openRange: 'Ranges préflop',
  pushFold: 'Push / Fold',
};

export function Table() {
  const { hand, config, spinLevel, spinResult, heroAct, nextHand, applyConfig, resetGame } =
    useGame();
  const session = useSession();

  const [mode, setMode] = useState<DisplayMode>('eur');
  const [showBotCards, setShowBotCards] = useState(false);
  const [aidLevel, setAidLevel] = useState<AidLevel>('masque');
  const [examDone, setExamDone] = useState<{ key: string; answer: ExamAnswer } | null>(null);
  const [preflopExam, setPreflopExam] = useState<{
    key: string;
    pick: 'raise' | 'call' | 'fold';
    correct: boolean;
  } | null>(null);
  // Mode Masqué préflop : verdict photographié à la décision, révélé juste après.
  const [preflopFeedback, setPreflopFeedback] = useState<{
    key: string;
    verdict: PreflopVerdict;
    pick: 'raise' | 'call' | 'fold';
    correct: boolean;
  } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [srsCards, setSrsCards] = useState<SrsCard[]>([]);
  const [reviewCards, setReviewCards] = useState<SrsCard[] | null>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
    if (savedMode === 'bb' || savedMode === 'eur') setMode(savedMode);
    setShowBotCards(localStorage.getItem(SHOW_BOTS_STORAGE_KEY) === '1');
    const savedAid = localStorage.getItem(AID_STORAGE_KEY);
    if (savedAid === 'decouverte' || savedAid === 'masque' || savedAid === 'examen') {
      setAidLevel(savedAid);
    } else if (localStorage.getItem(EXAM_STORAGE_KEY) === '1') {
      setAidLevel('examen'); // migration de l'ancien réglage
    }
    setSrsCards(loadSrs());
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'eur' ? 'bb' : 'eur';
      localStorage.setItem(MODE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleShowBotCards = useCallback(() => {
    setShowBotCards((v) => {
      localStorage.setItem(SHOW_BOTS_STORAGE_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  const cycleAidLevel = useCallback(() => {
    setAidLevel((level) => {
      const next = AID_ORDER[(AID_ORDER.indexOf(level) + 1) % AID_ORDER.length];
      localStorage.setItem(AID_STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Une modale ouverte neutralise tous les raccourcis de la table derrière elle.
  const modalOpen = setupOpen || summaryOpen || reviewCards !== null || spinResult !== null;

  // Séance guidée du jour : affichée tant qu'elle n'a pas été fermée aujourd'hui.
  const [planHidden, setPlanHidden] = useState(true);
  const [weakestPack, setWeakestPack] = useState('Tailles → % (flash)');
  useEffect(() => {
    const key = `poker-plan-${new Date().toISOString().slice(0, 10)}`;
    setPlanHidden(localStorage.getItem(key) === '1');
    // Compétence la plus faible d'après les stats de drill (sinon : la moins travaillée).
    const drillStats = loadDrillStats();
    let worstKey = 'sizeFlash';
    let worstScore = 2;
    for (const key of Object.keys(DRILL_LABELS)) {
      const s = drillStats[key];
      const score = !s || s.attempts < 10 ? 1.5 : s.correct / s.attempts;
      if (score < worstScore) {
        worstScore = score;
        worstKey = key;
      }
    }
    setWeakestPack(DRILL_LABELS[worstKey]);
  }, []);
  const hidePlan = useCallback(() => {
    localStorage.setItem(`poker-plan-${new Date().toISOString().slice(0, 10)}`, '1');
    setPlanHidden(true);
  }, []);

  // Fatigue : réponses nettement plus lentes ou erreurs en série → suggérer d'arrêter.
  const fatigue = useMemo(() => {
    const decisions = session.data?.decisions ?? [];
    if (decisions.length < 20) return false;
    const times = decisions
      .map((d) => d.elapsedMs)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    if (times.length < 20) return false;
    const overall = median(times) ?? 0;
    const recent = median(times.slice(-8)) ?? 0;
    const recentErrors = decisions.slice(-10).filter((d) => d.isError).length;
    return recent > overall * 1.6 || recentErrors >= 3;
  }, [session.data]);

  // Raccourci clavier E : fait tourner le niveau d'aide.
  useEffect(() => {
    if (modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === 'e') cycleAidLevel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleAidLevel, modalOpen]);

  // L'adversaire de référence pour l'équité et le panneau :
  // le dernier agresseur encore en jeu, sinon le premier adversaire non couché.
  const villainSeat = useMemo(() => {
    if (!hand) return null;
    if (
      hand.lastAggressorSeat !== null &&
      hand.lastAggressorSeat !== HERO_SEAT &&
      playerAt(hand, hand.lastAggressorSeat).status !== 'folded'
    ) {
      return hand.lastAggressorSeat;
    }
    const active = hand.players.find((p) => p.seat !== HERO_SEAT && p.status !== 'folded');
    return active?.seat ?? hand.players.find((p) => p.seat !== HERO_SEAT)?.seat ?? null;
  }, [hand]);

  const equity = useEquity(hand, HERO_SEAT, villainSeat);

  // Face à une mise : montant à payer, pot et équité requise.
  const facing = useMemo(() => {
    if (!hand) return null;
    const odds = heroPotOdds(hand, HERO_SEAT);
    if (!odds) return null;
    return {
      callAmount: odds.toCall,
      totalNow: odds.potBefore,
      required: odds.required,
    };
  }, [hand]);

  // Taille de mise conseillée + calcul de rentabilité, quand c'est au héros de parler.
  const advice = useMemo(
    () =>
      hand && !hand.result && hand.toActSeat === HERO_SEAT && villainSeat !== null
        ? suggestRaise(hand, HERO_SEAT, villainSeat)
        : null,
    [hand, villainSeat],
  );

  // Spot push/fold du héros (préflop, tapis effectif ≤ 13 BB) : remplace le conseil classique.
  const heroPushSpot = useMemo(
    () =>
      hand && !hand.result && hand.toActSeat === HERO_SEAT && hand.street === 'preflop'
        ? pushFoldSpot(hand, HERO_SEAT)
        : null,
    [hand],
  );

  // Verdict de range préflop : remplace le verdict équité/cote (plus jamais de limp).
  const heroPreflop = useMemo(
    () => (hand ? preflopVerdict(hand, HERO_SEAT) : null),
    [hand],
  );

  // Dernière action de chaque siège sur la street en cours, depuis l'historique du moteur.
  const lastActions = useMemo(() => {
    const map: Partial<Record<number, Action>> = {};
    if (hand) {
      for (const entry of hand.history) {
        if (entry.street === hand.street) map[entry.seat] = entry.action;
      }
    }
    return map;
  }, [hand]);

  // Un point de décision unique par (session, main, nombre d'actions jouées) :
  // le préfixe de session évite les collisions d'id dans la file SRS, qui survit
  // volontairement à « Nouvelle session » alors que handId repart à 1.
  const sessionKey = session.data?.startedAt ?? 'boot';
  const decisionKey = hand ? `${sessionKey}:${hand.handId}:${hand.history.length}` : '';
  const isPreflop = hand?.street === 'preflop';
  const examAnswered = examDone !== null && examDone.key === decisionKey;
  const preflopAnswered = preflopExam !== null && preflopExam.key === decisionKey;
  // Préflop, l'examen pose « Relance / Call / Fold » (range), pas la cote/équité.
  const examPreflopPending = aidLevel === 'examen' && isPreflop && heroPreflop !== null && !preflopAnswered;
  const examPostflopPending =
    aidLevel === 'examen' && !isPreflop && facing !== null && !examAnswered;
  // Montre-t-on les indices préflop (verdict, entourage, grisé, chip) AVANT la décision ?
  const showPreflopHints = preflopHintsVisible(aidLevel, preflopAnswered);
  const panelMask = isPreflop
    ? // Préflop : masqué tant qu'on ne montre pas les indices (jamais en Masqué avant décision).
      !showPreflopHints
    : aidLevel === 'masque'
      ? true
      : aidLevel === 'examen'
        ? !(facing !== null && examAnswered)
        : false;

  // Le retour Masqué préflop s'efface quand on quitte le préflop ou qu'une
  // nouvelle décision préflop commence.
  useEffect(() => {
    setPreflopFeedback((fb) => {
      if (!fb) return fb;
      if (!isPreflop) return null;
      if (heroPreflop !== null && fb.key !== decisionKey) return null;
      return fb;
    });
  }, [isPreflop, heroPreflop, decisionKey]);

  // Chrono de réflexion : démarre quand la parole arrive au héros.
  const turnStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (hand && !hand.result && hand.toActSeat === HERO_SEAT) {
      turnStartRef.current = performance.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionKey, hand?.toActSeat]);

  const pushSrsCard = useCallback((card: SrsCard | null) => {
    if (!card) return;
    setSrsCards((prev) => {
      const next = addCard(prev, card);
      saveSrs(next);
      return next;
    });
  }, []);

  // Enregistre chaque décision (call/fold face à une mise, et toutes les bets/raises).
  const act = useCallback(
    (action: Action) => {
      if (hand && !hand.result && hand.toActSeat === HERO_SEAT) {
        // Mode Masqué préflop : on photographie le verdict pour le révéler APRÈS la décision.
        if (hand.street === 'preflop' && aidLevel === 'masque' && heroPreflop) {
          const pick: 'raise' | 'call' | 'fold' =
            action.type === 'fold' ? 'fold' : action.type === 'call' ? 'call' : 'raise';
          setPreflopFeedback({
            key: decisionKey,
            verdict: heroPreflop,
            pick,
            correct: heroPreflop.recommended.includes(pick),
          });
        }
        const isAggro = action.type === 'bet' || action.type === 'raise';
        if (facing || isAggro) {
          const hero = playerAt(hand, HERO_SEAT);
          const range = villainSeat !== null ? estimatePreflopRange(hand, villainSeat) : null;
          const equityNow = equity.status === 'ready' ? equity.equity : null;
          const simplified =
            action.type === 'fold'
              ? 'fold'
              : action.type === 'call'
                ? 'call'
                : action.type === 'bet'
                  ? 'bet'
                  : 'raise';
          const cls = facing
            ? classifyDecision(
                simplified === 'bet' ? 'raise' : simplified,
                equityNow,
                facing.required,
              )
            : { isError: false, errorKind: null };
          const sizeAmount = isAggro && 'amount' in action ? action.amount : null;
          const sizeAdvised = isAggro ? (advice?.amount ?? null) : null;
          const totalNow = facing?.totalNow ?? getDisplayedPot(hand);
          // Un jam à faible SPR est une ligne standard : on ne le signale pas
          // « hors norme » juste parce que le conseil visait ⅔ pot.
          const heroMaxTo = hero.streetBet + hero.stack;
          const lowSprJam =
            sizeAmount !== null && sizeAmount === heroMaxTo && heroMaxTo <= 1.5 * totalNow;
          const record: DecisionRecord = {
            id: decisionKey,
            handId: hand.handId,
            street: hand.street,
            equity: equityNow,
            required: facing?.required ?? 0,
            callAmount: facing?.callAmount ?? 0,
            potTotal: totalNow,
            action: simplified,
            ...cls,
            exam: examAnswered ? examDone!.answer : null,
            elapsedMs:
              turnStartRef.current !== null
                ? Math.round(performance.now() - turnStartRef.current)
                : null,
            spot:
              hero.holeCards && villainSeat !== null && range
                ? {
                    heroCards: hero.holeCards,
                    board: hand.board,
                    villainSeat,
                    rangeLabel: range.label,
                    rangeClasses: range.classes ? [...range.classes] : null,
                    activeOpponents: hand.players.filter(
                      (p) => p.seat !== HERO_SEAT && p.status !== 'folded',
                    ).length,
                  }
                : null,
            outsCount: equity.status === 'ready' ? equity.outs.length : null,
            villainHadChips:
              villainSeat !== null ? playerAt(hand, villainSeat).stack > 0 : false,
            heroChipsBehind: hero.stack > (facing?.callAmount ?? 0),
            sizeAmount,
            sizeAdvised,
            sizeWarning:
              !lowSprJam &&
              sizeAmount !== null &&
              sizeAdvised !== null &&
              sizeAdvised > 0 &&
              Math.abs(sizeAmount - sizeAdvised) / sizeAdvised > SIZE_WARNING_RATIO,
          };
          session.recordDecision(record);
          if (record.isError) pushSrsCard(cardFromDecision(record));
          setExamDone(null);
        }
      }
      setPreflopExam(null);
      heroAct(action);
    },
    [hand, facing, equity, session, examAnswered, examDone, heroAct, advice, villainSeat, decisionKey, pushSrsCard, aidLevel, heroPreflop],
  );

  const submitPreflopExam = useCallback(
    (pick: 'raise' | 'call' | 'fold') => {
      if (!heroPreflop) return;
      setPreflopExam({ key: decisionKey, pick, correct: heroPreflop.recommended.includes(pick) });
    },
    [heroPreflop, decisionKey],
  );

  const submitExam = useCallback(
    (requiredGuess: number, equityGuess: number, outsGuess: number | null, elapsedMs: number) => {
      if (!hand || !facing || equity.status !== 'ready' || equity.equity === null) return;
      const hero = playerAt(hand, HERO_SEAT);
      const villain = villainSeat !== null ? playerAt(hand, villainSeat) : null;
      const requiredOk = gradeExam(requiredGuess, facing.required);
      // Même convention que le panneau : turn + river garanties seulement à tapis.
      const guaranteedTwo =
        villain?.status === 'all-in' || facing.callAmount >= hero.stack;
      // L'équité Monte-Carlo couvre turn ET river ; au flop avec des jetons derrière,
      // on accepte AUSSI la réponse « une carte » (outs × 2) enseignée par le panneau.
      const drawing = !equity.aheadNow && equity.outs.length > 0;
      const oneCardRef =
        hand.street === 'flop' && !guaranteedTwo && drawing
          ? hitOdds(equity.outs.length, 50 - hand.board.length, 1)
          : null;
      const equityOk =
        gradeExam(equityGuess, equity.equity) ||
        (oneCardRef !== null && gradeExam(equityGuess, oneCardRef));
      const outsActual = outsGuess !== null ? equity.outs.length : null;
      setExamDone({
        key: decisionKey,
        answer: {
          requiredGuess,
          equityGuess,
          requiredActual: facing.required,
          equityActual: equity.equity,
          requiredOk,
          equityOk,
          outsGuess,
          outsActual,
          outsOk: outsGuess !== null && outsActual !== null ? Math.abs(outsGuess - outsActual) <= 1 : null,
          requiredDiagnosis: requiredOk
            ? null
            : diagnoseRequired(requiredGuess, {
                callAmount: facing.callAmount,
                potTotal: facing.totalNow,
                villainBet: villain?.streetBet ?? 0,
              }),
          equityDiagnosis: equityOk
            ? null
            : diagnoseEquity(equityGuess, {
                outsCount: equity.outs.length,
                cardsToCome: hand.street === 'flop' && guaranteedTwo ? 2 : 1,
                actual: equity.equity,
              }),
          elapsedMs,
        },
      });
    },
    [hand, facing, equity, decisionKey, villainSeat],
  );

  // Enregistre la main complète dès qu'elle est terminée.
  const recordedHandRef = useRef(0);
  useEffect(() => {
    if (!hand?.result || recordedHandRef.current === hand.handId) return;
    recordedHandRef.current = hand.handId;
    const wonBy = (seat: number) =>
      hand.result!.winners.find((w) => w.seat === seat)?.amount ?? 0;
    const hero = playerAt(hand, HERO_SEAT);
    session.recordHand({
      handId: hand.handId,
      heroSeat: HERO_SEAT,
      buttonSeat: hand.buttonSeat,
      bb: hand.blinds.bb,
      players: hand.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        holeCards: p.holeCards,
        startStack: p.stack + p.totalInvested - wonBy(p.seat),
      })),
      board: hand.board,
      history: hand.history,
      result: hand.result,
      heroNet: wonBy(HERO_SEAT) - hero.totalInvested,
    });
  }, [hand, session]);

  // Bug d'intégrité réglé : les décisions jouées avant la fin du Monte-Carlo
  // (équité inconnue) sont reclassées en fin de main, et les erreurs découvertes
  // rejoignent la file de révision. On rattrape aussi les orphelines des mains
  // abandonnées (changement de table en cours de main). PAS de mécanisme
  // d'annulation ici : l'effet re-tourne à chaque rendu (l'objet `session` change
  // d'identité) et un cleanup posant un drapeau tuerait le travail avant même le
  // chargement du chunk ; les callbacks utilisés sont stables et idempotents.
  const reclassifiedRef = useRef(0);
  useEffect(() => {
    if (!hand?.result || reclassifiedRef.current === hand.handId) return;
    reclassifiedRef.current = hand.handId;
    const pending = (session.data?.decisions ?? []).filter(
      (d) => d.handId <= hand.handId && d.equity === null && d.spot && d.id,
    );
    if (pending.length === 0) return;
    const { updateDecision } = session;
    void (async () => {
      const { compute } = await import('@/workers/equity.worker');
      for (const decision of pending) {
        const spot = decision.spot!;
        const combos = spot.rangeClasses
          ? combosForClasses(new Set(spot.rangeClasses), [...spot.heroCards, ...spot.board])
          : null;
        const result = compute({
          id: 0,
          hero: spot.heroCards,
          board: spot.board,
          villainCombos: combos,
          iterations: 2000,
        });
        const simplified =
          decision.action === 'fold' ? 'fold' : decision.action === 'call' ? 'call' : 'raise';
        const cls =
          decision.callAmount > 0
            ? classifyDecision(simplified, result.equity, decision.required)
            : { isError: false, errorKind: null };
        updateDecision(decision.id!, {
          equity: result.equity,
          outsCount: result.outs.length,
          ...cls,
        });
        if (cls.isError) {
          pushSrsCard(
            cardFromDecision({
              ...decision,
              equity: result.equity,
              outsCount: result.outs.length,
              ...cls,
            }),
          );
        }
      }
    })();
  }, [hand, session, pushSrsCard]);

  const startNewSession = useCallback(() => {
    session.reset();
    recordedHandRef.current = 0;
    reclassifiedRef.current = 0;
    setExamDone(null);
    setPreflopExam(null);
    setSummaryOpen(false);
    resetGame();
  }, [session, resetGame]);

  // Suggestion de niveau : ≥80 % de bonnes réponses d'examen récentes → monter ; <40 % → redescendre.
  const promotionHint = useMemo(() => {
    const graded: boolean[] = [];
    for (const d of session.data?.decisions ?? []) {
      if (d.exam) {
        graded.push(d.exam.requiredOk, d.exam.equityOk);
        if (d.exam.outsOk !== null && d.exam.outsOk !== undefined) graded.push(d.exam.outsOk);
      }
    }
    const recent = graded.slice(-20);
    if (recent.length < 12) return null;
    const rate = recent.filter(Boolean).length / recent.length;
    if (rate >= 0.8 && aidLevel !== 'examen')
      return '≥ 80 % de bonnes réponses en examen récemment : passe au niveau Examen (E).';
    if (rate < 0.4 && aidLevel === 'examen')
      return 'Série difficile : repasse en Masqué (E) et consolide avec le Drill.';
    return null;
  }, [session.data, aidLevel]);

  // Phrase de coach : dissocier la qualité de la décision du résultat de la main.
  const coach = useMemo(() => {
    if (!hand?.result || !session.data) return null;
    const decisions = session.data.decisions.filter(
      (d) => d.handId === hand.handId && d.callAmount > 0,
    );
    if (decisions.length === 0) return null;
    const errors = decisions.filter((d) => d.isError);
    const allKnown = decisions.every((d) => d.equity !== null);
    const net =
      (hand.result.winners.find((w) => w.seat === HERO_SEAT)?.amount ?? 0) -
      playerAt(hand, HERO_SEAT).totalInvested;
    if (net < 0 && errors.length === 0 && allKnown) {
      return 'Main perdue, mais tes décisions face aux mises étaient bonnes : c’est la variance, pas toi.';
    }
    if (net >= 0 && errors.length > 0) {
      return 'Main gagnée, mais une décision était perdante : le résultat ne valide pas le process.';
    }
    return null;
  }, [hand, session.data]);

  const due = useMemo(() => dueCards(srsCards), [srsCards]);

  if (!hand) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-500">
        Distribution…
      </main>
    );
  }

  const bb = hand.blinds.bb;
  const isSpin = config.mode === 'spin';
  // En tournoi les euros n'ont pas de sens : tout s'affiche en BB.
  const dMode: DisplayMode = isSpin ? 'bb' : mode;
  const hero = playerAt(hand, HERO_SEAT);
  const opponents = hand.players.filter((p) => p.seat !== HERO_SEAT);
  const compactSeats = opponents.length > 1;
  const showdown = hand.street === 'showdown';
  const heroTurn = !hand.result && hand.toActSeat === HERO_SEAT;
  const actingBot =
    !hand.result && hand.toActSeat !== null && hand.toActSeat !== HERO_SEAT
      ? playerAt(hand, hand.toActSeat)
      : null;

  const callVerdict: 'good' | 'bad' | null =
    !panelMask && facing && equity.status === 'ready' && equity.equity !== null
      ? equity.equity >= facing.required
        ? 'good'
        : 'bad'
      : null;

  const handDecisions = (session.data?.decisions ?? []).filter((d) => d.handId === hand.handId);
  const lastDecision = handDecisions[handDecisions.length - 1];

  const stats = session.stats;
  const netBBText =
    stats && stats.handsPlayed > 0
      ? `${stats.netBB >= 0 ? '+' : ''}${(Math.round(stats.netBB * 10) / 10).toString().replace('.', ',')} BB`
      : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <h1 className="text-lg font-bold">Poker Trainer</h1>
        <div className="flex flex-wrap items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <span>
            {isSpin
              ? `Spin & Go · Niveau ${(spinLevel ?? 0) + 1} · Blindes ${hand.blinds.sb}/${hand.blinds.bb} jetons · Main n°${hand.handId}`
              : `Main n°${hand.handId} · Blindes ${formatAmount(hand.blinds.sb, 'eur', bb)}/${formatAmount(hand.blinds.bb, 'eur', bb)}`}
            {netBBText ? ` · Session : ${stats!.handsPlayed} mains, ${netBBText}` : ''}
          </span>
          <Link
            href="/drill"
            className="rounded-md border border-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Drill
          </Link>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            title="Changer le nombre de bots et leurs profils"
          >
            Table ({hand.players.length} joueurs)
          </button>
          <button
            type="button"
            onClick={cycleAidLevel}
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
              aidLevel === 'examen'
                ? 'border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                : aidLevel === 'masque'
                  ? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
                  : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800'
            }`}
            title="Niveau d'aide : Découverte (tout visible) → Masqué (chiffres après ta décision) → Examen (questions d'abord). Raccourci : E"
          >
            Aide : {AID_LABELS[aidLevel]} (E)
          </button>
          {!isSpin && (
            <button
              type="button"
              onClick={toggleMode}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              title="Basculer l’affichage des montants"
            >
              {mode === 'eur' ? 'Afficher en BB' : 'Afficher en €'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Terminer la session
          </button>
          <label className="flex cursor-pointer items-center gap-1 text-xs">
            <input type="checkbox" checked={showBotCards} onChange={toggleShowBotCards} />
            Cartes des bots (debug)
          </label>
        </div>
      </header>

      {promotionHint && (
        <p className="rounded-md bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          💡 {promotionHint}
        </p>
      )}

      {!planHidden && !hand.result && (
        <div className="flex items-start justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-950/40">
          <div className="flex flex-col gap-0.5 text-emerald-900 dark:text-emerald-200">
            <span className="font-bold">Séance du jour (~15 min) — la régularité bat le volume</span>
            <span>
              1. Échauffement :{' '}
              {due.length > 0
                ? `${Math.min(5, due.length)} erreur${due.length > 1 ? 's' : ''} à rejouer (bannière ci-dessous)`
                : 'rien en retard ✓'}
            </span>
            <span>
              2. Drill « {weakestPack} » : une série de 20 —{' '}
              <Link href="/drill" className="underline">
                ouvrir le Drill
              </Link>
            </span>
            <span>3. ~30 mains en mode Masqué ou Examen, sans se presser.</span>
          </div>
          <button
            type="button"
            onClick={hidePlan}
            className="shrink-0 rounded px-1.5 py-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900"
            title="Masquer pour aujourd'hui"
          >
            ✕
          </button>
        </div>
      )}

      {fatigue && (
        <p className="rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          🧠 Réponses nettement plus lentes ou erreurs en série : les automatismes se gravent en
          sessions courtes — bon moment pour conclure et revenir demain.
        </p>
      )}

      {due.length > 0 && reviewCards === null && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/50">
          <span className="font-medium text-amber-800 dark:text-amber-200">
            🔁 {due.length} erreur{due.length > 1 ? 's' : ''} à revoir avant de jouer
          </span>
          <button
            type="button"
            onClick={() => setReviewCards(due.slice(0, 5))}
            className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-400"
          >
            Échauffement ({Math.min(5, due.length)} spots)
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <section className="flex flex-col items-center gap-2 rounded-[44px] border-8 border-emerald-950 bg-gradient-to-b from-emerald-700 to-emerald-800 px-4 py-5 shadow-inner sm:gap-3 sm:py-6">
            <div className="flex flex-wrap items-start justify-center gap-x-5 gap-y-2">
              {opponents.map((player) => (
                <div key={player.seat} className="flex flex-col items-center gap-1">
                  <Seat
                    player={player}
                    compact={compactSeats}
                    isButton={hand.buttonSeat === player.seat}
                    isToAct={!hand.result && hand.toActSeat === player.seat}
                    showCards={showBotCards || (showdown && player.status !== 'folded')}
                    lastAction={lastActions[player.seat]}
                    mode={dMode}
                    bb={bb}
                  />
                  <BetPill amount={player.streetBet} mode={dMode} bb={bb} />
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map((i) =>
                  hand.board[i] ? (
                    <CardView key={i} card={hand.board[i]} />
                  ) : (
                    <CardView key={i} placeholder />
                  ),
                )}
              </div>
              <div className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">
                Pot : {formatAmount(getDisplayedPot(hand), dMode, bb)}
              </div>
            </div>

            <BetPill amount={hero.streetBet} mode={dMode} bb={bb} />
            <Seat
              player={hero}
              isButton={hand.buttonSeat === HERO_SEAT}
              isToAct={heroTurn}
              showCards
              lastAction={lastActions[HERO_SEAT]}
              mode={dMode}
              bb={bb}
            />
          </section>

          {examAnswered && facing && <ExamResult answer={examDone!.answer} />}
          {/* Examen préflop : l'une-ligne suffit (le panneau montre déjà le verdict). */}
          {preflopAnswered && heroPreflop && (
            <p
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                preflopExam!.correct
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              }`}
            >
              {preflopExam!.correct ? '✓ Bonne lecture.' : '✗ À revoir.'} Recommandé :{' '}
              {heroPreflop.recommended
                .map((a) => (a === 'raise' ? 'Relance' : a === 'call' ? 'Call' : 'Fold'))
                .join(' ou ')}
              .
            </p>
          )}
          {/* Masqué préflop : le verdict n'apparaît qu'APRÈS la décision, avec ✓/✗ et grille. */}
          {preflopFeedback && (
            <PreflopSection
              verdict={preflopFeedback.verdict}
              fmt={(c) => formatAmount(c, dMode, bb)}
              feedback={{ pick: preflopFeedback.pick, correct: preflopFeedback.correct }}
            />
          )}
          {aidLevel !== 'decouverte' && lastDecision && !examAnswered && !isPreflop && (
            <DecisionRecap decision={lastDecision} mode={dMode} bb={bb} />
          )}

          {hand.result ? (
            <ResultBanner
              hand={hand}
              mode={dMode}
              coach={coach}
              hotkeysEnabled={!modalOpen}
              onNext={nextHand}
            />
          ) : examPostflopPending ? (
            <ExamOverlay
              key={decisionKey}
              equityReady={equity.status === 'ready' && equity.equity !== null}
              askOuts={
                (hand.street === 'flop' || hand.street === 'turn') &&
                !(equity.status === 'ready' && equity.aheadNow)
              }
              rangeLabel={equity.rangeLabel}
              onSubmit={submitExam}
            />
          ) : examPreflopPending ? (
            <PreflopExamOverlay key={decisionKey} onSubmit={submitPreflopExam} />
          ) : heroTurn ? (
            <ActionBar
              state={hand}
              onAction={act}
              mode={dMode}
              callVerdict={isPreflop ? null : callVerdict}
              // Préflop : on préremplit toujours (0,06 € par défaut) ; en Masqué sans le chip.
              suggestion={heroPushSpot ? null : isPreflop ? advice : panelMask ? null : advice}
              showChip={isPreflop ? showPreflopHints : !panelMask}
              preflopHint={showPreflopHints ? heroPreflop : null}
              hotkeysEnabled={!modalOpen}
            />
          ) : (
            <div className="rounded-xl border border-black/10 bg-white/60 p-4 text-center text-sm text-neutral-500 backdrop-blur dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-400">
              {actingBot ? `${actingBot.name} réfléchit…` : 'Distribution…'}
            </div>
          )}
        </div>

        {villainSeat !== null && (
          <Panel
            hand={hand}
            heroSeat={HERO_SEAT}
            botSeat={villainSeat}
            equity={equity}
            mode={dMode}
            advice={
              panelMask || heroPushSpot || (heroPreflop && !heroPreflop.recommended.includes('raise'))
                ? null
                : advice
            }
            pushSpot={panelMask || heroPreflop ? null : heroPushSpot}
            preflop={panelMask ? null : heroPreflop}
            mask={panelMask}
          />
        )}
      </div>

      {spinResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-white p-6 text-center shadow-2xl dark:bg-neutral-900">
            <p className="text-4xl">{spinResult === 'won' ? '🏆' : '💀'}</p>
            <h2 className="text-lg font-bold">
              {spinResult === 'won' ? 'Tu remportes le Spin & Go !' : 'Éliminé.'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {spinResult === 'won'
                ? 'Winner takes all. Les tableaux push/fold ont fait le travail.'
                : 'Revois tes spots dans le Drill « Push / Fold » avant de retenter.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyConfig(config)}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
              >
                Rejouer un Spin
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-lg bg-neutral-200 px-4 py-2.5 font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              >
                Changer de table
              </button>
            </div>
          </div>
        </div>
      )}

      {setupOpen && (
        <TableSetup
          current={config}
          onApply={(cfg) => {
            applyConfig(cfg);
            setSetupOpen(false);
          }}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {reviewCards !== null && (
        <ReviewQueue
          cards={reviewCards}
          mode={dMode}
          bb={bb}
          onAnswer={(card, correct) => {
            setSrsCards((prev) => {
              const next = updateCard(prev, scheduleNext(card, correct));
              saveSrs(next);
              return next;
            });
          }}
          onClose={() => setReviewCards(null)}
        />
      )}

      {summaryOpen && session.data && stats && (
        <SessionSummary
          data={session.data}
          stats={stats}
          mode={dMode}
          bb={bb}
          onClose={() => setSummaryOpen(false)}
          onNewSession={startNewSession}
        />
      )}
    </main>
  );
}
