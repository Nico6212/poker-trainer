'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateDrill,
  gradeDrill,
  loadDrillStats,
  masteryLevel,
  recordDrillResult,
  TARGET_MS,
  type DrillGrade,
  type DrillKind,
  type DrillPack,
  type DrillQuestion,
  type DrillStats,
} from '@/lib/poker/drill';
import { formatAmount } from '@/lib/poker/format';
import {
  dailySeries,
  loadProgress,
  recordProgress,
  summarizeProgress,
  type DayPoint,
} from '@/lib/poker/progress';
import { median } from '@/lib/poker/session';
import { CardView } from '@/components/table/CardView';

const SERIES_LENGTH = 20;
const SPRINT_MS = 120_000;

const PACKS: { key: DrillPack; label: string; description: string }[] = [
  { key: 'potOdds', label: 'Cote du pot', description: 'Pot + mise → il te faut combien ?' },
  { key: 'sizeFlash', label: 'Tailles → % (flash)', description: '« Il mise ½ pot » → 25 %. À connaître par cœur.' },
  { key: 'betSize', label: 'Combien miser ?', description: 'L’attaque : open, 3-bet, fraction du pot, bluff — à toi de donner la taille.' },
  { key: 'outs', label: 'Outs', description: 'Compte les cartes qui te font passer devant.' },
  { key: 'equity', label: 'Équité', description: 'Estime tes chances contre une range.' },
  { key: 'openRange', label: 'Ranges préflop', description: 'Cette main s’ouvre-t-elle depuis ce siège ?' },
  { key: 'pushFold', label: 'Push / Fold (Spin & MTT)', description: '≤ 13 BB : push ou jette, selon les tableaux ~Nash.' },
  { key: 'handReading', label: 'Qu’est-ce qui me bat ?', description: 'Lis ta main exacte et repère les dangers du board.' },
  { key: 'mixed', label: 'Mixte (entrelacé)', description: 'Le type de question n’est pas annoncé — comme à la table.' },
];

const PCT_CHIPS = [17, 20, 25, 29, 33, 38, 40, 50];

