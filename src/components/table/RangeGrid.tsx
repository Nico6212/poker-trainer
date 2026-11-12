'use client';

import { buildRangeGrid, type PreflopVerdict } from '@/lib/poker/preflop-verdict';

const ACTION_CLASS: Record<string, string> = {
  raise: 'bg-emerald-500 text-white',
  call: 'bg-sky-400 text-white',
  fold: 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500',
};

/** Grille 13×13 de la range utilisée, avec la main du joueur surlignée (« Pourquoi ? »). */
export function RangeGrid({ verdict }: { verdict: PreflopVerdict }) {
  const grid = buildRangeGrid(verdict);
  const hasCall = verdict.chart.call.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(13, 1fr)' }}>
        {grid.flat().map((cell) => (
          <div
            key={cell.hand}
            title={cell.hand}
            className={`flex aspect-square items-center justify-center rounded-[2px] text-[7px] font-semibold leading-none sm:text-[9px] ${
              ACTION_CLASS[cell.action]
            } ${cell.isHero ? 'ring-2 ring-amber-400' : ''}`}
          >
            {cell.hand.length === 2 ? cell.hand : cell.hand.slice(0, 2)}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" /> Relance
        </span>
        {hasCall && (
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-sky-400" /> Call
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-neutral-300 dark:bg-neutral-600" /> Fold
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm ring-2 ring-amber-400" /> Ta main
        </span>
      </div>
    </div>
  );
}
