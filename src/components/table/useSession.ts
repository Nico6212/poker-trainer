'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  archiveSession,
  computeStats,
  freshSession,
  loadSession,
  saveSession,
  type DecisionRecord,
  type HandRecord,
  type SessionData,
} from '@/lib/poker/session';

export function useSession() {
  const [data, setData] = useState<SessionData | null>(null);

  // Chargé au montage : localStorage n'existe pas côté serveur.
  useEffect(() => {
    setData(loadSession());
  }, []);

  const mutate = useCallback((updater: (d: SessionData) => SessionData) => {
    setData((d) => {
      if (!d) return d;
      const next = updater(d);
      saveSession(next);
      return next;
    });
  }, []);

  const recordDecision = useCallback(
    (decision: DecisionRecord) =>
      mutate((d) => ({ ...d, decisions: [...d.decisions, decision] })),
    [mutate],
  );

  const recordHand = useCallback(
    (hand: HandRecord) => mutate((d) => ({ ...d, hands: [...d.hands, hand] })),
    [mutate],
  );

  /** Met à jour une décision après coup (reclassement quand l'équité arrive en fin de main). */
  const updateDecision = useCallback(
    (id: string, patch: Partial<DecisionRecord>) =>
      mutate((d) => ({
        ...d,
        decisions: d.decisions.map((dec) => (dec.id === id ? { ...dec, ...patch } : dec)),
      })),
    [mutate],
  );

  const reset = useCallback(() => {
    // Effets de bord HORS de l'updater : StrictMode double-invoque les updaters en dev.
    // Le bilan part dans l'historique de progression avant d'être effacé.
    if (data) archiveSession(data);
    const fresh = freshSession();
    saveSession(fresh);
    setData(fresh);
  }, [data]);

  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);

  return { data, stats, recordDecision, recordHand, updateDecision, reset };
}