const MASTERY_STYLE: Record<string, { text: string; bar: string }> = {
  none: { text: 'text-neutral-400 dark:text-neutral-500', bar: 'bg-neutral-300 dark:bg-neutral-600' },
  todo: { text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
  progress: { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  acquired: { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
};

const pctLabel = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);

/** Une courbe (barres) : hauteur = réussite, opacité = volume, compteur sous chaque barre. */
function MiniCurve({
  series,
  metric,
  barClass,
}: {
  series: DayPoint[];
  metric: 'exam' | 'drill';
  barClass: string;
}) {
  const maxCount = Math.max(1, ...series.map((d) => (metric === 'exam' ? d.examCount : d.drillCount)));
  return (
    <div className="flex items-end gap-px">
      {series.map((d) => {
        const rate = metric === 'exam' ? d.examRate : d.drillRate;
        const count = metric === 'exam' ? d.examCount : d.drillCount;
        // Opacité proportionnelle au volume : un jour à 2 réponses paraît plus pâle qu'un jour à 40.
        const opacity = count === 0 ? 0 : 0.3 + 0.7 * Math.min(1, count / maxCount);
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex h-12 w-full items-end">
              <span
                title={`${d.date} · ${rate === null ? 'aucune donnée' : pctLabel(rate)} (${count})`}
                className={`w-full rounded-sm ${barClass}`}
                style={{ height: rate === null ? '2px' : `${Math.max(6, rate * 100)}%`, opacity }}
              />
            </div>
            <span className="text-[6px] leading-none text-neutral-400 dark:text-neutral-600">
              {count || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Progression : courbe Examen (principale) + courbe Drill, sur 30 jours, avec volumes. */
function ProgressSection() {
  const [series, setSeries] = useState<DayPoint[] | null>(null);
  const [week, setWeek] = useState<ReturnType<typeof summarizeProgress> | null>(null);
  const [month, setMonth] = useState<ReturnType<typeof summarizeProgress> | null>(null);

  useEffect(() => {
    const data = loadProgress();
    const now = new Date();
    setSeries(dailySeries(data, 30, now));
    setWeek(summarizeProgress(data, 7, now));
    setMonth(summarizeProgress(data, 30, now));
  }, []);

  if (!series || !week || !month) return null;
  const hasData = month.drillCount > 0 || month.examCount > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-neutral-900/70">
      <p className="font-semibold">Ta progression</p>
      {!hasData ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Joue quelques drills et des mains en mode Examen : tes courbes apparaîtront ici.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800">
              <p className="text-xs uppercase text-neutral-500">7 jours</p>
              <p>
                Examen <strong>{pctLabel(week.examRate)}</strong> ({week.examCount}) · Drill{' '}
                {pctLabel(week.drillRate)} ({week.drillCount})
              </p>
            </div>
            <div className="rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800">
              <p className="text-xs uppercase text-neutral-500">30 jours</p>
              <p>
                Examen <strong>{pctLabel(month.examRate)}</strong> ({month.examCount}) · Drill{' '}
                {pctLabel(month.drillRate)} ({month.drillCount})
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Examen (en situation)
            </p>
            <MiniCurve series={series} metric="exam" barClass="bg-sky-500" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Drill
            </p>
            <MiniCurve series={series} metric="drill" barClass="bg-emerald-500" />
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Réussite par jour sur 30 jours · chiffre = nombre de questions · barre plus pâle = peu
            de volume.
          </p>
        </>
      )}
    </div>
  );
}

/** Badge de maîtrise + mini-jauge de précision. */
function MasteryBadge({
  kind,
  stats,
}: {
  kind: DrillKind;
  stats: { attempts: number; correct: number; times: number[] } | undefined;
}) {
  const m = masteryLevel(kind, stats);
  const style = MASTERY_STYLE[m.tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-xs font-semibold ${style.text}`}>{m.label}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <span
          className={`block h-full ${style.bar}`}
          style={{ width: `${Math.round(m.precision * 100)}%` }}
        />
      </span>
    </span>
  );
}

type Mode = 'serie' | 'sprint';
type Phase = 'menu' | 'question' | 'feedback' | 'finished';

const fmtBB = (cents: number) => formatAmount(cents, 'bb', 2);
const pct = (x: number) => `${Math.round(x * 100)} %`;

function QuestionPrompt({ question }: { question: DrillQuestion }) {
  switch (question.kind) {
    case 'potOdds':
      return (
        <p className="text-lg">
          Pot <strong>{fmtBB(question.pot)}</strong> — il mise{' '}
          <strong>{fmtBB(question.bet)}</strong>. Il te faut combien ?
        </p>
      );
    case 'sizeFlash':
      return (
        <p className="text-lg">
          Il mise <strong>{question.fractionLabel}</strong> → il te faut combien ?
        </p>
      );
    case 'outs':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Ta main :</span>
            {question.hero.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Board :</span>
            {question.board.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Il montre :</span>
            {question.villain.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          <p className="text-lg">Combien d’outs te font passer devant ?</p>
        </div>
      );
    case 'equity':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Ta main :</span>
            {question.hero.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          {question.board.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Board :</span>
              {question.board.map((c) => (
                <CardView key={c} card={c} size="sm" />
              ))}
            </div>
          )}
          <p className="text-lg">
            Ton équité contre <strong>{question.rangeLabel}</strong> ?
          </p>
        </div>
      );
    case 'openRange':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {question.cards.map((c) => (
              <CardView key={c} card={c} />
            ))}
          </div>
          <p className="text-lg">
            Tu es <strong>{question.position}</strong>, personne n’a relancé : tu ouvres ?
          </p>
        </div>
      );
    case 'betSize':
      switch (question.variant) {
        case 'amount':
          return (
            <p className="text-lg">
              Pot <strong>{question.potBB} BB</strong> — tu veux miser{' '}
              <strong>{question.fractionLabel}</strong>. Combien ?
            </p>
          );
        case 'fraction':
          return (
            <p className="text-lg">
              Tu veux qu’il lui faille <strong>{question.targetPct} %</strong> pour payer :
              quelle fraction du pot mises-tu ?
            </p>
          );
        case 'open':
          return (
            <p className="text-lg">
              Préflop, personne n’a relancé
              {question.limpers > 0 ? (
                <>
                  , <strong>{question.limpers} limpeur{question.limpers > 1 ? 's' : ''}</strong>{' '}
                  devant
                </>
              ) : (
                ''
              )}{' '}
              : tu ouvres à combien ?
            </p>
          );
        case 'threebet':
          return (
            <p className="text-lg">
              Il ouvre à <strong>{question.openBB} BB</strong>
              {question.callers > 0 ? ', 1 suiveur' : ''}. Tu 3-bet{' '}
              <strong>{question.inPosition ? 'en position' : 'hors position'}</strong> : à
              combien ?
            </p>
          );
        case 'bluff':
          return (
            <p className="text-lg">
              Bluff pur : tu mises <strong>{question.betBB} BB</strong> dans un pot de{' '}
              <strong>{question.potBB} BB</strong>. Il doit se coucher au moins… ?
            </p>
          );
      }
      return null;
    case 'pushFold':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {question.cards.map((c) => (
              <CardView key={c} card={c} />
            ))}
          </div>
          <p className="text-lg">
            {question.mode === 'push' ? (
              <>
                Tapis <strong>{Math.round(question.stackBB)} BB</strong>,{' '}
                <strong>{question.chartLabel}</strong> : tu push ?
              </>
            ) : (
              <>
                <strong>{question.chartLabel}</strong>, {Math.round(question.stackBB)} BB
                effectives : tu payes son push ?
              </>
            )}
          </p>
        </div>
      );
    case 'handReading':
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Ta main :</span>
            {question.q.hero.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Board :</span>
            {question.q.board.map((c) => (
              <CardView key={c} card={c} size="sm" />
            ))}
          </div>
          <p className="text-lg">
            {question.q.variant === 'yourHand'
              ? 'Quelle est ta main ?'
              : 'Qu’est-ce qui peut te battre sur ce board ?'}
          </p>
        </div>
      );
  }
}

export function DrillView() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [pack, setPack] = useState<DrillPack>('potOdds');
  const [drillMode, setDrillMode] = useState<Mode>('serie');
  const [question, setQuestion] = useState<DrillQuestion | null>(null);
  const [grade, setGrade] = useState<DrillGrade | null>(null);
  const [numInput, setNumInput] = useState('');
  const [results, setResults] = useState<{ ok: boolean; ms: number }[]>([]);
  const [stats, setStats] = useState<DrillStats>({});
  const [sprintEnd, setSprintEnd] = useState<number | null>(null);
  const questionStart = useRef(0);
  // Spot suivant prégénéré pendant que l'utilisateur répond (l'énumération exacte
  // de « Qu'est-ce qui me bat ? » ne bloque donc pas la transition).
  const prefetched = useRef<{ pack: DrillPack; q: DrillQuestion } | null>(null);

  useEffect(() => setStats(loadDrillStats()), []);

  const newQuestion = useCallback((currentPack: DrillPack, usePrefetch = false) => {
    const ready =
      usePrefetch && prefetched.current?.pack === currentPack ? prefetched.current.q : null;
    prefetched.current = null;
    setQuestion(ready ?? generateDrill(currentPack, Math.random));
    setGrade(null);
    setNumInput('');
    setPhase('question');
    questionStart.current = performance.now();
  }, []);

  const start = (selected: DrillPack, selectedMode: Mode) => {
    setPack(selected);
    setDrillMode(selectedMode);
    setResults([]);
    setSprintEnd(selectedMode === 'sprint' ? performance.now() + SPRINT_MS : null);
    newQuestion(selected);
  };

  const submit = useCallback(
    (answer: number | boolean | string) => {
      if (!question || phase !== 'question') return;
      const elapsed = Math.round(performance.now() - questionStart.current);
      const graded = gradeDrill(question, answer);
      setGrade(graded);
      setResults((r) => [...r, { ok: graded.ok, ms: elapsed }]);
      setStats((s) => recordDrillResult(s, question.kind, graded.ok, elapsed));
      recordProgress({ drillAttempts: 1, drillCorrect: graded.ok ? 1 : 0 });
      setPhase('feedback');
    },
    [question, phase],
  );

  const next = useCallback(() => {
    const count = results.length;
    const sprintOver = sprintEnd !== null && performance.now() >= sprintEnd;
    const serieOver = sprintEnd === null && count >= SERIES_LENGTH;
    if (sprintOver || serieOver) setPhase('finished');
    else newQuestion(pack, true);
  }, [results.length, sprintEnd, pack, newQuestion]);

  // Pendant le feedback, on prégénère le spot suivant (hors du chemin d'affichage).
  useEffect(() => {
    if (phase !== 'feedback') return;
    const timer = setTimeout(() => {
      prefetched.current = { pack, q: generateDrill(pack, Math.random) };
    }, 0);
    return () => clearTimeout(timer);
  }, [phase, pack]);

  // Le sprint enchaîne tout seul après un court feedback.
  useEffect(() => {
    if (phase !== 'feedback' || sprintEnd === null) return;
    const timer = setTimeout(next, 800);
    return () => clearTimeout(timer);
  }, [phase, sprintEnd, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ignore le key-repeat : Entrée maintenue depuis l'input sauterait la correction.
      if (event.repeat) return;
      if (phase === 'feedback' && event.key === 'Enter' && sprintEnd === null) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, next, sprintEnd]);

  const needsPctInput =
    question?.kind === 'potOdds' ||
    question?.kind === 'sizeFlash' ||
    question?.kind === 'equity' ||
    (question?.kind === 'betSize' && question.variant === 'bluff');
  const needsBBInput =
    question?.kind === 'betSize' &&
    (question.variant === 'amount' || question.variant === 'open' || question.variant === 'threebet');
  const correct = results.filter((r) => r.ok).length;
  const medianMs = median(results.map((r) => r.ms));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-4">
      <header className="text-sm">
        <h1 className="text-lg font-bold">Drill — automatismes</h1>
      </header>

      {phase === 'menu' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Des séries courtes de spots isolés : 10 à 20 fois plus de répétitions du calcul
            qu'en jouant des mains. Série de {SERIES_LENGTH}, ou sprint de 2 minutes.
          </p>
          <ProgressSection />
          {PACKS.map((p) => {
            const s = p.key !== 'mixed' ? stats[p.key] : null;
            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-neutral-900/70"
              >
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.label}
                    {p.key !== 'mixed' && (
                      <MasteryBadge kind={p.key as DrillKind} stats={s ?? undefined} />
                    )}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.description}</p>
                  {s && s.attempts > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      {Math.round((s.correct / s.attempts) * 100)} % de réussite ·{' '}
                      {s.times.length > 0 ? `${((median(s.times) ?? 0) / 1000).toFixed(1)} s` : ''}{' '}
                      · {s.attempts} réponses · cible ≤{' '}
                      {(p.key !== 'mixed' ? TARGET_MS[p.key] : 0) / 1000} s
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => start(p.key, 'serie')}
                    className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Série
                  </button>
                  <button
                    type="button"
                    onClick={() => start(p.key, 'sprint')}
                    className="rounded-md bg-neutral-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                  >
                    Sprint 2 min
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(phase === 'question' || phase === 'feedback') && question && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              {PACKS.find((p) => p.key === pack)?.label} ·{' '}
              {drillMode === 'sprint'
                ? 'Sprint 2 min'
                : `Question ${results.length + (phase === 'question' ? 1 : 0)}/${SERIES_LENGTH}`}
            </span>
            <span>
              {correct}/{results.length} ✓
            </span>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-black/10 bg-white/70 p-5 text-center dark:border-white/10 dark:bg-neutral-900/70">
            <QuestionPrompt question={question} />

            {phase === 'question' && (
              <>
                {needsPctInput && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {PCT_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => submit(chip)}
                          className="rounded-md bg-neutral-200 px-3 py-2 text-sm font-semibold hover:bg-amber-300 dark:bg-neutral-700 dark:hover:bg-amber-500"
                        >
                          {chip} %
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        autoFocus
                        placeholder="libre"
                        value={numInput}
                        onChange={(e) => setNumInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && numInput !== '') submit(Number(numInput));
                        }}
                        className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm dark:border-neutral-600 dark:bg-neutral-800"
                      />
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                )}
                {needsBBInput && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      step="0.5"
                      placeholder="taille"
                      value={numInput}
                      onChange={(e) => setNumInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && numInput !== '') submit(Number(numInput));
                      }}
                      className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm dark:border-neutral-600 dark:bg-neutral-800"
                    />
                    <span className="text-sm text-neutral-500">BB</span>
                    <button
                      type="button"
                      disabled={numInput === ''}
                      onClick={() => submit(Number(numInput))}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Valider
                    </button>
                  </div>
                )}
                {question.kind === 'betSize' && question.variant === 'fraction' && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {question.options.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => submit(label)}
                        className="rounded-md bg-neutral-200 px-3 py-2 text-sm font-semibold hover:bg-amber-300 dark:bg-neutral-700 dark:hover:bg-amber-500"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {question.kind === 'outs' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      placeholder="outs"
                      value={numInput}
                      onChange={(e) => setNumInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && numInput !== '') submit(Number(numInput));
                      }}
                      className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm dark:border-neutral-600 dark:bg-neutral-800"
                    />
                    <button
                      type="button"
                      disabled={numInput === ''}
                      onClick={() => submit(Number(numInput))}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Valider
                    </button>
                  </div>
                )}
                {(question.kind === 'openRange' || question.kind === 'pushFold') && (
                  <div className="grid w-full max-w-xs grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => submit(false)}
                      className="rounded-lg bg-red-600 px-3 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Je jette
                    </button>
                    <button
                      type="button"
                      onClick={() => submit(true)}
                      className="rounded-lg bg-emerald-600 px-3 py-3 font-semibold text-white hover:bg-emerald-700"
                    >
                      {question.kind === 'pushFold'
                        ? question.mode === 'push'
                          ? 'Push (tapis)'
                          : 'Je paye'
                        : 'J’ouvre'}
                    </button>
                  </div>
                )}
                {question.kind === 'handReading' && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {question.q.options.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => submit(cat)}
                        className="rounded-md bg-neutral-200 px-3 py-2 text-sm font-semibold hover:bg-emerald-300 dark:bg-neutral-700 dark:hover:bg-emerald-600"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {phase === 'feedback' && grade && (
              <div className="flex flex-col items-center gap-2">
                <p
                  className={`text-lg font-bold ${grade.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {grade.ok ? '✓' : '✗'} {grade.actualText}
                </p>
                {question.kind === 'outs' && question.outs.length > 0 && (
                  <div className="flex max-w-sm flex-wrap justify-center gap-1">
                    {question.outs.map((c) => (
                      <CardView key={c} card={c} size="sm" />
                    ))}
                  </div>
                )}
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{grade.explain}</p>
                {sprintEnd === null && (
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
                  >
                    Suivant (Entrée)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-black/10 bg-white/70 p-6 text-center dark:border-white/10 dark:bg-neutral-900/70">
          <p className="text-2xl font-bold">
            {correct}/{results.length}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {Math.round((correct / Math.max(1, results.length)) * 100)} % de réussite
            {medianMs !== null ? ` · ${(medianMs / 1000).toFixed(1)} s par réponse (médiane)` : ''}
            {pack !== 'mixed' && TARGET_MS[pack]
              ? ` · ${results.filter((r) => r.ok && r.ms <= TARGET_MS[pack]).length} réponses « automatiques » (justes en ≤ ${TARGET_MS[pack] / 1000} s)`
              : ''}
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            🟢 automatique = ≥ 90 % de réussite ET médiane sous la cible, sur tes 50 dernières
            réponses.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => start(pack, drillMode)}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
            >
              Rejouer
            </button>
            <button
              type="button"
              onClick={() => setPhase('menu')}
              className="rounded-lg bg-neutral-200 px-4 py-2.5 font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              Menu
            </button>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-600">
        Montants en BB. Tolérances : ±5 pts (cote, équité), ±2 pts (flash), ±1 out.
      </p>
    </main>
  );
}
