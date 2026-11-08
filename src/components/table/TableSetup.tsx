'use client';

import { useState } from 'react';
import { PROFILE_DESCRIPTIONS, PROFILE_LABELS } from '@/lib/poker/bots/profiles';
import type { BotProfile } from '@/lib/poker/engine';
import { STAKES, type StakesKey, type TableConfig } from './useGame';

type Props = {
  current: TableConfig;
  onApply: (config: TableConfig) => void;
  onClose: () => void;
};

type Slot = BotProfile | '';

const PROFILES: BotProfile[] = ['station', 'tight', 'aggro', 'reg'];

const CASH_PRESETS: { label: string; bots: BotProfile[]; stakes: StakesKey }[] = [
  { label: 'NL2 heads-up station', bots: ['station'], stakes: 'nl2' },
  { label: 'NL2 6-max récréatif', bots: ['station', 'tight', 'aggro', 'station', 'aggro'], stakes: 'nl2' },
  { label: 'NL5 vs regs', bots: ['reg', 'tight', 'reg', 'aggro', 'reg'], stakes: 'nl5' },
  { label: 'NL10 heads-up reg', bots: ['reg'], stakes: 'nl10' },
];

/** Composition de la table : cash (limite, bots) ou Spin & Go 3-max. */
export function TableSetup({ current, onApply, onClose }: Props) {
  const [mode, setMode] = useState<'cash' | 'spin'>(current.mode);
  const [stakes, setStakes] = useState<StakesKey>(current.stakes);
  const [slots, setSlots] = useState<Slot[]>(
    Array.from({ length: 5 }, (_, i) => current.bots[i] ?? ''),
  );
  const [spinBots, setSpinBots] = useState<[BotProfile, BotProfile]>([
    current.mode === 'spin' ? (current.bots[0] ?? 'aggro') : 'aggro',
    current.mode === 'spin' ? (current.bots[1] ?? 'tight') : 'tight',
  ]);

  const cashBots = slots.filter((s): s is BotProfile => s !== '');
  const canApply = mode === 'spin' || cashBots.length >= 1;

  const selectClass =
    'rounded-md border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-600 dark:bg-neutral-800';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Composition de la table</h2>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('cash')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${
              mode === 'cash'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600'
            }`}
          >
            Cash game
          </button>
          <button
            type="button"
            onClick={() => setMode('spin')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${
              mode === 'spin'
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600'
            }`}
          >
            Spin &amp; Go 3-max
          </button>
        </div>

        {mode === 'cash' ? (
          <>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">Limite</span>
              <select
                value={stakes}
                onChange={(e) => setStakes(e.target.value as StakesKey)}
                className={`w-56 ${selectClass}`}
              >
                {(Object.keys(STAKES) as StakesKey[]).map((key) => (
                  <option key={key} value={key}>
                    {STAKES[key].label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-1.5">
              {CASH_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setStakes(preset.stakes);
                    setSlots(Array.from({ length: 5 }, (_, i) => preset.bots[i] ?? ''));
                  }}
                  className="rounded-md bg-neutral-200 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {slots.map((slot, i) => (
                <label key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Siège {i + 1}</span>
                  <select
                    value={slot}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((s, j) => (j === i ? (e.target.value as Slot) : s)),
                      )
                    }
                    className={`w-56 ${selectClass}`}
                  >
                    <option value="">— vide —</option>
                    {PROFILES.map((profile) => (
                      <option key={profile} value={profile}>
                        {PROFILE_LABELS[profile]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              3 joueurs, 25 BB de départ, blindes qui montent toutes les 10 mains, pas de
              recave : le dernier en vie gagne. Sous ~13 BB, tout le monde passe en
              push/fold — exactement ce que le mode entraîne.
            </p>
            {([0, 1] as const).map((i) => (
              <label key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Adversaire {i + 1}</span>
                <select
                  value={spinBots[i]}
                  onChange={(e) =>
                    setSpinBots((prev) => {
                      const next: [BotProfile, BotProfile] = [...prev];
                      next[i] = e.target.value as BotProfile;
                      return next;
                    })
                  }
                  className={`w-56 ${selectClass}`}
                >
                  {PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                      {PROFILE_LABELS[profile]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        )}

        <ul className="flex flex-col gap-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {PROFILES.map((profile) => (
            <li key={profile}>
              <strong>{PROFILE_LABELS[profile]}</strong> : {PROFILE_DESCRIPTIONS[profile]}
            </li>
          ))}
        </ul>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Appliquer lance une nouvelle {mode === 'spin' ? 'partie' : 'main'} avec les tapis
          réinitialisés. Toi, tu es toujours en bas de la table.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-neutral-200 px-4 py-2.5 font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() =>
              onApply(
                mode === 'spin'
                  ? { mode, stakes, bots: spinBots }
                  : { mode, stakes, bots: cashBots },
              )
            }
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === 'spin' ? 'Lancer le Spin' : `Appliquer (${cashBots.length + 1} joueurs)`}
          </button>
        </div>
      </div>
    </div>
  );
}
