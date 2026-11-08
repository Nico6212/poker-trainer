'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '@/lib/poker/cards';
import { playerAt, type HandState } from '@/lib/poker/engine';
import { combosForClasses, estimatePreflopRange } from '@/lib/poker/ranges';
import type { EquityWorkerRequest, EquityWorkerResponse } from '@/workers/equity.worker';

export type EquityInfo = {
  status: 'idle' | 'computing' | 'ready';
  /** Équité contre la range estimée, entre 0 et 1. */
  equity: number | null;
  outs: Card[];
  aheadNow: boolean;
  rangeLabel: string | null;
  comboCount: number | null;
};

const IDLE: EquityInfo = {
  status: 'idle',
  equity: null,
  outs: [],
  aheadNow: false,
  rangeLabel: null,
  comboCount: null,
};

const ITERATIONS = 5000;

/**
 * Calcule en continu l'équité du héros contre la range ESTIMÉE du bot
 * (jamais ses vraies cartes), dans un Web Worker pour ne pas bloquer la table.
 */
export function useEquity(
  hand: HandState | null,
  heroSeat: number,
  botSeat: number | null,
): EquityInfo {
  const workerRef = useRef<Worker | null>(null);
  const workerBroken = useRef(false);
  const requestId = useRef(0);
  const [info, setInfo] = useState<EquityInfo>(IDLE);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const inputs = useMemo(() => {
    if (!hand || hand.result || hand.street === 'showdown' || botSeat === null) return null;
    const hero = playerAt(hand, heroSeat);
    const bot = playerAt(hand, botSeat);
    if (!hero.holeCards || hero.status === 'folded' || bot.status === 'folded') return null;
    return { hero: hero.holeCards, board: hand.board, range: estimatePreflopRange(hand, botSeat) };
  }, [hand, heroSeat, botSeat]);

  // Clé de recalcul : seuls un changement de cartes, de board ou de range relance le Monte-Carlo.
  const key = inputs
    ? JSON.stringify([hand?.handId, botSeat, inputs.hero, inputs.board, inputs.range.label])
    : null;

  useEffect(() => {
    if (!key || !inputs) {
      setInfo(IDLE);
      return;
    }
    const id = ++requestId.current;
    const combos = inputs.range.classes
      ? combosForClasses(inputs.range.classes, [...inputs.hero, ...inputs.board])
      : null;
    const rangeLabel = inputs.range.label;
    const comboCount = combos?.length ?? null;
    setInfo((prev) => ({ ...prev, status: 'computing', rangeLabel, comboCount }));

    const request: EquityWorkerRequest = {
      id,
      hero: inputs.hero,
      board: inputs.board,
      villainCombos: combos,
      iterations: ITERATIONS,
    };
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = (response: EquityWorkerResponse) => {
      if (response.id !== requestId.current) return; // réponse périmée
      if (fallbackTimer) clearTimeout(fallbackTimer);
      setInfo({
        status: 'ready',
        equity: response.equity,
        outs: response.outs,
        aheadNow: response.aheadNow,
        rangeLabel,
        comboCount,
      });
    };
    // Repli : calcul sur le thread principal si le worker ne peut pas tourner.
    const fallback = () => {
      void import('@/workers/equity.worker').then(({ compute }) => publish(compute(request)));
    };

    if (!workerBroken.current && !workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL('../../workers/equity.worker.ts', import.meta.url),
          { type: 'module', name: 'equity' },
        );
      } catch {
        workerBroken.current = true;
      }
    }
    const worker = workerRef.current;
    if (workerBroken.current || !worker) {
      fallback();
      return;
    }
    const onMessage = (event: MessageEvent<EquityWorkerResponse>) => publish(event.data);
    const onError = () => {
      // Le worker n'a pas pu charger ou a planté : on ne le retente plus.
      workerBroken.current = true;
      worker.terminate();
      workerRef.current = null;
      fallback();
    };
    // Filet de sécurité : un worker muet (échec de chargement silencieux) ne doit
    // jamais laisser le panneau sur « Calcul en cours… ».
    fallbackTimer = setTimeout(fallback, 3000);
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(request);
    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return info;
}
