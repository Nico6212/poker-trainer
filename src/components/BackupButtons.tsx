'use client';

import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '@/lib/poker/backup';

// Export / import de la sauvegarde (progression + mains importées). L'import fusionne.
// Styles « dark » : utilisé sur l'accueil et la page Confidentialité.

export function BackupButtons() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = async () => {
    setMsg(null);
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poker-trainer-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Sauvegarde téléchargée.');
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    setMsg('Fusion en cours…');
    const res = await importBackup(await file.text());
    setMsg(
      res
        ? `Sauvegarde fusionnée : ${res.addedHands} main(s) et ${res.addedMistakes} erreur(s) ajoutées.`
        : 'Fichier de sauvegarde non reconnu.',
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doExport}
          className="rounded-lg border-b-4 border-emerald-800 bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-emerald-500 active:translate-y-1 active:border-b-0"
        >
          Exporter ma progression
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          Importer une sauvegarde
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => doImport(e.target.files?.[0])}
        />
      </div>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
