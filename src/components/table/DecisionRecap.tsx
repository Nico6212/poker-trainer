'use client';

import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import type { DecisionRecord } from '@/lib/poker/session';

const pct = (x: number) => `${Math.round(x * 100)} %`;

type Props = {
  decision: DecisionRecord;
  mode: DisplayMode;
  bb: number;
};

/**
 * Récap affiché APRÈS la décision (niveaux Masqué et Examen) : c'est lui qui donne
 * les chiffres, jamais avant — on calcule d'abord, on vérifie ensuite.
 */
export function DecisionRecap({ decision, mode, bb }: Props) {
  const fmt = (cents: number) => formatAmount(cents, mode, bb);
  const facing = decision.callAmount > 0;
  const margin =
    facing && decision.equity !== null ? decision.equity - decision.required : null;

  const actionLabel =
    decision.action === 'fold'
      ? 'Tu t’es couché'
      : decision.action === 'call'
        ? `Tu as payé ${fmt(decision.callAmount)}`
        : `Tu as ${decision.action === 'bet' ? 'misé' : 'relancé à'} ${decision.sizeAmount !== null && decision.sizeAmount !== undefined ? fmt(decision.sizeAmount) : '—'}`;

  let verdict: { text: string; tone: 'good' | 'bad' | 'neutral' } | null = null;
  if (facing && margin !== null) {
    if (decision.action === 'call') {
      verdict =
        margin >= 0
          ? { text: `Bon call : ${pct(decision.equity!)} d’équité pour ${pct(decision.required)} requis (+${Math.round(margin * 100)} pts).`, tone: 'good' }
          : { text: `Call sans la cote : ${pct(decision.equity!)} pour ${pct(decision.required)} requis (${Math.round(margin * 100)} pts).`, tone: 'bad' };
    } else if (decision.action === 'fold') {
      verdict =
        margin > 0.1
          ? { text: `Fold trop serré : tu avais ${pct(decision.equity!)} pour ${pct(decision.required)} requis.`, tone: 'bad' }
          : margin < 0
            ? { text: `Bon fold : ${pct(decision.equity!)} d’équité pour ${pct(decision.required)} requis.`, tone: 'good' }
            : { text: `Fold défendable (zone grise : ${pct(decision.equity!)} vs ${pct(decision.required)}).`, tone: 'neutral' };
    } else {
      verdict = {
        text: `Relance avec ${pct(decision.equity!)} d’équité (requis pour payer : ${pct(decision.required)}).`,
        tone: 'neutral',
      };
    }
  }

  const toneClass =
    verdict?.tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : verdict?.tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-neutral-600 dark:text-neutral-300';

  const showImplied =
    decision.errorKind === 'call-sans-cote' &&
    (decision.outsCount ?? 0) >= 8 &&
    decision.villainHadChips &&
    // Un call qui te met à tapis n'a aucune cote implicite : rien à nuancer.
    (decision.heroChipsBehind ?? true);

  const sizeNote =
    (decision.action === 'bet' || decision.action === 'raise') &&
    decision.sizeAdvised !== null &&
    decision.sizeAdvised !== undefined
      ? decision.sizeWarning
        ? { text: `Taille hors norme : conseillé ≈ ${fmt(decision.sizeAdvised)}.`, warn: true }
        : { text: `Taille cohérente (conseil : ${fmt(decision.sizeAdvised)}).`, warn: false }
      : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-black/10 bg-white/80 p-3 text-sm backdrop-blur dark:border-white/10 dark:bg-neutral-900/80">
      <p>
        <span className="font-semibold">{actionLabel}</span>
        {decision.elapsedMs ? (
          <span className="text-xs text-neutral-500"> · {(decision.elapsedMs / 1000).toFixed(1)} s</span>
        ) : null}
      </p>
      {facing && decision.equity === null ? (
        <p className="animate-pulse text-neutral-500 dark:text-neutral-400">
          Équité en cours de calcul… le classement sera mis à jour en fin de main.
        </p>
      ) : (
        verdict && <p className={`font-medium ${toneClass}`}>{verdict.text}</p>
      )}
      {sizeNote && (
        <p className={sizeNote.warn ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}>
          {sizeNote.text}
        </p>
      )}
      {showImplied && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Nuance : cote directe seulement. Avec {decision.outsCount} outs et des jetons derrière,
          les cotes implicites peuvent parfois justifier ce call.
        </p>
      )}
    </div>
  );
}
