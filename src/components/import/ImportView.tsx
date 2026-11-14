'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyHand, type Mistake } from '@/lib/poker/import/classify-mistake';
import { clearImport, saveImport } from '@/lib/poker/import/db';
import { rakeByLimit, rakeSummary } from '@/lib/poker/import/rake';
import { parsePokerStars, skipLabel, type ParsedHand, type SkipReason } from '@/lib/poker/import/parse-pokerstars';
import { buildSessions, nlLabel, type Session } from '@/lib/poker/import/sessions';

const RAKEBACK_KEY = 'poker-rakeback';
const bb100 = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)} BB/100`;

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
  const [summary, setSummary] = useState<{
    hands: number;
    newHands: number;
    duplicates: number;
    skipped: Partial<Record<SkipReason, number>>;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RAKEBACK_KEY);
      if (raw !== null) setRakeback(Math.min(100, Math.max(0, Number(raw) || 0)));
    } catch {
      // stockage indisponible
    }
  }, []);

  const rb = rakeback / 100;
  const handById = useMemo(() => new Map(hands.map((h) => [h.id, h])), [hands]);
  const rake = useMemo(() => (hands.length ? rakeSummary(hands, rb) : null), [hands, rb]);
  const rakePerLimit = useMemo(() => rakeByLimit(hands, rb), [hands, rb]);

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

      const mistakes: Mistake[] = [];
      for (let i = 0; i < uniqueHands.length; i++) {
        mistakes.push(...classifyHand(uniqueHands[i]));
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
            Le site t’a pris <strong>{euros(rake.rakeCents).replace('+', '')}</strong> ({bb100(rake.rakeBB100)}).
            Sans rake, tu serais à <strong>{bb100(rake.grossBB100)}</strong> (brut) au lieu de{' '}
            <strong>{bb100(rake.netBB100)}</strong> (net).
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
                → tu récupères {euros(rake.rakebackCents).replace('+', '')}, net ajusté{' '}
                <strong>{bb100(rake.adjustedBB100)}</strong>
              </span>
            )}
          </div>

          {rakePerLimit.length > 1 && (
            <ul className="flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-300">
              {rakePerLimit.map(({ bb, summary: r }) => (
                <li key={bb}>
                  {nlLabel(bb)} : {r.hands} mains · rake {euros(r.rakeCents).replace('+', '')} ({bb100(r.rakeBB100)})
                  · net {bb100(r.netBB100)} / brut {bb100(r.grossBB100)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Rake « contribué » = rake × ta part investie du pot. Méthode principale.
          </p>
        </div>
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
                  Rake {euros(sRake.rakeCents).replace('+', '')} ({bb100(sRake.rakeBB100)}) · brut{' '}
                  {bb100(sRake.grossBB100)}
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
