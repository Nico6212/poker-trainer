'use client';

import { useState } from 'react';

/** Bouton « Copier » un chemin dans le presse-papier (feedback 1,5 s). */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
    >
      {copied ? 'Copié ✓' : 'Copier'}
    </button>
  );
}
