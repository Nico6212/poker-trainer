'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Card } from '@/lib/poker/cards';
import { getHand, loadMistakes, updateMistakeReview, type StoredMistake } from '@/lib/poker/import/db';
import { mistakeQuestion } from '@/lib/poker/import/mistake-drill';
import { formatCost, isCostEstimate, mistakeCost, orderMistakes, scheduleReview } from '@/lib/poker/import/mistake-srs';
import type { ParsedAction, ParsedHand, ParsedStreet } from '@/lib/poker/import/parse-pokerstars';

const SUIT: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const RED = (s: string) => s === 'h' || s === 'd';

function CardBadge({ card, highlight = false }: { card: Card; highlight?: boolean }) {
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  return (
    <span
      className={`inline-flex min-w-[1.5rem] justify-center rounded border bg-white px-1 font-mono text-sm font-bold dark:border-white/20 ${
        RED(suit) ? 'text-red-600' : 'text-neutral-900'
      } ${highlight ? 'border-amber-400 ring-2 ring-amber-400' : 'border-black/15'}`}
    >
      {rank}
      {SUIT[suit]}
    </span>
  );
}

const euro = (cents: number) => `${(cents / 100).toFixed(2)} €`;

function actionText(a: ParsedAction): string {
  switch (a.type) {
    case 'blind':
      return `blinde ${euro(a.amount)}`;
    case 'ante':
      return `ante ${euro(a.amount)}`;
    case 'fold':
      return 'se couche';
    case 'check':
      return 'check';
    case 'call':
      return `paie ${euro(a.amount)}${a.allIn ? ' (tapis)' : ''}`;
    case 'bet':
      return `mise ${euro(a.amount)}${a.allIn ? ' (tapis)' : ''}`;
    case 'raise':
      return `relance à ${euro(a.toAmount ?? a.amount)}${a.allIn ? ' (tapis)' : ''}`;
    case 'uncalled':
      return `récupère ${euro(a.amount)} non payés`;
  }
}

const STREET_LABEL: Record<ParsedStreet, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

function boardUpTo(hand: ParsedHand, street: ParsedStreet): Card[] {
  if (street === 'preflop') return [];
  if (street === 'flop') return hand.board.slice(0, 3);
  if (street === 'turn') return hand.board.slice(0, 4);
  return hand.board.slice(0, 5);
}

