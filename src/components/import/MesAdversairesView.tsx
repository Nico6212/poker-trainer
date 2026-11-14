'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadHands } from '@/lib/poker/import/db';
import type { ParsedHand } from '@/lib/poker/import/parse-pokerstars';
import {
  showdownStats,
  type ShownStrength,
  type VillainAction,
} from '@/lib/poker/import/showdown-stats';

const ACTION_LABEL: Record<VillainAction, string> = {
  raiseFlop: 'Relance flop',
  raiseTurn: 'Relance turn',
  raiseRiver: 'Relance river',
  checkRaise: 'Check-raise',
  jamRiver: 'Tapis river',
  betRiverAfterPassive: 'Mise river après ligne passive',
};

const STRENGTH: { key: ShownStrength; label: string; color: string }[] = [
  { key: 'twoPairPlus', label: 'Deux paires+', color: 'bg-emerald-500' },
  { key: 'overpair', label: 'Overpair', color: 'bg-sky-500' },
  { key: 'topPair', label: 'Top paire', color: 'bg-sky-400' },
  { key: 'middlePair', label: 'Paire moyenne', color: 'bg-amber-500' },
  { key: 'draw', label: 'Tirage', color: 'bg-violet-500' },
  { key: 'air', label: 'Air', color: 'bg-red-500' },
];

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function MesAdversairesView() {
  const [hands, setHands] = useState<ParsedHand[] | null>(null);
  useEffect(() => {
    loadHands().then(setHands);
  }, []);

  const stats = useMemo(() => (hands ? showdownStats(hands) : []), [hands]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 text-slate-200 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">Mes adversaires</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ce que tes adversaires montrent vraiment à l’abattage, par action. Ces statistiques calibrent
          les ranges du détecteur d’erreurs.
        </p>
      </div>

      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 ring-1 ring-amber-500/20">
        ⚠ Biais d’abattage : les bluffs qui gagnent sans abattage ne sont pas visibles. Ces % de value
        sont donc des <strong>plafonds</strong> — la part réelle de bluff est plus élevée.
      </p>

      {hands === null ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : stats.length === 0 ? (
        <p className="text-sm text-slate-400">
          Pas encore d’abattage adverse. Importe tes mains depuis la page{' '}
          <Link href="/import" className="font-semibold text-emerald-400 underline">
            Import
          </Link>
          .
        </p>
      ) : (
        stats.map((s) => (
          <section
            key={`${s.action}-${s.bb}`}
            className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-100">
                NL{s.bb} · {ACTION_LABEL[s.action]}
                <span className="ml-2 text-xs font-normal text-slate-400">{s.showdowns} abattages</span>
              </h2>
              <span className="text-sm">
                Deux paires+ :{' '}
                <strong className="text-emerald-300">{pct(s.twoPairPlusRate)}</strong>{' '}
                <span className="text-xs text-slate-400">
                  [{pct(s.wilsonLow)} – {pct(s.wilsonHigh)}]
                </span>
              </span>
            </div>

            {/* Répartition empilée */}
            <div className="flex h-2 overflow-hidden rounded bg-slate-800">
              {STRENGTH.map(({ key, color }) =>
                s.counts[key] > 0 ? (
                  <div
                    key={key}
                    className={color}
                    style={{ width: `${(s.counts[key] / s.showdowns) * 100}%` }}
                    title={`${key} : ${s.counts[key]}`}
                  />
                ) : null,
              )}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
              {STRENGTH.filter(({ key }) => s.counts[key] > 0).map(({ key, label, color }) => (
                <li key={key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${color}`} /> {label} {s.counts[key]}
                </li>
              ))}
            </ul>
            {s.showdowns < 15 && (
              <p className="text-[11px] text-slate-500">
                Échantillon &lt; 15 : a priori théorique conservé (pas de calibration).
              </p>
            )}
          </section>
        ))
      )}
    </main>
  );
}
