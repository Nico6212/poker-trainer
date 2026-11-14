'use client';

import { useState } from 'react';
import type { RaiseAdvice } from '@/lib/poker/advice';
import {
  getDisplayedPot,
  heroPotOdds,
  legalActions,
  playerAt,
  type HandState,
} from '@/lib/poker/engine';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import { hitOdds, ruleOf2and4Corrected } from '@/lib/poker/outs';
import { requiredSentence } from '@/lib/poker/pot';
import type { PreflopVerdict } from '@/lib/poker/preflop-verdict';
import { CHART_LABELS, type PushFoldSpot } from '@/lib/poker/pushfold';
import { CardView } from './CardView';
import { RangeGrid } from './RangeGrid';
import type { EquityInfo } from './useEquity';

type Props = {
  hand: HandState;
  heroSeat: number;
  botSeat: number;
  equity: EquityInfo;
  mode: DisplayMode;
  advice: RaiseAdvice | null;
  /** Spot push/fold du héros (préflop ≤ 13 BB) : remplace le conseil de taille. */
  pushSpot?: PushFoldSpot | null;
  /** Verdict de range préflop : remplace le verdict équité/cote. */
  preflop?: PreflopVerdict | null;
  /** Mode examen : cache le % requis, l'équité, les outs, le verdict et le conseil. */
  mask?: boolean;
};

const ACTION_LABEL: Record<string, string> = {
  raise: 'Relance',
  call: 'Call',
  fold: 'Couche-toi',
};

/** Comment nommer la position dans la phrase : HU → bouton/SB, sinon le libellé. */
function positionPhrase(verdict: PreflopVerdict): string {
  return verdict.headsUp ? 'au bouton / petite blinde (heads-up)' : `depuis ${verdict.position}`;
}

