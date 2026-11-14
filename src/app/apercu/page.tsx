'use client';

import { useState } from 'react';

// Prototype visuel (maquette) de la nouvelle interface « GTO solver », dark.
// Données mockées, non branché au moteur : sert uniquement à juger le rendu.
// Route isolée /apercu — ne touche à rien de l'existant.

type Suit = '♥' | '♦' | '♠' | '♣';
const isRed = (s: Suit) => s === '♥' || s === '♦';

// --- Données mockées d'une main en cours (flop, héros face à une mise) ---
const MOCK = {
  blinds: '0,01 / 0,02 €',
  pot: '0,12 €',
  villain: { name: 'La station', stack: '2,41 €', position: 'BTN', bet: '0,04 €' },
  hero: { stack: '1,98 €', position: 'BB', cards: [{ rank: 'A', suit: '♥' as Suit }, { rank: 'K', suit: '♦' as Suit }] },
  board: [
    { rank: 'K', suit: '♠' as Suit },
    { rank: '8', suit: '♥' as Suit },
    { rank: '3', suit: '♦' as Suit },
  ],
  toCall: '0,04 €',
  potOdds: {
    lines: [
      { label: 'Pot actuel', value: '0,12 €' },
      { label: 'Mise de la station', value: '+ 0,04 €' },
      { label: 'Ton call', value: '+ 0,04 €' },
    ],
    total: '0,20 €',
    required: '20 %',
    short: '0,04 € ÷ 0,20 € = 20 %',
  },
  checklist: [
    { done: true, label: '20 mains jouées à la table' },
    { done: true, label: 'Drill « Cote du pot » (série de 20)' },
    { done: false, label: 'Revoir 3 erreurs importées' },
    { done: false, label: '1 série « Qu’est-ce qui me bat ? »' },
  ],
};

// --- Petits éléments visuels (même fichier, pas de composants séparés) ---

function PlayingCard({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div className="flex h-20 w-14 flex-col justify-between rounded-lg bg-white p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-black/10">
      <span className={`text-lg font-bold leading-none ${isRed(suit) ? 'text-red-600' : 'text-slate-900'}`}>{rank}</span>
      <span className={`self-end text-xl leading-none ${isRed(suit) ? 'text-red-600' : 'text-slate-900'}`}>{suit}</span>
    </div>
  );
}

function CardBack() {
  return (
    <div className="h-20 w-14 rounded-lg border border-indigo-950 bg-gradient-to-br from-indigo-800 via-indigo-900 to-slate-900 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <div className="h-full w-full rounded-lg bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:8px_8px]" />
    </div>
  );
}

function EmptySlot() {
  return <div className="h-20 w-14 rounded-lg border border-dashed border-slate-700/70 bg-slate-800/20" />;
}

function Chip({ amount }: { amount: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2 py-1 ring-1 ring-amber-500/30">
      <span className="h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-amber-600" />
      <span className="text-xs font-semibold text-amber-200">{amount}</span>
    </div>
  );
}

function Dealer() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900 shadow">
      D
    </span>
  );
}

