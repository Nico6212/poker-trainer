import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav } from '@/components/SiteNav';
import { CopyButton } from './CopyButton';

export const metadata = {
  title: 'Importer ses mains PokerStars',
  description:
    'Guide pas à pas : activer l’historique en anglais, trouver ses fichiers PokerStars, afficher les extensions et importer ses mains. 100 % dans ton navigateur.',
};

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
      </div>
    </div>
  );
}

/** Petit « fil d'Ariane » maquetté pour illustrer un chemin de menu. */
function MenuPath({ parts }: { parts: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
      {parts.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-600">›</span>}
          <span className={i === parts.length - 1 ? 'font-semibold text-emerald-300' : 'text-slate-400'}>{p}</span>
        </span>
      ))}
    </div>
  );
}

function PathBox({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-200">{path}</code>
      <CopyButton text={path} />
    </div>
  );
}

const SECTION = 'scroll-mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6';

export default function AideImportPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <SiteNav />

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">Importer ses mains PokerStars</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Tout se passe <strong className="text-slate-200">dans ton navigateur</strong> : aucun fichier n’est envoyé.
            Compte 2 minutes la première fois.
          </p>
        </div>

        {/* 1. Anglais */}
        <section id="anglais" className={SECTION}>
          <Step n={1} title="Activer l’historique en anglais">
            <p>Dans PokerStars :</p>
            <MenuPath parts={['Réglages', 'Historique de jeu', 'Historique des mains']} />
            <p>
              Coche <strong className="text-slate-100">« Sauvegarder mon historique de mains »</strong> et{' '}
              <strong className="text-slate-100">« Sauvegarder en anglais »</strong>.
            </p>
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200/90 ring-1 ring-amber-500/20">
              ⚠ Seules les mains jouées <strong>après</strong> ce réglage seront lisibles. Les anciennes restent en
              français et seront ignorées.
            </p>
          </Step>
        </section>

        {/* 2. Trouver */}
        <section id="trouver" className={SECTION}>
          <Step n={2} title="Trouver ses fichiers">
            <p className="font-medium text-slate-200">Méthode A — depuis PokerStars</p>
            <MenuPath parts={['Réglages', 'Historique de jeu', 'Historique des mains', 'Ouvrir le dossier']} />
            <p>Ouvre ensuite le sous-dossier à ton pseudo.</p>

            <p className="pt-1 font-medium text-slate-200">Méthode B — chemin direct</p>
            <p>
              Dans la fenêtre « Ouvrir » de l’import, colle ce chemin dans la barre d’adresse (Windows) :
            </p>
            <PathBox path="%LOCALAPPDATA%\PokerStars.FR\HandHistory" />
            <p className="text-xs text-slate-400">
              Sur macOS : <code className="font-mono text-slate-300">~/Library/Application Support/PokerStars…/HandHistory</code>{' '}
              <span className="text-slate-500">(à vérifier selon la version)</span>.
            </p>
          </Step>
        </section>

        {/* 3. Reconnaître + extensions */}
        <section id="extensions" className={SECTION}>
          <Step n={3} title="Reconnaître les fichiers">
            <p>
              Ils commencent par <code className="font-mono text-slate-100">HH</code> + une date, type « Document texte ».
              Exemple :
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span className="text-slate-500">📄</span>
              <code className="font-mono text-xs text-slate-200">HH20261113 Brachium VI - 0,01 €-0,02 € - EUR Hold’em No Limit.txt</code>
            </div>
            <p>
              Windows masque souvent le <code className="font-mono text-slate-100">.txt</code>. Pour l’afficher :
            </p>
            <MenuPath parts={['Explorateur', 'Affichage', 'Afficher', 'Extensions de noms de fichiers']} />
          </Step>
        </section>

        {/* 4. Importer */}
        <section id="importer" className={SECTION}>
          <Step n={4} title="Importer">
            <p>
              Sélectionne tout (<kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>{' '}
              + <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-xs">A</kbd>), puis
              glisse les fichiers sur la zone de dépôt ou clique « Ouvrir ».
            </p>
            <p>
              Une journée = 4 à 8 fichiers, tu peux tout déposer d’un coup. Les fichiers non pris en charge (tournois,
              historiques en français) sont <strong className="text-slate-100">ignorés automatiquement</strong>, avec un
              message.
            </p>
            <Link
              href="/import"
              className="inline-block rounded-lg border-b-4 border-emerald-800 bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-[transform,border] duration-75 hover:bg-emerald-500 active:translate-y-1 active:border-b-0"
            >
              Aller à l’import →
            </Link>
          </Step>
        </section>

        {/* 5. Pris en charge */}
        <section id="supporte" className={SECTION}>
          <Step n={5} title="Ce qui est pris en charge aujourd’hui">
            <ul className="space-y-1">
              {['PokerStars', 'Hold’em No Limit', 'Cash game', 'Historique en anglais'].map((x) => (
                <li key={x} className="flex items-center gap-2 text-emerald-300">
                  <span className="text-emerald-400">✓</span> {x}
                </li>
              ))}
            </ul>
            <p className="pt-1 font-medium text-slate-300">Pas encore :</p>
            <ul className="space-y-1">
              {['Tournois / Spin & Go', 'Winamax, PMU, autres sites'].map((x) => (
                <li key={x} className="flex items-center gap-2 text-slate-500">
                  <span>🚧</span> {x}
                </li>
              ))}
            </ul>
          </Step>
        </section>

        <p className="pb-4 text-center text-xs text-slate-500">
          Analyse 100 % locale · aucune donnée envoyée ·{' '}
          <Link href="/import" className="font-semibold text-emerald-400 underline">
            revenir à l’import
          </Link>
        </p>
      </main>
    </div>
  );
}
