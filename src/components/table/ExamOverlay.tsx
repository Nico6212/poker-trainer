'use client';

import { useRef, useState } from 'react';
import type { ExamAnswer } from '@/lib/poker/session';

const REQUIRED_CHOICES = [17, 20, 25, 29, 33];

type Props = {
  /** La notation de l'équité attend que le Monte-Carlo soit terminé. */
  equityReady: boolean;
  /** Pose aussi la question des outs : flop/turn, ET seulement si tu n'es pas déjà devant. */
  askOuts: boolean;
  /** Référent de la question outs/équité, ex. « open BTN ». */
  rangeLabel?: string | null;
  onSubmit: (
    requiredGuess: number,
    equityGuess: number,
    outsGuess: number | null,
    elapsedMs: number,
  ) => void;
};

/** Les questions du mode examen, posées avant de révéler les chiffres. */
export function ExamOverlay({ equityReady, askOuts, rangeLabel = null, onSubmit }: Props) {
  const [requiredChoice, setRequiredChoice] = useState<number | null>(null);
  const [requiredFree, setRequiredFree] = useState('');
  const [equityFree, setEquityFree] = useState('');
  const [outsFree, setOutsFree] = useState('');
  const startedAt = useRef(performance.now());

  const requiredValue =
    requiredFree !== '' && !Number.isNaN(Number(requiredFree))
      ? Number(requiredFree)
      : requiredChoice;
  const equityValue =
    equityFree !== '' && !Number.isNaN(Number(equityFree)) ? Number(equityFree) : null;
  const outsValue = outsFree !== '' && !Number.isNaN(Number(outsFree)) ? Number(outsFree) : null;
  const valid =
    requiredValue !== null &&
    requiredValue >= 0 &&
    requiredValue <= 100 &&
    equityValue !== null &&
    (!askOuts || outsValue !== null);

  const submit = () => {
    if (valid && equityReady) {
      onSubmit(
        requiredValue / 100,
        equityValue / 100,
        askOuts ? outsValue : null,
        Math.round(performance.now() - startedAt.current),
      );
    }
  };

  const inputClass =
    'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm dark:border-neutral-600 dark:bg-neutral-800';

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 bg-white/90 p-4 shadow-lg backdrop-blur dark:bg-neutral-900/90">
      <h2 className="font-bold">
        Mode examen <span className="text-sm font-normal text-neutral-500">— à toi de calculer</span>
      </h2>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">1. Il te faut combien ?</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {REQUIRED_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => {
                setRequiredChoice(choice);
                setRequiredFree('');
              }}
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
                requiredChoice === choice && requiredFree === ''
                  ? 'bg-amber-400 text-black'
                  : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600'
              }`}
            >
              {choice} %
            </button>
          ))}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            placeholder="libre"
            value={requiredFree}
            onChange={(e) => setRequiredFree(e.target.value)}
            className={`w-20 ${inputClass}`}
          />
          <span className="text-sm text-neutral-500">%</span>
        </div>
      </div>

      {askOuts && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">
            2. Combien d’outs te font passer devant
            {rangeLabel ? ` sa range estimée (${rangeLabel})` : ''} ?
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              placeholder="outs"
              value={outsFree}
              onChange={(e) => setOutsFree(e.target.value)}
              className={`w-20 ${inputClass}`}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold">
          {askOuts ? '3' : '2'}. Tu as combien de chances de gagner ?
        </p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            placeholder="ton équité"
            value={equityFree}
            onChange={(e) => setEquityFree(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            className={`w-28 ${inputClass}`}
          />
          <span className="text-sm text-neutral-500">%</span>
        </div>
      </div>

      <button
        type="button"
        disabled={!valid || !equityReady}
        onClick={submit}
        className="rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {equityReady ? 'Vérifier mes réponses' : 'Calcul de l’équité en cours…'}
      </button>
    </div>
  );
}

/** Correction affichée après la validation, avant de jouer l'action. */
export function ExamResult({ answer }: { answer: ExamAnswer }) {
  const line = (
    label: string,
    guess: number,
    actual: number,
    ok: boolean,
    unit = ' %',
    scale = 100,
  ): React.ReactNode => (
    <p
      key={label}
      className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
    >
      {ok ? '✓' : '✗'} {label} : <strong>{Math.round(actual * scale)}{unit}</strong> — ta réponse{' '}
      {Math.round(guess * scale)}
      {unit}
    </p>
  );

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
      {line('Il te fallait', answer.requiredGuess, answer.requiredActual, answer.requiredOk)}
      {answer.requiredDiagnosis && (
        <p className="text-xs text-red-700 dark:text-red-300">→ {answer.requiredDiagnosis}</p>
      )}
      {answer.outsGuess !== null &&
        answer.outsGuess !== undefined &&
        answer.outsActual !== null &&
        answer.outsActual !== undefined &&
        line('Outs', answer.outsGuess, answer.outsActual, answer.outsOk ?? false, '', 1)}
      {line('Ton équité', answer.equityGuess, answer.equityActual, answer.equityOk)}
      {answer.equityDiagnosis && (
        <p className="text-xs text-red-700 dark:text-red-300">→ {answer.equityDiagnosis}</p>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Tolérance ±5 points (outs : ±1)
        {answer.elapsedMs ? ` · répondu en ${(answer.elapsedMs / 1000).toFixed(1)} s` : ''}. Maintenant,
        joue ton coup.
      </p>
    </div>
  );
}
