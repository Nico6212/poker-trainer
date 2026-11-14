'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '@/lib/poker/cards';
import { buildCalibration } from '@/lib/poker/import/calibration';
import { classifyHand, type Mistake } from '@/lib/poker/import/classify-mistake';
import { clearImport, loadAllinCache, saveAllinEvals, saveImport } from '@/lib/poker/import/db';
import { rakeByLimit, rakeSummary } from '@/lib/poker/import/rake';
import { parsePokerStars, skipLabel, type ParsedHand, type SkipReason } from '@/lib/poker/import/parse-pokerstars';
import { buildSessions, nlLabel, tablesComparison, type Session } from '@/lib/poker/import/sessions';
import { winrateCIByLimit, SIGMAS, DEFAULT_SIGMA, MIN_SAMPLE } from '@/lib/poker/confidence';
import { bankrollByLimit, recommendedMaxStake } from '@/lib/poker/bankroll';
import {
  aggregateAllin,
  evalQualified,
  qualifyAllin,
  type AllinLuck,
  type HandEval,
} from '@/lib/poker/import/allin-adjust';

const RAKEBACK_KEY = 'poker-rakeback';
const SIGMA_KEY = 'poker-sigma';
const BANKROLL_KEY = 'poker-bankroll-eur';
// Format français : virgule décimale, signe moins typographique, pas de « + ».
const frEur = (cents: number) => `${cents < 0 ? '−' : ''}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`;
const frBB100 = (x: number) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')} BB/100`;

const MISTAKE_LABELS: Record<Mistake['type'], string> = {
  'open-limp': 'Open-limp',
  'open-size': 'Taille d’ouverture',
  'small-3bet': '3-bet trop petit',
  '4bet-call': 'Call de 4-bet',
  'call-sans-cote': 'Call sans la cote',
  'call-raise-faible': 'Call d’une relance (main faible)',
  'fold-avec-cote': 'Fold avec la cote',
  'jam-main-moyenne': 'Tapis avec une main moyenne',
};

const euros = (cents: number) => `${cents >= 0 ? '+' : ''}${(cents / 100).toFixed(2)} €`;
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);

/** Laisse le navigateur respirer entre deux lots de classification (équité Monte-Carlo). */
const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

/** Aide ciblée quand aucune main valide n'a été importée, selon la raison du rejet. */
function importHelp(skipped: Partial<Record<SkipReason, number>>): {
  title: string;
  body: string;
  cta: string;
  href: string;
} {
  if (skipped.french) {
    return {
      title: '⚠ Tes fichiers sont en français',
      body: 'L’outil ne lit que l’anglais pour l’instant. Active « Sauvegarder en anglais » dans PokerStars — les mains déjà jouées resteront en français.',
      cta: 'Voir l’étape 1',
      href: '/aide/import#anglais',
    };
  }
  if (skipped.tournament) {
    return {
      title: 'Ce sont des tournois / Spin & Go',
      body: 'Pas encore pris en charge : seul le cash game est géré pour l’instant.',
      cta: 'Ce qui est pris en charge',
      href: '/aide/import#supporte',
    };
  }
  if (skipped.notHoldem) {
    return {
      title: 'Variante non Hold’em détectée',
      body: 'Seul le Hold’em No Limit est géré.',
      cta: 'Ce qui est pris en charge',
      href: '/aide/import#supporte',
    };
  }
  return {
    title: 'Aucune main PokerStars reconnue',
    body: 'Mauvais dossier ? Les fichiers doivent commencer par « HH… » et être des .txt PokerStars (cash, anglais).',
    cta: 'Comment trouver mes fichiers ?',
    href: '/aide/import#trouver',
  };
}

