'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BackupButtons } from '@/components/BackupButtons';
import { SiteNav } from '@/components/SiteNav';
import { countImport } from '@/lib/poker/import/db';

// Accueil : présente l'outil en 30 secondes et oriente vers les 3 usages.
// Si l'utilisateur a déjà des données locales, on lui propose de reprendre.

const BLOCKS = [
  {
    icon: '♠',
    title: 'S’entraîner à la table',
    body: 'Joue contre des bots avec la cote du pot et l’équité affichées. Mode examen pour te tester.',
    cta: 'Ouvrir la table',
    href: '/table',
  },
  {
    icon: '⚡',
    title: 'Drills de 2 minutes',
    body: 'Cote du pot, outs, ranges, « Qu’est-ce qui me bat ? » : des séries courtes pour ancrer les réflexes.',
    cta: 'Lancer un drill',
    href: '/drill',
  },
  {
    icon: '📊',
    title: 'Analyser mes mains',
    body: 'Importe tes historiques PokerStars, repère tes vraies erreurs et rejoue-les une par une.',
    cta: 'Importer mes mains',
    href: '/import',
  },
];

export default function Home() {
  const [resume, setResume] = useState<{ label: string; href: string } | null>(null);

  useEffect(() => {
    // Priorité au jeu/drill (localStorage) ; sinon, aux mains importées (IndexedDB).
    let hasLocal = false;
    try {
      hasLocal = Object.keys(localStorage).some((k) => k.startsWith('poker-'));
    } catch {
      // stockage indisponible
    }
    if (hasLocal) {
      setResume({ label: 'Reprendre ta séance du jour', href: '/table' });
      return;
    }
    countImport()
      .then(({ hands, mistakes }) => {
        if (mistakes > 0) setResume({ label: 'Revoir mes erreurs', href: '/mes-erreurs' });
        else if (hands > 0) setResume({ label: 'Revoir mes mains importées', href: '/import' });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <SiteNav />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
        {/* Reprendre (visiteurs connus) */}
        {resume && (
          <Link
            href={resume.href}
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 transition hover:bg-emerald-500/15"
          >
            <span className="text-sm">
              <span className="font-semibold text-emerald-300">Content de te revoir.</span>{' '}
              <span className="text-slate-300">{resume.label}</span>
            </span>
            <span className="text-emerald-300">→</span>
          </Link>
        )}

        {/* Hero */}
        <div>
          <h1 className="text-2xl font-bold leading-tight text-slate-100 sm:text-3xl">
            Crée tes automatismes de calcul au poker
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            Cote du pot, outs, équité — et repère tes vraies erreurs à partir de tes mains PokerStars.
            Gratuit, sans inscription, sans argent réel.
          </p>
        </div>

        {/* 3 blocs */}
        <div className="grid gap-4 sm:grid-cols-3">
          {BLOCKS.map((b) => (
            <div
              key={b.title}
              className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-lg text-emerald-300">
                {b.icon}
              </span>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-100">{b.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{b.body}</p>
              </div>
              <Link
                href={b.href}
                className="rounded-lg border-b-4 border-emerald-800 bg-emerald-600 px-3 py-2 text-center text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-emerald-500 active:translate-y-1 active:border-b-0"
              >
                {b.cta} →
              </Link>
            </div>
          ))}
        </div>

        {/* Bandeau confiance + sauvegarde */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-center text-sm text-slate-400">
          <p>
            Gratuit, sans inscription, sans argent réel.{' '}
            <span className="text-slate-300">Tes données restent dans ton navigateur.</span>
          </p>
          <BackupButtons />
          <p className="text-xs text-slate-500">
            Pas de compte : exporte ta progression pour changer d’appareil.{' '}
            <Link href="/confidentialite" className="text-emerald-400 underline">
              En savoir plus
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