/** Section « Préflop · ta décision » : verdict de range, pas d'équité/cote. */
export function PreflopSection({
  verdict,
  fmt,
  feedback = null,
}: {
  verdict: PreflopVerdict;
  fmt: (cents: number) => string;
  /** Si fourni, affiche un retour ✓/✗ (après la décision, en Masqué/Examen). */
  feedback?: { pick: 'raise' | 'call' | 'fold'; correct: boolean } | null;
}) {
  const [showGrid, setShowGrid] = useState(false);
  const raise = verdict.recommended.includes('raise');
  const call = verdict.recommended.includes('call');
  const fold = verdict.recommended.includes('fold');
  const where = positionPhrase(verdict);
  // « Ne complète jamais la petite blinde » seulement en 6-max / 3-max (pas en HU).
  const neverLimp = verdict.headsUp ? '' : ' Ne complète jamais la petite blinde.';

  let sentence: string;
  if (verdict.situation === 'push-fold') {
    sentence = raise
      ? `Tapis court : ${verdict.hand} ${where} → à tapis.`
      : `Tapis court : ${verdict.hand} ${where} → couche-toi.`;
  } else if (verdict.situation === 'open') {
    sentence = raise
      ? `${verdict.hand} ${where} : relance à ${fmt(verdict.raiseTo ?? 0)}.${neverLimp}`
      : `${verdict.hand} ${where} : couche-toi. Hors de la range d'ouverture.`;
  } else {
    sentence =
      raise && call
        ? `${verdict.hand} face à une relance : 3-bet (relance à ${fmt(verdict.raiseTo ?? 0)}) ou call, les deux se défendent.`
        : raise
          ? `${verdict.hand} face à une relance : 3-bet à ${fmt(verdict.raiseTo ?? 0)}.`
          : call
            ? `${verdict.hand} face à une relance : paie.`
            : `${verdict.hand} face à une relance : couche-toi.`;
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Préflop · ta décision
        </h3>
        {feedback && (
          <span
            className={`text-xs font-bold ${
              feedback.correct
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {feedback.correct ? '✓ Bonne lecture' : '✗ À revoir'}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {verdict.recommended.map((action) => (
          <span
            key={action}
            className={`rounded-md px-2 py-0.5 text-sm font-bold ${
              action === 'fold'
                ? 'bg-red-600 text-white'
                : action === 'call'
                  ? 'bg-sky-500 text-white'
                  : 'bg-emerald-600 text-white'
            }`}
          >
            {ACTION_LABEL[action]}
          </span>
        ))}
        {fold && verdict.situation === 'open' && (
          <span className="text-sm text-neutral-500">— ou relance, jamais limp</span>
        )}
      </div>
      <p className="text-sm">{sentence}</p>
      {verdict.situation === 'vs-raise' && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Préflop, l’équité ne suffit pas : la position et la suite du coup comptent.
        </p>
      )}
      {verdict.chart.raise.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className="text-xs font-semibold text-emerald-700 underline dark:text-emerald-300"
          >
            {showGrid ? 'Masquer la range' : 'Pourquoi ? Voir la range'}
          </button>
          {showGrid && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                {verdict.rangeLabel} · ta main surlignée
              </p>
              <RangeGrid verdict={verdict} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </h3>
      <div className="text-sm">{children}</div>
    </section>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
      <div className={`h-full ${className}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Panel({
  hand,
  heroSeat,
  botSeat,
  equity,
  mode,
  advice,
  pushSpot = null,
  preflop = null,
  mask = false,
}: Props) {
  const bb = hand.blinds.bb;
  const fmt = (cents: number) => formatAmount(cents, mode, bb);
  // Préflop, le verdict de range remplace la cote et le verdict équité ;
  // l'équité reste indicative seulement face à une relance.
  const showEquityPreflop = !preflop || preflop.situation === 'vs-raise';

  if (hand.result) {
    return (
      <aside className="rounded-xl border border-black/10 bg-white/70 p-4 text-sm text-neutral-500 backdrop-blur dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-400">
        Main terminée. Le panneau reprendra à la prochaine main.
      </aside>
    );
  }

  const hero = playerAt(hand, heroSeat);
  const villain = playerAt(hand, botSeat);
  const activeOpponents = hand.players.filter(
    (p) => p.seat !== heroSeat && p.status !== 'folded',
  ).length;
  const totalNow = getDisplayedPot(hand);
  const heroTurn = hand.toActSeat === heroSeat;
  const la = heroTurn ? legalActions(hand) : null;
  const heroOdds = heroPotOdds(hand, heroSeat);
  const facing = la && la.callAmount > 0 && heroOdds ? { call: la.callAmount, odds: heroOdds } : null;

  const onFlopOrTurn = hand.street === 'flop' || hand.street === 'turn';
  const guaranteedTwo =
    villain.status === 'all-in' || (facing !== null && facing.call >= hero.stack);
  const cardsToCome: 1 | 2 = hand.street === 'flop' && guaranteedTwo ? 2 : 1;
  const unseen = 50 - hand.board.length;

  const required = facing ? facing.odds.required : null;
  const verdict =
    facing && equity.status === 'ready' && equity.equity !== null && required !== null
      ? equity.equity - required
      : null;

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-neutral-900/70">
      <Section title="1 · Le pot">
        {facing ? (
          <p>
            Au milieu {fmt(facing.odds.potBefore)} + ton call {fmt(facing.odds.toCall)} ={' '}
            <strong>pot final {fmt(facing.odds.finalPot)}</strong>
          </p>
        ) : (
          <p>
            Pot : <strong>{fmt(totalNow)}</strong>
          </p>
        )}
      </Section>

      {/* Rappel réservé au postflop : préflop, l'examen pose une question de range. */}
      {mask && hand.street !== 'preflop' && (
        <Section title="Mode examen">
          <p className="text-neutral-500 dark:text-neutral-400">
            Les chiffres sont cachés : fais le calcul de tête à partir du pot et de sa mise.
            (Touche E pour désactiver.)
          </p>
        </Section>
      )}

      {!mask && preflop && <PreflopSection verdict={preflop} fmt={fmt} />}

      {!mask && !preflop && facing && required !== null && (
        <Section title="2 · Ce qu’il te faut">
          <p>
            {requiredSentence(
              {
                toCall: facing.call,
                potBefore: facing.odds.finalPot - facing.call,
                finalPot: facing.odds.finalPot,
                required,
              },
              hero.streetBet,
              fmt,
            )}
          </p>
        </Section>
      )}

      {!mask && showEquityPreflop && (
      <Section title="3 · Ton équité">
        {equity.status === 'ready' && equity.equity !== null ? (
          <p>
            <strong className="text-lg">{pct(equity.equity)}</strong>{' '}
            <span className="text-neutral-500 dark:text-neutral-400">
              contre la range estimée de {villain.name} ({equity.rangeLabel}
              {equity.comboCount ? ` · ${equity.comboCount} combos` : ''})
            </span>
          </p>
        ) : (
          <p className="animate-pulse text-neutral-500 dark:text-neutral-400">
            Calcul en cours… {equity.rangeLabel ? `(${equity.rangeLabel})` : ''}
          </p>
        )}
      </Section>
      )}

      {!mask && onFlopOrTurn && equity.status === 'ready' && (
        <Section title="4 · Tes outs">
          {equity.aheadNow ? (
            <p className="text-neutral-500 dark:text-neutral-400">
              Tu es sans doute déjà devant : pas d’outs à compter.
            </p>
          ) : equity.outs.length === 0 ? (
            <p className="text-neutral-500 dark:text-neutral-400">
              Aucune carte seule ne te fait passer devant.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1">
                {equity.outs.map((card) => (
                  <CardView key={card} card={card} size="sm" />
                ))}
              </div>
              <p>
                {cardsToCome === 2 && equity.outs.length > 8
                  ? `${equity.outs.length} outs : 3 × ${equity.outs.length} + 8 ≈ `
                  : `${equity.outs.length} outs × ${cardsToCome === 2 ? 4 : 2} ≈ `}
                <strong>{pct(ruleOf2and4Corrected(equity.outs.length, cardsToCome))}</strong>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {' '}
                  (exact : {pct(hitOdds(equity.outs.length, unseen, cardsToCome))})
                </span>
              </p>
            </div>
          )}
        </Section>
      )}

      {onFlopOrTurn && (
        <Section title="5 · Une carte ou deux ?">
          <p>
            {hand.street === 'turn'
              ? 'Dernière carte : la river.'
              : guaranteedTwo
                ? 'Il est à tapis (ou tu le serais en payant) → tu vois turn et river.'
                : 'Il lui reste des jetons → une seule carte garantie.'}
          </p>
        </Section>
      )}

      {!mask && !preflop && facing && required !== null && (
        <Section title="6 · Le verdict">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span>Ton équité</span>
              <span>{equity.equity !== null ? pct(equity.equity) : '…'}</span>
            </div>
            <Bar value={equity.equity ?? 0} className="bg-emerald-500" />
            <div className="flex items-center justify-between text-xs">
              <span>Ce qu’il te faut</span>
              <span>{pct(required)}</span>
            </div>
            <Bar value={required} className="bg-amber-500" />
            {verdict !== null ? (
              <p
                className={`font-semibold ${verdict >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {verdict >= 0
                  ? `Payer est rentable (+${Math.round(verdict * 100)} points).`
                  : `Payer est perdant (${Math.round(verdict * 100)} points).`}
              </p>
            ) : (
              <p className="animate-pulse text-neutral-500 dark:text-neutral-400">Calcul…</p>
            )}
          </div>
        </Section>
      )}

      {activeOpponents > 1 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠ Pot à {activeOpponents + 1} joueurs : l’équité affichée est calculée contre UNE
          seule range ({villain.name}) — ta vraie équité multiway est plus basse. La cote
          requise (call ÷ pot final), elle, reste juste : prends une marge.
        </p>
      )}

      {!mask && pushSpot && (
        <Section title="Push ou fold ? (tapis court)">
          {pushSpot.kind === 'open-shove' ? (
            <p>
              Tapis {Math.round(pushSpot.stackBB)} BB, {CHART_LABELS[pushSpot.chart]} :{' '}
              {pushSpot.hand} →{' '}
              <strong
                className={
                  pushSpot.shove
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {pushSpot.shove ? 'PUSH (tapis — raccourci 5)' : 'FOLD'}
              </strong>{' '}
              <span className="text-neutral-500 dark:text-neutral-400">
                — tableau ~Nash : à cette profondeur on ne limp plus, on n’open plus petit.
              </span>
            </p>
          ) : (
            <p>
              Il push, {Math.round(pushSpot.stackBB)} BB effectives (
              {CHART_LABELS[pushSpot.chart]}) : {pushSpot.hand} →{' '}
              <strong
                className={
                  pushSpot.call
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {pushSpot.call ? 'PAYER' : 'JETER'}
              </strong>
            </p>
          )}
        </Section>
      )}

      {!mask && advice && (
        <Section title={advice.kind === 'bet' ? 'Combien miser ?' : 'Combien relancer ?'}>
          <div className="flex flex-col gap-1">
            <p>
              <strong className="text-lg">{fmt(advice.amount)}</strong>
              {advice.isAllIn ? ' (tapis)' : ''}{' '}
              <span className="text-neutral-500 dark:text-neutral-400">— {advice.recipe}</span>
            </p>
            <p>
              S’il paie {fmt(advice.villainCall)} dans un pot final de {fmt(advice.finalIfCalled)},
              tu lui offres <strong>{pct(advice.villainOdds)}</strong> : il doit gagner plus
              d’1 fois sur {Math.max(2, Math.round(1 / Math.max(0.01, advice.villainOdds)))} pour
              te payer.
            </p>
            <p>
              En bluff pur : tu risques {fmt(advice.risk)} pour gagner {fmt(advice.potBefore)} →
              il doit se coucher au moins <strong>{pct(advice.foldEquityNeeded)}</strong> du temps.
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Touche S ou chip « Conseil » pour pré-remplir ce montant.
            </p>
          </div>
        </Section>
      )}
    </aside>
  );
}