export function ImportView() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [hands, setHands] = useState<ParsedHand[]>([]);
  const [rakeback, setRakeback] = useState(0); // % de rakeback (0-100)
  const [sigma, setSigma] = useState<number>(DEFAULT_SIGMA);
  const [bankrollEur, setBankrollEur] = useState('');
  const [summary, setSummary] = useState<{
    hands: number;
    newHands: number;
    duplicates: number;
    skipped: Partial<Record<SkipReason, number>>;
  } | null>(null);

  useEffect(() => {
    try {
      const rb = window.localStorage.getItem(RAKEBACK_KEY);
      if (rb !== null) setRakeback(Math.min(100, Math.max(0, Number(rb) || 0)));
      const sg = window.localStorage.getItem(SIGMA_KEY);
      if (sg !== null && SIGMAS.includes(Number(sg) as (typeof SIGMAS)[number])) setSigma(Number(sg));
      const bk = window.localStorage.getItem(BANKROLL_KEY);
      if (bk !== null) setBankrollEur(bk);
    } catch {
      // stockage indisponible
    }
  }, []);

  const rb = rakeback / 100;
  const handById = useMemo(() => new Map(hands.map((h) => [h.id, h])), [hands]);
  const rake = useMemo(() => (hands.length ? rakeSummary(hands, rb) : null), [hands, rb]);
  const rakePerLimit = useMemo(() => rakeByLimit(hands, rb), [hands, rb]);
  const netCents = useMemo(() => hands.reduce((s, h) => s + h.heroNet, 0), [hands]);
  const ciByLimit = useMemo(() => winrateCIByLimit(hands, sigma), [hands, sigma]);
  const tables = useMemo(() => (hands.length ? tablesComparison(hands, sigma) : null), [hands, sigma]);

  // All-in ajusté : coûteux (Monte-Carlo préflop) → calcul asynchrone chunké, non bloquant.
  const [allin, setAllin] = useState<AllinLuck | null>(null);
  const [allinProgress, setAllinProgress] = useState<string | null>(null);
  useEffect(() => {
    setAllin(null);
    if (hands.length === 0) {
      setAllinProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAllinProgress('Chance all-in…');
      // Cache par id de main : on ne (re)calcule que les nouveaux tapis.
      const cache = await loadAllinCache();
      const evals: HandEval[] = [];
      const toCompute: { hand: ParsedHand; q: { villain: [Card, Card]; board: Card[] } }[] = [];
      let skipped = 0;
      for (const h of hands) {
        const cached = cache.get(h.id);
        if (cached) {
          evals.push(cached);
          continue;
        }
        const q = qualifyAllin(h);
        if (q === 'skip') skipped += 1;
        else if (q !== null) toCompute.push({ hand: h, q });
      }
      const fresh: ({ id: string } & HandEval)[] = [];
      for (let i = 0; i < toCompute.length; i++) {
        if (cancelled) return;
        const { hand, q } = toCompute[i];
        const e = evalQualified(hand, q);
        evals.push(e);
        fresh.push({ id: hand.id, ...e });
        setAllinProgress(`Nouveaux tapis… ${i + 1}/${toCompute.length}`);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (cancelled) return;
      await saveAllinEvals(fresh);
      setAllin(aggregateAllin(evals, skipped));
      setAllinProgress(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [hands]);
  const bankrollCents = useMemo(() => {
    const v = Number(bankrollEur.replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  }, [bankrollEur]);
  const bankrollLimits = useMemo(
    () => (bankrollCents > 0 ? bankrollByLimit(bankrollCents, [...new Set(hands.map((h) => h.bb))]) : []),
    [bankrollCents, hands],
  );

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setSessions(null);
    setSummary(null);
    try {
      setProgress('Lecture des fichiers…');
      const texts = await Promise.all([...files].map((f) => f.text()));
      const hands: ParsedHand[] = [];
      const skipped: Partial<Record<SkipReason, number>> = {};
      for (const text of texts) {
        const res = parsePokerStars(text);
        hands.push(...res.hands);
        for (const s of res.skipped) skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
      }

      // Dédoublonnage par numéro avant analyse.
      const unique = new Map(hands.map((h) => [h.id, h]));
      const uniqueHands = [...unique.values()];

      // Calibration des ranges sur les abattages observés (toutes les mains importées).
      const calibration = buildCalibration(uniqueHands);
      const mistakes: Mistake[] = [];
      for (let i = 0; i < uniqueHands.length; i++) {
        mistakes.push(...classifyHand(uniqueHands[i], calibration));
        if (i % 10 === 0) {
          setProgress(`Analyse des mains… ${i + 1}/${uniqueHands.length}`);
          await yieldToUI();
        }
      }

      setProgress('Enregistrement…');
      const { newHands, duplicates } = await saveImport(uniqueHands, mistakes);

      setSummary({ hands: uniqueHands.length, newHands, duplicates, skipped });
      setSessions(buildSessions(uniqueHands, mistakes));
      setHands(uniqueHands);
    } catch (error) {
      console.error(error);
      setProgress('Erreur de lecture. Vérifie que ce sont bien des .txt PokerStars (anglais).');
      return;
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-3 sm:p-4">
      <header className="text-sm">
        <h1 className="text-lg font-bold">Import PokerStars</h1>
      </header>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Glisse tes fichiers d’historique (plusieurs à la fois). Tout est analysé{' '}
        <strong>dans ton navigateur</strong> : rien n’est envoyé nulle part. Les erreurs
        alimentent le paquet « Mes erreurs » du Drill.
      </p>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-white/60 p-8 text-center hover:border-emerald-500 dark:border-neutral-600 dark:bg-neutral-900/60"
      >
        <span className="text-sm font-semibold">Dépose tes .txt ici, ou clique pour choisir</span>
        <span className="text-xs text-neutral-400">Une journée = 4 à 8 fichiers, tu peux tout déposer d’un coup</span>
        <input
          type="file"
          accept=".txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={busy}
        />
      </label>

      <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
        Tu ne trouves pas tes fichiers ?{' '}
        <Link
          href="/aide/import#trouver"
          className="font-semibold text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
        >
          Comment trouver mes fichiers ?
        </Link>
      </p>

      {progress && <p className="text-sm text-sky-700 dark:text-sky-300">{progress}</p>}

      {summary && summary.hands === 0 ? (
        (() => {
          const help = importHelp(summary.skipped);
          return (
            <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-950/30">
              <p className="font-semibold text-amber-900 dark:text-amber-200">{help.title}</p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">{help.body}</p>
              <Link
                href={help.href}
                className="mt-2 inline-block rounded-md border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                {help.cta} →
              </Link>
            </div>
          );
        })()
      ) : summary ? (
        <div className="rounded-xl border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-neutral-900/70">
          <p>
            <strong>{summary.newHands}</strong> nouvelles mains importées
            {summary.duplicates > 0 ? `, ${summary.duplicates} déjà connues` : ''}.
          </p>
          {Object.keys(summary.skipped).length > 0 && (
            <ul className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {Object.entries(summary.skipped).map(([reason, n]) => (
                <li key={reason}>
                  {n} ignorée{n! > 1 ? 's' : ''} — {skipLabel(reason as SkipReason)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {rake && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm dark:border-amber-500/20 dark:bg-amber-950/20">
          <h2 className="font-bold">Rake prélevé par le site</h2>
          <p>
            Le site t’a pris <strong>{frEur(rake.rakeCents)}</strong>. Sans rake, tu serais à{' '}
            <strong>{frEur(netCents + rake.rakeCents)}</strong> au lieu de <strong>{frEur(netCents)}</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              Rakeback :
              <input
                type="number"
                min={0}
                max={100}
                value={rakeback}
                onChange={(e) => {
                  const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                  setRakeback(v);
                  try {
                    window.localStorage.setItem(RAKEBACK_KEY, String(v));
                  } catch {
                    // quota / indisponible
                  }
                }}
                className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right dark:border-neutral-600 dark:bg-neutral-800"
              />
              %
            </label>
            {rakeback > 0 && (
              <span className="text-neutral-600 dark:text-neutral-300">
                → tu récupères {frEur(rake.rakebackCents)}, net ajusté{' '}
                <strong>{frEur(netCents + rake.rakebackCents)}</strong>
              </span>
            )}
          </div>

          {rakePerLimit.length > 1 && (
            <ul className="flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-300">
              {rakePerLimit.map(({ bb, summary: r }) => (
                <li key={bb}>
                  {nlLabel(bb)} : {r.hands} mains · rake {frEur(r.rakeCents)} ({frBB100(r.rakeBB100)}) · net{' '}
                  {frBB100(r.netBB100)} / brut {frBB100(r.grossBB100)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Rake « contribué » = rake × ta part investie du pot (÷ total pot). Méthode principale.
          </p>
        </div>
      )}

      {hands.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-neutral-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Chance ou compétence ?</h2>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              Écart-type :
              {SIGMAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSigma(s);
                    try {
                      window.localStorage.setItem(SIGMA_KEY, String(s));
                    } catch {
                      // indisponible
                    }
                  }}
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    sigma === s
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </label>
          </div>

          {ciByLimit.map((ci) =>
            ci.tooSmall ? (
              <p key={ci.bb} className="text-xs text-neutral-500 dark:text-neutral-400">
                <strong>{nlLabel(ci.bb)}</strong> : échantillon trop petit pour conclure ({ci.hands} mains, il
                en faut {MIN_SAMPLE}).
              </p>
            ) : (
              <div key={ci.bb} className="flex flex-col gap-1">
                <p>
                  <strong>{nlLabel(ci.bb)}</strong> — winrate {frBB100(ci.netBB100)}. Ton vrai niveau est
                  probablement entre <strong>{frBB100(ci.lowBB100!)}</strong> et{' '}
                  <strong>{frBB100(ci.highBB100!)}</strong>.{' '}
                  {ci.probWinning! < 0.5 ? 'Tu es probablement perdant' : 'Tu es probablement gagnant'} (
                  {ci.probWinning! < 0.001
                    ? 'P < 0,1 %'
                    : `P ≈ ${(ci.probWinning! * 100).toFixed(1).replace('.', ',')} %`}
                  ).
                </p>
                {(() => {
                  const lo = ci.lowBB100!;
                  const hi = ci.highBB100!;
                  const span = hi - lo || 1;
                  const pos = (x: number) => Math.max(0, Math.min(100, ((x - lo) / span) * 100));
                  return (
                    <div className="relative h-2 rounded bg-neutral-200 dark:bg-neutral-700">
                      {lo < 0 && hi > 0 && (
                        <span className="absolute top-[-2px] h-3 w-px bg-neutral-500" style={{ left: `${pos(0)}%` }} />
                      )}
                      <span
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900"
                        style={{ left: `${pos(ci.grossBB100)}%` }}
                        title={`brut ${frBB100(ci.grossBB100)}`}
                      />
                      <span
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900"
                        style={{ left: `${pos(ci.netBB100)}%` }}
                        title={`net ${frBB100(ci.netBB100)}`}
                      />
                    </div>
                  );
                })()}
                <p className="text-[11px] text-neutral-400">
                  ● net ● <span className="text-emerald-600 dark:text-emerald-400">brut</span> · 0 = seuil ·
                  mains pour ±10 BB/100 : {ci.handsForMargin10.toLocaleString('fr-FR')}
                </p>
              </div>
            ),
          )}

          {allinProgress && <p className="text-xs text-sky-700 dark:text-sky-300">{allinProgress}</p>}

          {allin && allin.hands > 0 && (
            <div className="text-xs text-neutral-600 dark:text-neutral-300">
              <p>
                <strong>Résultat ajusté à l’all-in</strong> : {allin.hands} tapis à cartes connues · chance
                totale <strong>{frEur(allin.luckCents)}</strong>{' '}
                {allin.luckCents >= 0 ? '(tu as sur-performé l’espérance)' : '(tu as sous-performé)'}
                {allin.skipped > 0 ? ` · ${allin.skipped} ignorés (multiway/side pot)` : ''}.
              </p>
              {allin.byLimit.length > 0 && (
                <ul className="mt-0.5 text-neutral-500 dark:text-neutral-400">
                  {allin.byLimit.map((l) => {
                    const ci = ciByLimit.find((c) => c.bb === l.bb);
                    const adjusted =
                      ci && ci.hands > 0 ? ci.netBB100 - ((l.luckCents / l.bb) / ci.hands) * 100 : null;
                    return (
                      <li key={l.bb}>
                        {nlLabel(l.bb)} : chance {frBB100(l.luckBB100)} sur {l.hands} tapis
                        {adjusted !== null ? ` · winrate ajusté à l’all-in ${frBB100(adjusted)}` : ''}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tables && (tables.few.hands > 0 || tables.many.hands > 0) && (
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              <strong>Tables simultanées</strong> :{' '}
              {tables.comparable ? (
                <>
                  1-2 tables → {tables.few.hands} mains, {frBB100(tables.few.netBB100)} · 3+ tables →{' '}
                  {tables.many.hands} mains, {frBB100(tables.many.netBB100)}.{' '}
                  {tables.significant
                    ? `Le multitabling change ton winrate de ${frBB100(tables.diffBB100)} (significatif).`
                    : `Écart de ${frBB100(tables.diffBB100)}, pas encore significatif (marge ±${tables.marginBB100
                        .toFixed(0)
                        .replace('.', ',')}).`}
                </>
              ) : (
                <>
                  trop peu de mains pour comparer (1-2 : {tables.few.hands} · 3+ : {tables.many.hands}, il en
                  faut {MIN_SAMPLE} de chaque côté).
                </>
              )}
            </p>
          )}
        </section>
      )}

      {hands.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-neutral-900/70">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">Bankroll</h2>
            <label className="flex items-center gap-1.5 text-xs">
              Ma bankroll :
              <input
                inputMode="decimal"
                value={bankrollEur}
                placeholder="19"
                onChange={(e) => {
                  setBankrollEur(e.target.value);
                  try {
                    window.localStorage.setItem(BANKROLL_KEY, e.target.value);
                  } catch {
                    // indisponible
                  }
                }}
                className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right dark:border-neutral-600 dark:bg-neutral-800"
              />
              €
            </label>
          </div>
          {bankrollCents > 0 ? (
            <>
              <ul className="flex flex-col gap-0.5 text-xs">
                {bankrollLimits.map(({ bb, caves, underMin }) => (
                  <li key={bb} className={underMin ? 'text-red-600 dark:text-red-400' : ''}>
                    {nlLabel(bb)} : {caves.toFixed(1).replace('.', ',')} caves
                    {underMin ? ' ⚠ sous le seuil de 20 caves' : ''}
                  </li>
                ))}
              </ul>
              {(() => {
                const r = recommendedMaxStake(bankrollCents);
                return (
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    {r.bb !== null
                      ? `Limite max conseillée (30 caves) : ${nlLabel(r.bb)}.`
                      : `Pas encore 30 caves pour NL2 : il te faut ${frEur(r.neededCentsForNL2)}.`}
                  </p>
                );
              })()}
            </>
          ) : (
            <p className="text-xs text-neutral-400">
              Saisis ta bankroll (elle n’est pas déduite des mains : dépôts et retraits manquent) pour voir tes
              caves par limite.
            </p>
          )}
        </section>
      )}

      {sessions &&
        sessions.map((session, i) => {
          const sHands = session.handIds.map((id) => handById.get(id)).filter((h): h is ParsedHand => !!h);
          const sRake = sHands.length ? rakeSummary(sHands, rb) : null;
          const s = session.stats;
          const errors = Object.entries(s.errorCounts).filter(([, n]) => n > 0);
          return (
            <section
              key={i}
              className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-neutral-900/70"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex flex-wrap items-center gap-1.5 font-bold">
                  <span>
                    {session.day} · {s.hands} mains
                    {s.maxTables > 1 ? ` · ${s.maxTables} tables` : ''}
                  </span>
                  {s.limits.map((limit) => (
                    <span
                      key={limit}
                      className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                    >
                      {limit}
                    </span>
                  ))}
                  {session.aboveUsual && (
                    <span
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                      title="Session jouée à une limite supérieure à ta limite habituelle"
                    >
                      ⚠ limite au-dessus de l’habitude
                    </span>
                  )}
                </h2>
                <span className={`font-semibold ${s.netCents >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {euros(s.netCents)} · {s.bb100 >= 0 ? '+' : ''}
                  {s.bb100.toFixed(1)} BB/100
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                VPIP {pct(s.vpip)} · PFR {pct(s.pfr)} · 3-bet {pct(s.threeBet)}
              </p>
              {sRake && sRake.rakeCents > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Rake {frEur(sRake.rakeCents)} ({frBB100(sRake.rakeBB100)}) · brut {frBB100(sRake.grossBB100)}
                </p>
              )}
              {errors.length === 0 ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  ✓ Pas d’erreur détectée sur cette session.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {errors.map(([type, n]) => (
                    <li
                      key={type}
                      className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    >
                      {MISTAKE_LABELS[type as Mistake['type']]} × {n}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

      {summary && (
        <button
          type="button"
          onClick={async () => {
            if (confirm('Effacer toutes les mains importées et les erreurs ?')) {
              await clearImport();
              setSessions(null);
              setSummary(null);
              setHands([]);
            }
          }}
          className="self-start text-xs text-neutral-400 underline hover:text-neutral-600"
        >
          Effacer les données importées
        </button>
      )}

      <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-600">
        Analyse 100 % locale · aucune donnée envoyée · active l’historique en anglais dans PokerStars.
      </p>
    </main>
  );
}