export default function ApercuPage() {
  const [bet, setBet] = useState('0,06');
  const [picked, setPicked] = useState<string | null>(null);

  const navItems = ['Table', 'Drill', 'Import', 'Mes erreurs', 'Aide'];
  const sizes = [
    { label: '½ pot', value: '0,06' },
    { label: '¾ pot', value: '0,09' },
    { label: 'Pot', value: '0,12' },
    { label: 'Tapis', value: '1,98' },
  ];

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      {/* ---------- Header ---------- */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">♠</span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">Poker Trainer</span>
          <span className="hidden rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300 sm:inline">
            Blindes {MOCK.blinds}
          </span>
          <span className="hidden rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-400 md:inline">
            NL2 · 6-max
          </span>
        </div>
        <nav className="flex items-center gap-1 text-xs">
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                item === 'Table'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      {/* ---------- Corps : table + sidebar ---------- */}
      <div className="flex flex-1 overflow-hidden">
        {/* Zone principale */}
        <main className="flex flex-1 flex-col">
          {/* Table */}
          <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
            <div className="relative aspect-[16/10] w-full max-w-3xl rounded-[100px] border-[16px] border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[inset_0_2px_40px_rgba(0,0,0,0.6)]">
              {/* Feutre intérieur */}
              <div className="absolute inset-3 rounded-[84px] ring-1 ring-emerald-500/10" />

              {/* Adversaire (haut) */}
              <div className="absolute left-1/2 top-6 flex -translate-x-1/2 flex-col items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-1.5">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-semibold text-slate-200">{MOCK.villain.name}</span>
                    <span className="text-[11px] text-amber-200/90">{MOCK.villain.stack}</span>
                  </div>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                    {MOCK.villain.position}
                  </span>
                  <Dealer />
                </div>
                <div className="flex gap-1.5">
                  <CardBack />
                  <CardBack />
                </div>
              </div>

              {/* Mise de l'adversaire */}
              <div className="absolute left-1/2 top-[34%] -translate-x-1/2">
                <Chip amount={MOCK.villain.bet} />
              </div>

              {/* Centre : pot + board */}
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
                <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-slate-700">
                  Pot {MOCK.pot}
                </span>
                <div className="flex gap-2">
                  {MOCK.board.map((c) => (
                    <PlayingCard key={`${c.rank}${c.suit}`} rank={c.rank} suit={c.suit} />
                  ))}
                  <EmptySlot />
                  <EmptySlot />
                </div>
              </div>

              {/* Héros (bas) */}
              <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
                <div className="flex -space-x-2">
                  {MOCK.hero.cards.map((c) => (
                    <div key={`${c.rank}${c.suit}`} className="transition hover:-translate-y-1">
                      <PlayingCard rank={c.rank} suit={c.suit} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {MOCK.hero.position}
                  </span>
                  <span className="text-xs font-semibold text-emerald-100">Toi</span>
                  <span className="text-[11px] text-amber-200/90">{MOCK.hero.stack}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Action bar ---------- */}
          <div className="border-t border-slate-800 bg-slate-900 p-3 sm:p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {/* Tailles rapides + saisie libre */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {sizes.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setBet(s.value)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        bet === s.value
                          ? 'bg-slate-700 text-slate-100'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="relative ml-auto">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">€</span>
                  <input
                    value={bet}
                    onChange={(e) => setBet(e.target.value)}
                    inputMode="decimal"
                    className="w-32 rounded-lg border border-slate-700 bg-slate-950 py-2 pl-7 pr-3 text-right text-sm font-semibold text-slate-100 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Boutons d'action 3D tactiles */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPicked('fold')}
                  className={`rounded-xl border-b-4 border-red-800 bg-red-600 py-3 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-red-500 active:translate-y-1 active:border-b-0 ${
                    picked === 'fold' ? 'ring-2 ring-red-400/60' : ''
                  }`}
                >
                  Se coucher
                </button>
                <button
                  type="button"
                  onClick={() => setPicked('call')}
                  className={`rounded-xl border-b-4 border-sky-900 bg-sky-700 py-3 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-sky-600 active:translate-y-1 active:border-b-0 ${
                    picked === 'call' ? 'ring-2 ring-sky-400/60' : ''
                  }`}
                >
                  Payer {MOCK.toCall}
                </button>
                <button
                  type="button"
                  onClick={() => setPicked('raise')}
                  className={`rounded-xl border-b-4 border-emerald-800 bg-emerald-600 py-3 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-emerald-500 active:translate-y-1 active:border-b-0 ${
                    picked === 'raise' ? 'ring-2 ring-emerald-400/60' : ''
                  }`}
                >
                  Relancer à € {bet}
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ---------- Sidebar d'analyse ---------- */}
        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-800 bg-slate-900 p-4 lg:flex">
          {/* Séance du jour */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Séance du jour
            </h2>
            <ul className="space-y-1.5">
              {MOCK.checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      item.done
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'border border-slate-700 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className={item.done ? 'text-emerald-300/90' : 'text-slate-400'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Le Pot */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Le Pot</h2>
            <div className="space-y-1 font-mono text-sm">
              {MOCK.potOdds.lines.map((l) => (
                <div key={l.label} className="flex justify-between">
                  <span className="text-slate-400">{l.label}</span>
                  <span className="text-slate-200">{l.value}</span>
                </div>
              ))}
              <div className="my-1.5 border-t border-slate-800" />
              <div className="flex justify-between font-semibold">
                <span className="text-slate-300">Pot final</span>
                <span className="text-slate-100">{MOCK.potOdds.total}</span>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
              <p className="font-mono text-xs text-emerald-300/90">{MOCK.potOdds.short}</p>
              <p className="mt-1 text-sm text-slate-200">
                Il te faut <span className="font-bold text-emerald-300">{MOCK.potOdds.required}</span> d’équité pour payer.
              </p>
            </div>
          </section>

          {/* Lecture rapide */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <h2 className="mb-1.5 text-sm font-semibold text-slate-200">Ta main</h2>
            <p className="text-sm text-slate-400">
              Top paire, meilleur kicker (A♥ K♦ sur K♠ 8♥ 3♦). Board sec : peu de tirages adverses.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
