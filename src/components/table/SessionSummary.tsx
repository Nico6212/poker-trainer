'use client';

import { useEffect, useRef, useState } from 'react';
import { exportBackup, importBackup } from '@/lib/poker/backup';
import { formatAmount, type DisplayMode } from '@/lib/poker/format';
import {
  loadHistory,
  type SessionArchive,
  type SessionData,
  type SessionStats,
} from '@/lib/poker/session';
import { HandReview } from './HandReview';

type Props = {
  data: SessionData;
  stats: SessionStats;
  mode: DisplayMode;
  bb: number;
  onClose: () => void;
  onNewSession: () => void;
};

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);

function Tile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'good' | 'bad';
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p
        className={`text-lg font-bold ${
          accent === 'good' ? 'text-emerald-600' : accent === 'bad' ? 'text-red-600' : ''
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}

const netBBText = (netBB: number) =>
  `${netBB >= 0 ? '+' : ''}${(Math.round(netBB * 10) / 10).toString().replace('.', ',')} BB`;

/** Écran de fin de session : bilan, stats perso, erreurs cliquables, progression, sauvegarde. */
export function SessionSummary({ data, stats, mode, bb, onClose, onNewSession }: Props) {
  const [reviewHandId, setReviewHandId] = useState<number | null>(null);
  const [history, setHistory] = useState<SessionArchive[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setHistory(loadHistory()), []);

  const errors = data.decisions.filter((d) => d.isError);
  const sizeWarnings = data.decisions.filter((d) => d.sizeWarning);
  const reviewRecord =
    reviewHandId !== null ? data.hands.find((h) => h.handId === reviewHandId) : undefined;

  const doExport = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `poker-trainer-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      if (importBackup(text)) {
        window.location.reload();
      } else {
        window.alert('Fichier de sauvegarde non reconnu.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Bilan de session</h2>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile label="Mains jouées" value={String(stats.handsPlayed)} />
          <Tile
            label="Résultat"
            value={`${netBBText(stats.netBB)} (${formatAmount(stats.netCents, 'eur', bb)})`}
            accent={stats.netBB >= 0 ? 'good' : 'bad'}
            hint="Le résultat, c'est la variance…"
          />
          <Tile
            label="Qualité des calls"
            value={
              stats.avgCallMarginPts === null
                ? '—'
                : `${stats.avgCallMarginPts >= 0 ? '+' : ''}${Math.round(stats.avgCallMarginPts)} pts`
            }
            accent={
              stats.avgCallMarginPts === null
                ? undefined
                : stats.avgCallMarginPts >= 0
                  ? 'good'
                  : 'bad'
            }
            hint="…ça, c'est ton process (marge moyenne équité − requis)."
          />
          <Tile
            label="Mode examen"
            value={
              stats.examAsked > 0
                ? `${stats.examCorrect}/${stats.examAsked} (${Math.round((stats.examCorrect / stats.examAsked) * 100)} %)`
                : '—'
            }
          />
          <Tile
            label="Temps médian"
            value={
              stats.medianDecisionMs === null
                ? '—'
                : `${(stats.medianDecisionMs / 1000).toFixed(1)} s`
            }
            hint="Objectif : précis ET rapide."
          />
          <Tile
            label="Erreurs"
            value={String(stats.errors)}
            accent={stats.errors > 0 ? 'bad' : 'good'}
          />
          <Tile label="VPIP" value={pct(stats.vpip)} hint="cible 6-max ≈ 22-28 %" />
          <Tile label="PFR" value={pct(stats.pfr)} hint="cible ≈ 17-22 %" />
          <Tile label="3-bet" value={pct(stats.threeBet)} hint="cible ≈ 5-9 %" />
          <Tile label="Agression postflop" value={pct(stats.aggression)} hint="cible ≈ 35-45 %" />
          <Tile
            label="Tailles hors norme"
            value={String(stats.sizeWarnings)}
            accent={stats.sizeWarnings > 2 ? 'bad' : undefined}
            hint="écart > 40 % du conseil"
          />
        </div>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Repères indicatifs pour du 6-max NL2 — peu fiables sous 200 mains.
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
            Tes erreurs ({errors.length})
          </h3>
          {errors.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Aucune erreur face à une mise. Beau travail.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {errors.map((d, i) => {
                const hasRecord = data.hands.some((h) => h.handId === d.handId);
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-950/40"
                  >
                    <span>
                      Main n°{d.handId} · {d.street} ·{' '}
                      {d.errorKind === 'call-sans-cote'
                        ? `payé ${formatAmount(d.callAmount, mode, bb)} avec ${d.equity !== null ? pct(d.equity) : '?'} (requis ${pct(d.required)})`
                        : `couché avec ${d.equity !== null ? pct(d.equity) : '?'} (requis ${pct(d.required)})`}
                    </span>
                    <button
                      type="button"
                      disabled={!hasRecord}
                      onClick={() => setReviewHandId(d.handId)}
                      className="shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-200 dark:text-black dark:hover:bg-white"
                    >
                      Revoir
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Chaque erreur rejoint la file d’échauffement : tu la rejoueras au début des
            prochaines sessions, à intervalles espacés.
          </p>
        </section>

        {sizeWarnings.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
              Tailles hors norme ({sizeWarnings.length})
            </h3>
            <ul className="flex flex-col gap-1.5">
              {sizeWarnings.map((d, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40"
                >
                  Main n°{d.handId} · {d.street} ·{' '}
                  {d.action === 'bet' ? 'misé' : 'relancé à'}{' '}
                  {d.sizeAmount !== null && d.sizeAmount !== undefined
                    ? formatAmount(d.sizeAmount, mode, bb)
                    : '—'}{' '}
                  (conseillé ≈{' '}
                  {d.sizeAdvised !== null && d.sizeAdvised !== undefined
                    ? formatAmount(d.sizeAdvised, mode, bb)
                    : '—'}
                  )
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
              Progression ({history.length} session{history.length > 1 ? 's' : ''} archivée
              {history.length > 1 ? 's' : ''})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Mains</th>
                    <th className="py-1 pr-2">Net</th>
                    <th className="py-1 pr-2">Examen</th>
                    <th className="py-1 pr-2">Erreurs</th>
                    <th className="py-1">Temps méd.</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(-10).map((archive, i) => (
                    <tr key={i} className="border-t border-neutral-200 dark:border-neutral-700">
                      <td className="py-1 pr-2">
                        {new Date(archive.endedAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </td>
                      <td className="py-1 pr-2">{archive.stats.handsPlayed}</td>
                      <td
                        className={`py-1 pr-2 font-semibold ${archive.stats.netBB >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                      >
                        {netBBText(archive.stats.netBB)}
                      </td>
                      <td className="py-1 pr-2">
                        {archive.stats.examAsked > 0
                          ? `${Math.round((archive.stats.examCorrect / archive.stats.examAsked) * 100)} %`
                          : '—'}
                      </td>
                      <td className="py-1 pr-2">{archive.stats.errors}</td>
                      <td className="py-1">
                        {archive.stats.medianDecisionMs !== null
                          ? `${(archive.stats.medianDecisionMs / 1000).toFixed(1)} s`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-neutral-200 px-4 py-2.5 font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
          >
            Reprendre la session
          </button>
          <button
            type="button"
            onClick={onNewSession}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            Nouvelle session
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-neutral-500">
          <button type="button" onClick={doExport} className="underline hover:text-neutral-700">
            Exporter mes données (JSON)
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="underline hover:text-neutral-700"
          >
            Importer une sauvegarde
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => doImport(e.target.files?.[0])}
          />
        </div>
      </div>

      {reviewRecord && (
        <HandReview
          record={reviewRecord}
          decisions={data.decisions.filter((d) => d.handId === reviewRecord.handId)}
          mode={mode}
          onClose={() => setReviewHandId(null)}
        />
      )}
    </div>
  );
}
