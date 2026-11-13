'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { classifyHand, type Mistake } from '@/lib/poker/import/classify-mistake';
import { clearImport, saveImport } from '@/lib/poker/import/db';
import { parsePokerStars, skipLabel, type ParsedHand, type SkipReason } from '@/lib/poker/import/parse-pokerstars';
import { buildSessions, type Session } from '@/lib/poker/import/sessions';

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

export function ImportView() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [summary, setSummary] = useState<{
    hands: number;
    newHands: number;
    duplicates: number;
    skipped: Partial<Record<SkipReason, number>>;
  } | null>(null);

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
      <header className="flex items-center justify-between text-sm">
        <h1 className="text-lg font-bold">Import PokerStars</h1>
        <div className="flex gap-2">
          <Link
            href="/mes-erreurs"
            className="rounded-md border border-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Mes erreurs
          </Link>
          <Link
            href="/"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            ← Table
          </Link>
        </div>
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

      {progress && <p className="text-sm text-sky-700 dark:text-sky-300">{progress}</p>}

      {summary && (
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
      )}

      {sessions &&
        sessions.map((session, i) => {
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
