'use client';

import { useRef, useState } from 'react';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import type { SrsCard } from '@/lib/poker/srs';
import { CardView } from './CardView';

const pct = (x: number) => `${Math.round(x * 100)} %`;

type Props = {
  cards: SrsCard[];
  mode: DisplayMode;
  bb: number;
  /** Appelé à chaque réponse : c'est le parent qui replanifie et sauvegarde. */
  onAnswer: (card: SrsCard, correct: boolean) => void;
  onClose: () => void;
};

/** Échauffement : rejoue tes erreurs passées comme des spots statiques (répétition espacée). */
export function ReviewQueue({ cards, mode, bb, onAnswer, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<'call' | 'fold' | null>(null);
  const score = useRef(0);

  const card = cards[index];
  const done = index >= cards.length;
  const fmt = (cents: number) => formatAmount(cents, mode, bb);

  const answer = (choice: 'call' | 'fold') => {
    if (answered || !card) return;
    setAnswered(choice);
    const correct = choice === card.correctAction;
    if (correct) score.current++;
    onAnswer(card, correct);
  };

  const next = () => {
    setAnswered(null);
    setIndex((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Échauffement : revois tes erreurs</h2>
          <span className="text-sm text-neutral-500">
            {Math.min(index + 1, cards.length)}/{cards.length}
          </span>
        </div>

        {done ? (
          <>
            <p className="text-center text-lg font-semibold">
              {score.current}/{cards.length} corrigées.
            </p>
            <p className="text-center text-sm text-neutral-500">
              Les spots réussis reviendront plus tard, les ratés dès la prochaine fois.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
            >
              C’est parti pour la session
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 rounded-lg bg-emerald-800/90 p-3">
              <div className="flex gap-1">
                {card.spot.board.map((c) => (
                  <CardView key={c} card={c} size="sm" />
                ))}
                {card.spot.board.length === 0 && (
                  <span className="text-xs text-white/70">(préflop)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/80">Ta main :</span>
                {card.spot.heroCards.map((c) => (
                  <CardView key={c} card={c} size="sm" />
                ))}
              </div>
              <p className="text-center text-sm font-medium text-white">
                Pot {fmt(card.potTotal)} · à payer : {fmt(card.callAmount)}
                <span className="block text-xs font-normal text-white/70">
                  range adverse : {card.spot.rangeLabel}
                </span>
              </p>
            </div>

            {answered === null ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => answer('fold')}
                  className="rounded-lg bg-red-600 px-3 py-3 font-semibold text-white hover:bg-red-700"
                >
                  Se coucher
                </button>
                <button
                  type="button"
                  onClick={() => answer('call')}
                  className="rounded-lg bg-neutral-700 px-3 py-3 font-semibold text-white hover:bg-neutral-800"
                >
                  Payer
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p
                  className={`text-sm font-semibold ${
                    answered === card.correctAction
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {answered === card.correctAction ? '✓ Bonne décision.' : '✗ Mauvaise décision.'}{' '}
                  Équité {pct(card.equity)} vs {pct(card.required)} requis →{' '}
                  {card.correctAction === 'call' ? 'il faut payer' : 'il faut se coucher'}.
                </p>
                {card.correctAction === 'fold' &&
                  (card.outsCount ?? 0) >= 8 &&
                  card.villainHadChips && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Nuance : cote directe seulement. Avec {card.outsCount} outs et des jetons
                      derrière, les cotes implicites peuvent parfois justifier ce call.
                    </p>
                  )}
                <button
                  type="button"
                  onClick={next}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
                >
                  {index + 1 >= cards.length ? 'Terminer' : 'Spot suivant'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