function HandReplay({ hand }: { hand: ParsedHand }) {
  const streets: ParsedStreet[] = ['preflop', 'flop', 'turn', 'river'];
  const nameBySeat = new Map(hand.seats.map((s) => [s.seat, s.name]));
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-black/10 bg-neutral-50 p-2 text-sm dark:border-white/10 dark:bg-neutral-950/50">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Héros :</span>
        <CardBadge card={hand.heroCards[0]} />
        <CardBadge card={hand.heroCards[1]} />
      </div>
      {streets.map((street) => {
        const acts = hand.actions.filter((a) => a.street === street);
        if (acts.length === 0 && street !== 'preflop') return null;
        const board = boardUpTo(hand, street);
        return (
          <div key={street} className="border-t border-black/5 pt-1 dark:border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-neutral-500">{STREET_LABEL[street]}</span>
              {board.map((c) => (
                <CardBadge key={c} card={c} />
              ))}
            </div>
            <ul className="mt-0.5">
              {acts.map((a, i) => {
                const isHero = a.seat === hand.heroSeat;
                return (
                  <li key={i} className={isHero ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}>
                    {isHero ? 'Héros' : nameBySeat.get(a.seat) ?? a.name} {actionText(a)}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {Object.keys(hand.shown).length > 0 && (
        <div className="border-t border-black/5 pt-1 dark:border-white/5">
          <span className="text-xs font-bold uppercase text-neutral-500">Abattage</span>
          <ul className="mt-0.5">
            {Object.entries(hand.shown).map(([seat, cards]) => {
              const s = Number(seat);
              return (
                <li key={seat} className="flex items-center gap-2">
                  <span>{s === hand.heroSeat ? 'Héros' : nameBySeat.get(s) ?? `Siège ${seat}`} :</span>
                  <CardBadge card={cards[0]} />
                  <CardBadge card={cards[1]} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Positions clockwise depuis la SB (le bouton est à part). Suffisant jusqu'au 9-max.
const NON_BTN: Record<number, string[]> = {
  3: ['SB', 'BB'],
  4: ['SB', 'BB', 'UTG'],
  5: ['SB', 'BB', 'UTG', 'CO'],
  6: ['SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};

function positionMap(hand: ParsedHand): Map<number, string> {
  const occupied = hand.seats.map((s) => s.seat).sort((a, b) => a - b);
  const n = occupied.length;
  const map = new Map<number, string>();
  if (n === 2) {
    for (const s of occupied) map.set(s, s === hand.buttonSeat ? 'SB' : 'BB');
    return map;
  }
  const btnIdx = occupied.indexOf(hand.buttonSeat);
  if (btnIdx < 0) return map;
  const afterBtn = [...occupied.slice(btnIdx + 1), ...occupied.slice(0, btnIdx)]; // SB → CO
  const labels = NON_BTN[n] ?? afterBtn.map((_, i) => `P${i + 1}`);
  afterBtn.forEach((seat, i) => map.set(seat, labels[i] ?? `P${i + 1}`));
  map.set(hand.buttonSeat, 'BTN');
  return map;
}

/**
 * L'action qui définit le spot, mise en évidence. On privilégie le signal le plus fort :
 * un check-raise, sinon une relance, sinon la dernière mise adverse avant la décision.
 */
function keyActionLabel(hand: ParsedHand, upto: number): string | null {
  type Key = { type: 'bet' | 'raise' | 'check-raise'; street: ParsedStreet };
  let lastBetOrRaise: Key | null = null;
  let lastCheckRaise: Key | null = null;
  let lastRaise: Key | null = null;
  let street: ParsedStreet | null = null;
  let checked = new Set<number>();
  for (let i = 0; i < upto && i < hand.actions.length; i++) {
    const a = hand.actions[i];
    if (a.street !== street) {
      street = a.street;
      checked = new Set();
    }
    if (a.seat !== hand.heroSeat && (a.type === 'bet' || a.type === 'raise')) {
      const isCR = a.type === 'raise' && checked.has(a.seat);
      const key: Key = { type: isCR ? 'check-raise' : a.type, street: a.street };
      lastBetOrRaise = key;
      if (isCR) lastCheckRaise = key;
      else if (a.type === 'raise') lastRaise = key;
    }
    if (a.type === 'check') checked.add(a.seat);
  }
  const key = lastCheckRaise ?? lastRaise ?? lastBetOrRaise;
  if (!key) return null;
  const verb = key.type === 'check-raise' ? 'Check-raise' : key.type === 'raise' ? 'Relance' : 'Mise';
  return `${verb} ${STREET_LABEL[key.street].toLowerCase()}`;
}

/** Pot (en centimes) au DÉBUT de chaque street (tout ce qui est entré avant ses mises). */
function potByStreet(hand: ParsedHand): Partial<Record<ParsedStreet, number>> {
  const inv = new Map<number, { street: number; total: number }>();
  for (const s of hand.seats) inv.set(s.seat, { street: 0, total: 0 });
  const total = () => [...inv.values()].reduce((p, x) => p + x.total, 0);
  const potAt: Partial<Record<ParsedStreet, number>> = {};
  let cur: ParsedStreet | null = null;
  for (const a of hand.actions) {
    if (a.street !== cur) {
      potAt[a.street] = total(); // pot avant la 1ʳᵉ mise de cette street
      cur = a.street;
      for (const x of inv.values()) x.street = 0;
    }
    const x = inv.get(a.seat);
    if (!x) continue;
    if (a.type === 'blind' || a.type === 'ante' || a.type === 'call' || a.type === 'bet') {
      x.total += a.amount;
      x.street += a.amount;
    } else if (a.type === 'raise') {
      const to = a.toAmount ?? x.street + a.amount;
      x.total += to - x.street;
      x.street = to;
    } else if (a.type === 'uncalled') {
      x.total -= a.amount;
      x.street -= a.amount;
    }
  }
  return potAt;
}

/** Nombre de cartes du board avant cette street (pour repérer la/les carte(s) nouvelle(s)). */
const PREV_BOARD: Record<ParsedStreet, number> = { preflop: 0, flop: 0, turn: 3, river: 4 };

/** Historique de la main AVANT la décision du héros (positions, mises, board + pot, action clé). */
function PreDecision({ hand, upto, effBB }: { hand: ParsedHand; upto: number; effBB: number }) {
  const pos = positionMap(hand);
  const heroPos = pos.get(hand.heroSeat);
  const streets: ParsedStreet[] = ['preflop', 'flop', 'turn', 'river'];
  const acts = hand.actions.slice(0, upto);
  const key = keyActionLabel(hand, upto);
  const pots = potByStreet(hand);
  const eff = Math.round(effBB);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-black/10 bg-neutral-50 p-2 text-sm dark:border-white/10 dark:bg-neutral-950/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-neutral-500">
          Déroulé{eff > 0 ? ` · tapis effectif ${eff} BB` : ''}
        </span>
        {key && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            ⚡ {key}
          </span>
        )}
      </div>
      {streets.map((street) => {
        const sActs = acts.filter((a) => a.street === street);
        if (sActs.length === 0) return null;
        const board = boardUpTo(hand, street);
        const prev = PREV_BOARD[street];
        const pot = pots[street] ?? 0;
        const checked = new Set<number>();
        return (
          <div key={street} className="border-t border-black/5 pt-1 dark:border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase text-neutral-500">{STREET_LABEL[street]}</span>
              {board.map((c, ci) => (
                <CardBadge key={c} card={c} highlight={ci >= prev} />
              ))}
              {pot > 0 && <span className="text-xs text-neutral-400">· pot {euro(pot)}</span>}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {sActs.map((a, i) => {
                const isHero = a.seat === hand.heroSeat;
                const isCR = a.type === 'raise' && checked.has(a.seat);
                if (a.type === 'check') checked.add(a.seat);
                const aggressive = !isHero && (a.type === 'bet' || a.type === 'raise');
                const who = isHero ? `Toi${heroPos ? ` (${heroPos})` : ''}` : pos.get(a.seat) ?? `S${a.seat}`;
                return (
                  <li
                    key={i}
                    className={`flex gap-2 rounded px-1 ${
                      isHero ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''
                    } ${aggressive ? 'bg-amber-100/70 dark:bg-amber-900/30' : ''}`}
                  >
                    <span className="min-w-[3.5rem] shrink-0 text-neutral-500">{who}</span>
                    <span>{isCR ? `check-raise à ${euro(a.toAmount ?? a.amount)}` : actionText(a)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function MesErreursView() {
  const [now] = useState(() => Date.now());
  const [mistakes, setMistakes] = useState<StoredMistake[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [hand, setHand] = useState<ParsedHand | null>(null);
  const [showHand, setShowHand] = useState(false);

  useEffect(() => {
    // Ordre : erreurs dues d'abord, par coût décroissant (fiches de taille à la fin).
    loadMistakes().then((list) => setMistakes(orderMistakes(list, now)));
  }, [now]);

  const current = mistakes?.[idx];
  const currentHandId = current?.handId;
  const question = useMemo(() => (current ? mistakeQuestion(current) : null), [current]);
  const costText = current ? formatCost(mistakeCost(current), isCostEstimate(current.type)) : '';

  useEffect(() => {
    // La main est chargée en amont : le déroulé est visible AVANT la question.
    setChosen(null);
    setShowHand(false);
    setHand(null);
    if (currentHandId) getHand(currentHandId).then((h) => setHand(h ?? null));
  }, [idx, currentHandId]);

  function answer(option: string) {
    if (chosen || !question || !current) return;
    setChosen(option);
    if (question.decision) {
      const ok = option === question.correct;
      setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), answered: s.answered + 1 }));
      // Répétition espacée : ratée → revient plus tôt (boîte 1, due immédiatement).
      updateMistakeReview(current.id, scheduleReview(current, ok, now));
    }
  }

  function next() {
    // Fiche de taille (non notée) : marquée comme revue pour qu'elle recule dans la file.
    if (current && question && !question.decision) {
      updateMistakeReview(current.id, scheduleReview(current, true, now));
    }
    setIdx((i) => i + 1);
  }

  const header = (
    <header className="flex items-center justify-between text-sm">
      <h1 className="text-lg font-bold">Mes erreurs</h1>
      <div className="flex gap-2">
        <Link
          href="/import"
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Import
        </Link>
        <Link
          href="/table"
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          ← Table
        </Link>
      </div>
    </header>
  );

  if (mistakes === null) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-4">
        {header}
        <p className="text-sm text-neutral-500">Chargement…</p>
      </main>
    );
  }

  if (mistakes.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-4">
        {header}
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Aucune erreur pour l’instant. Importe tes mains PokerStars depuis la page{' '}
          <Link href="/import" className="font-semibold text-emerald-600 underline">
            Import
          </Link>{' '}
          : les décisions douteuses atterriront ici pour être rejouées.
        </p>
      </main>
    );
  }

  if (idx >= mistakes.length) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-4">
        {header}
        <div className="rounded-xl border border-black/10 bg-white/70 p-4 text-center dark:border-white/10 dark:bg-neutral-900/70">
          <p className="text-lg font-bold">Paquet terminé</p>
          {score.answered > 0 && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {score.correct}/{score.answered} bonnes décisions rejouées.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setIdx(0);
              setScore({ correct: 0, answered: 0 });
            }}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Recommencer
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-3 sm:p-4">
      {header}
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>
          Erreur {idx + 1} / {mistakes.length}
        </span>
        {score.answered > 0 && (
          <span>
            {score.correct}/{score.answered} bonnes
          </span>
        )}
      </div>

      {current && question && (
        <section className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-neutral-900/70">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400">Ta main :</span>
            {current.spot.heroCards?.map((c) => <CardBadge key={c} card={c} />)}
            {current.spot.board && current.spot.board.length > 0 && (
              <>
                <span className="mx-1 text-neutral-300">·</span>
                {current.spot.board.map((c) => (
                  <CardBadge key={c} card={c} />
                ))}
              </>
            )}
          </div>
          {hand && typeof current.spot.actionIndex === 'number' && (
            <PreDecision hand={hand} upto={current.spot.actionIndex} effBB={current.spot.effectiveBB} />
          )}
          {question.decision && current.spot.bb > 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Pot {(current.spot.potBefore / current.spot.bb).toFixed(1)} BB · à payer{' '}
              {(current.spot.toCall / current.spot.bb).toFixed(1)} BB
            </p>
          )}
          <p className="font-semibold">{question.prompt}</p>

          {question.decision ? (
            <div className="flex gap-2">
              {question.options.map((opt) => {
                const isCorrect = chosen && opt === question.correct;
                const isWrongChoice = chosen === opt && opt !== question.correct;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={!!chosen}
                    onClick={() => answer(opt)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      isCorrect
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : isWrongChoice
                          ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          : 'border-neutral-300 hover:border-emerald-400 dark:border-neutral-600'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Fiche de revue (pas de note) — compare ta taille à la recette.
            </p>
          )}

          {(chosen || !question.decision) && (
            <div className="flex flex-col gap-2 text-sm">
              {question.decision && (
                <p className={chosen === question.correct ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-red-700 dark:text-red-300'}>
                  {chosen === question.correct ? '✓ Bonne décision' : `✗ La bonne action : ${question.correct}`}
                </p>
              )}
              <p className="text-neutral-600 dark:text-neutral-300">{question.explain}</p>
              {costText && (
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  Ça t’a coûté {costText} en espérance.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowHand((v) => !v)}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  {showHand ? 'Masquer la main' : 'Revoir la main complète (abattage)'}
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Suivant →
                </button>
              </div>

              {showHand && (hand ? <HandReplay hand={hand} /> : <p className="text-xs text-neutral-400">Chargement de la main…</p>)}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
