'use client';

import Link from 'next/link';
import { useState } from 'react';

// Prototype visuel (maquette) de l'écran Drill, look « GTO solver » dark, responsive.
// Données mockées, non branché au moteur. Route isolée /apercu/drill.

const NAV = [
  { label: 'Table', href: '/apercu' },
  { label: 'Drill', href: '/apercu/drill' },
  { label: 'Import', href: '/import' },
  { label: 'Mes erreurs', href: '/mes-erreurs' },
  { label: 'Aide', href: '#' },
];

const PACKS = ['Cote du pot', 'Outs', 'Équité', 'Ranges', 'Qui me bat ?'];

const OPTIONS = [
  { label: '20 %', correct: true },
  { label: '25 %', correct: false },
  { label: '29 %', correct: false },
  { label: '33 %', correct: false },
];

const MASTERY = [
  { pack: 'Cote du pot', level: 'Acquis', tone: 'acquired' as const },
  { pack: 'Outs', level: 'En progrès', tone: 'progress' as const },
  { pack: 'Ranges', level: 'À travailler', tone: 'todo' as const },
  { pack: 'Équité', level: 'Pas testé', tone: 'none' as const },
];

const TONE: Record<string, string> = {
  acquired: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  progress: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  todo: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  none: 'bg-slate-700/30 text-slate-400 ring-slate-600/40',
};

export default function ApercuDrillPage() {
  const [pack, setPack] = useState('Cote du pot');
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">♠</span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:inline">Poker Trainer</span>
        </div>
        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`shrink-0 rounded-md px-2.5 py-1 font-medium transition ${
                item.label === 'Drill'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-6">
        {/* Sélecteur de paquet */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PACKS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPack(p);
                setPicked(null);
                setRevealed(false);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                p === pack
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 ring-1 ring-slate-800 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Carte de question */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
            <span>
              Question <span className="font-semibold text-slate-200">7</span> / 20
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-amber-300">🔥 5</span>
              <span className="font-mono tabular-nums text-slate-300">4,2 s</span>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-[35%] rounded-full bg-emerald-500" />
          </div>

          <p className="text-lg font-semibold leading-snug text-slate-100">
            Le pot est de <span className="text-emerald-300">0,12 €</span>. Ton adversaire mise{' '}
            <span className="text-emerald-300">0,04 €</span>. Quelle équité minimale te faut-il pour payer ?
          </p>

          {/* Options */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
            {OPTIONS.map((opt, i) => {
              const isPicked = picked === i;
              const showCorrect = revealed && opt.correct;
              const showWrong = revealed && isPicked && !opt.correct;
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={revealed}
                  onClick={() => setPicked(i)}
                  className={`rounded-xl border-b-4 py-3.5 text-base font-bold transition-[transform,border] duration-75 active:translate-y-1 active:border-b-0 ${
                    showCorrect
                      ? 'border-emerald-800 bg-emerald-600 text-white'
                      : showWrong
                        ? 'border-red-900 bg-red-700 text-white'
                        : isPicked
                          ? 'border-slate-600 bg-slate-700 text-slate-100'
                          : 'border-slate-800 bg-slate-800/60 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Action / révélation */}
          {!revealed ? (
            <button
              type="button"
              disabled={picked === null}
              onClick={() => setRevealed(true)}
              className="mt-5 w-full rounded-xl border-b-4 border-emerald-800 bg-emerald-600 py-3 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-emerald-500 active:translate-y-1 active:border-b-0 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-800 disabled:text-slate-500"
            >
              Valider
            </button>
          ) : (
            <div className="mt-5">
              <div className="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/20">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  {picked !== null && OPTIONS[picked].correct ? '✓ Bonne réponse' : '✗ La bonne réponse : 20 %'}
                </p>
                <p className="mt-1 font-mono text-xs text-emerald-200/80">
                  Call 0,04 € ÷ pot final 0,20 € = 20 %
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  À mémoriser comme un fait : ⅓ → 20 %, ½ → 25 %, ⅔ → 29 %, pot → 33 %.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPicked(null);
                  setRevealed(false);
                }}
                className="mt-3 w-full rounded-xl border-b-4 border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-100 transition-[transform,border] duration-75 hover:bg-slate-700 active:translate-y-1 active:border-b-0"
              >
                Suivant →
              </button>
            </div>
          )}
        </section>

        {/* Maîtrise par paquet */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Ta maîtrise</h2>
          <div className="flex flex-wrap gap-2">
            {MASTERY.map((m) => (
              <span
                key={m.pack}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE[m.tone]}`}
              >
                {m.pack}
                <span className="opacity-70">· {m.level}</span>
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
