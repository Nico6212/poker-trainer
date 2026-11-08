'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RaiseAdvice } from '@/lib/poker/advice';
import { legalActions, type Action, type HandState } from '@/lib/poker/engine';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';

type Props = {
  state: HandState;
  onAction: (action: Action) => void;
  mode: DisplayMode;
  /** Colore le bouton Payer : vert si le call est rentable, rouge sinon. */
  callVerdict?: 'good' | 'bad' | null;
  /** Taille de mise conseillée : pré-remplit le montant, chip « Conseil » et touche S. */
  suggestion?: RaiseAdvice | null;
  /** false quand une modale est ouverte : les raccourcis ne doivent pas jouer la main derrière. */
  hotkeysEnabled?: boolean;
};

const SIZINGS = [
  { key: '1', label: '⅓ pot', fraction: 1 / 3 },
  { key: '2', label: '½ pot', fraction: 1 / 2 },
  { key: '3', label: '⅔ pot', fraction: 2 / 3 },
  { key: '4', label: 'Pot', fraction: 1 },
  { key: '5', label: 'Tapis', fraction: null },
] as const;

export function ActionBar({
  state,
  onAction,
  mode,
  callVerdict = null,
  suggestion = null,
  hotkeysEnabled = true,
}: Props) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const la = useMemo(() => legalActions(state), [state]);
  const bb = state.blinds.bb;
  const potTotal = state.pot + state.players.reduce((sum, p) => sum + p.streetBet, 0);
  const canSize = la.canBet || la.canRaise;

  const [amount, setAmount] = useState(
    suggestion?.amount ?? (la.canBet ? la.minBet : la.minRaiseTo),
  );

  // Nouveau tour de parole : on repart de la taille conseillée, sinon du minimum légal.
  useEffect(() => {
    setAmount(suggestion?.amount ?? (la.canBet ? la.minBet : la.minRaiseTo));
  }, [la.canBet, la.minBet, la.minRaiseTo, suggestion?.amount]);

  const clampTarget = (value: number) =>
    Math.min(Math.max(Math.round(value), la.canBet ? la.minBet : la.minRaiseTo), la.maxTo);

  const sizeTo = (fraction: number | null): number => {
    if (fraction === null) return la.maxTo;
    if (la.canBet) return clampTarget(potTotal * fraction);
    // Relance « f × pot » : la mise en cours + la fraction du pot une fois le call payé.
    return clampTarget(state.currentBet + (potTotal + la.callAmount) * fraction);
  };

  const submitBetOrRaise = () => {
    if (!canSize) return;
    const target = clampTarget(amount);
    onAction(la.canBet ? { type: 'bet', amount: target } : { type: 'raise', amount: target });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!hotkeysEnabled) return;
      if (event.target instanceof HTMLInputElement) {
        // Seul l'input de montant de CETTE barre soumet sur Entrée.
        if (event.key === 'Enter' && event.target === amountInputRef.current) submitBetOrRaise();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'f') onAction({ type: 'fold' });
      else if (key === 'c') onAction(la.canCheck ? { type: 'check' } : { type: 'call' });
      else if (key === 'r') submitBetOrRaise();
      else if (key === 's') {
        if (suggestion && canSize) setAmount(suggestion.amount);
      } else {
        const sizing = SIZINGS.find((s) => s.key === key);
        if (sizing && canSize) setAmount(sizeTo(sizing.fraction));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const raiseLabel = la.canBet
    ? `Miser ${formatAmount(clampTarget(amount), mode, bb)}`
    : `Relancer à ${formatAmount(clampTarget(amount), mode, bb)}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white/80 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/80">
      {canSize && (
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestion && (
            <button
              type="button"
              onClick={() => setAmount(suggestion.amount)}
              className="rounded-md bg-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-400 dark:bg-amber-500/80 dark:text-black dark:hover:bg-amber-400"
              title="Taille conseillée (raccourci : S)"
            >
              Conseil {formatAmount(suggestion.amount, mode, bb)}
            </button>
          )}
          {SIZINGS.map((sizing) => (
            <button
              key={sizing.key}
              type="button"
              onClick={() => setAmount(sizeTo(sizing.fraction))}
              className="rounded-md bg-neutral-200 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              title={`Raccourci : ${sizing.key}`}
            >
              {sizing.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            Libre (€)
            <input
              ref={amountInputRef}
              type="number"
              step="0.01"
              min={(la.canBet ? la.minBet : la.minRaiseTo) / 100}
              max={la.maxTo / 100}
              value={(amount / 100).toFixed(2)}
              onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))}
              className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-right text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onAction({ type: 'fold' })}
          className="rounded-lg bg-red-600 px-3 py-3 font-semibold text-white hover:bg-red-700"
        >
          Se coucher <span className="opacity-60">(F)</span>
        </button>
        <button
          type="button"
          onClick={() => onAction(la.canCheck ? { type: 'check' } : { type: 'call' })}
          className={`rounded-lg px-3 py-3 font-semibold text-white ${
            callVerdict === 'good'
              ? 'bg-emerald-600 ring-2 ring-emerald-300 hover:bg-emerald-700'
              : callVerdict === 'bad'
                ? 'bg-red-700 ring-2 ring-red-300 hover:bg-red-800'
                : 'bg-neutral-700 hover:bg-neutral-800'
          }`}
        >
          {la.canCheck ? 'Check' : `Payer ${formatAmount(la.callAmount, mode, bb)}`}{' '}
          <span className="opacity-60">(C)</span>
        </button>
        <button
          type="button"
          onClick={submitBetOrRaise}
          disabled={!canSize}
          className="rounded-lg bg-emerald-600 px-3 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canSize ? raiseLabel : 'Relance impossible'} <span className="opacity-60">(R)</span>
        </button>
      </div>

      {canSize && (
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          Minimum : {formatAmount(la.canBet ? la.minBet : la.minRaiseTo, mode, bb)} · Tapis :{' '}
          {formatAmount(la.maxTo, mode, bb)} · Raccourcis 1-5 pour les tailles
        </p>
      )}
    </div>
  );
}
