'use client';

import type { Action, Street } from '@/lib/poker/engine';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import { translateHandName } from '@/lib/poker/hand-names';
import type { DecisionRecord, HandRecord } from '@/lib/poker/session';
import { CardView } from './CardView';

type Props = {
  record: HandRecord;
  /** Décisions enregistrées sur cette main, pour annoter les erreurs. */
  decisions: DecisionRecord[];
  mode: DisplayMode;
  onClose: () => void;
};

const STREET_LABELS: Record<Street, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Abattage',
};

function actionText(action: Action, mode: DisplayMode, bb: number): string {
  switch (action.type) {
    case 'fold':
      return 'se couche';
    case 'check':
      return 'check';
    case 'call':
      return 'suit';
    case 'bet':
      return `mise ${formatAmount(action.amount, mode, bb)}`;
    case 'raise':
      return `relance à ${formatAmount(action.amount, mode, bb)}`;
  }
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Revue d'une main street par street, avec les erreurs annotées. */
export function HandReview({ record, decisions, mode, onClose }: Props) {
  const bb = record.bb;
  const nameOf = (seat: number) =>
    record.players.find((p) => p.seat === seat)?.name ?? `Siège ${seat}`;

  const boardFor = (street: Street): typeof record.board => {
    if (street === 'flop') return record.board.slice(0, 3);
    if (street === 'turn') return record.board.slice(0, 4);
    if (street === 'river') return record.board.slice(0, 5);
    return [];
  };
  const reached = (street: Street): boolean => {
    if (street === 'preflop') return true;
    if (street === 'flop') return record.board.length >= 3;
    if (street === 'turn') return record.board.length >= 4;
    return record.board.length >= 5;
  };

  const streets: Street[] = ['preflop', 'flop', 'turn', 'river'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        // Sans stopPropagation, le clic bulle jusqu'au fond du SessionSummary et ferme tout.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl bg-white p-4 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            Main n°{record.handId} ·{' '}
            <span className={record.heroNet >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              {record.heroNet >= 0 ? '+' : ''}
              {formatAmount(record.heroNet, mode, bb)}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕ Fermer
          </button>
        </div>

        <div className="flex flex-wrap gap-4">
          {record.players.map((player) => (
            <div key={player.seat} className="flex items-center gap-2">
              <div className="flex gap-1">
                {player.holeCards ? (
                  player.holeCards.map((card, i) => <CardView key={i} card={card} size="sm" />)
                ) : (
                  <>
                    <CardView hidden size="sm" />
                    <CardView hidden size="sm" />
                  </>
                )}
              </div>
              <div className="text-sm">
                <p className="font-semibold">{player.name}</p>
                <p className="text-neutral-500">{formatAmount(player.startStack, mode, bb)}</p>
              </div>
            </div>
          ))}
        </div>

        {streets.filter(reached).map((street) => {
          const actions = record.history.filter((h) => h.street === street);
          const board = boardFor(street);
          const streetDecisions = decisions.filter((d) => d.street === street && d.isError);
          return (
            <section key={street} className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/60">
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="text-sm font-bold">{STREET_LABELS[street]}</h3>
                <div className="flex gap-1">
                  {board.map((card) => (
                    <CardView key={card} card={card} size="sm" />
                  ))}
                </div>
              </div>
              <ul className="flex flex-col gap-0.5 text-sm">
                {actions.length === 0 ? (
                  <li className="text-neutral-400">— aucune action —</li>
                ) : (
                  actions.map((entry, i) => (
                    <li key={i}>
                      <span className="font-medium">{nameOf(entry.seat)}</span>{' '}
                      {actionText(entry.action, mode, bb)}
                    </li>
                  ))
                )}
              </ul>
              {streetDecisions.map((d, i) => (
                <p
                  key={i}
                  className="mt-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300"
                >
                  ⚠{' '}
                  {d.errorKind === 'call-sans-cote'
                    ? `Payé sans la cote : équité ${d.equity !== null ? pct(d.equity) : '?'} < ${pct(d.required)} requis.`
                    : `Couché trop serré : équité ${d.equity !== null ? pct(d.equity) : '?'} largement au-dessus des ${pct(d.required)} requis.`}
                </p>
              ))}
            </section>
          );
        })}

        <p className="text-sm font-semibold">
          {record.result.winners
            .map(
              (w) =>
                `${nameOf(w.seat)} remporte ${formatAmount(w.amount, mode, bb)}${w.handName ? ` avec ${translateHandName(w.handName)}` : ''}`,
            )
            .join(' · ')}
          {record.result.wonWithoutShowdown ? ' (sans abattage)' : ''}
        </p>
      </div>
    </div>
  );
}
