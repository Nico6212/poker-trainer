import { BackupButtons } from '@/components/BackupButtons';
import { SiteNav } from '@/components/SiteNav';

export const metadata = {
  title: 'Confidentialité',
  description:
    'Aucune donnée personnelle collectée. Tes historiques et ta progression restent dans ton navigateur et ne sont jamais envoyés.',
};

const SECTION = 'rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5';

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-6">
        <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">Confidentialité</h1>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Aucune donnée collectée</h2>
          <p className="mt-2 text-sm text-slate-300">
            Poker Trainer ne collecte <strong className="text-slate-100">aucune donnée personnelle</strong> :
            pas de compte, pas d’inscription, pas de cookie publicitaire.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Tes données restent chez toi</h2>
          <p className="mt-2 text-sm text-slate-300">
            Les historiques que tu importes et ta progression (parties, drills, répétition espacée) sont
            stockés <strong className="text-slate-100">uniquement dans ton navigateur</strong> (IndexedDB et
            localStorage). Ils ne sont <strong className="text-slate-100">jamais envoyés</strong> à un serveur.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Changer d’appareil : exporte ta progression</h2>
          <p className="mt-2 text-sm text-slate-300">
            Sans compte, rien n’est synchronisé. Pour passer d’un ordinateur ou d’un navigateur à un autre,
            exporte ta progression (elle inclut tes mains importées et tes erreurs), puis importe le fichier
            sur l’autre appareil. <strong className="text-slate-100">L’import fusionne</strong> avec les données
            existantes — il n’efface rien.
          </p>
          <div className="mt-3">
            <BackupButtons />
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Comment tout effacer</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li>
              • Bouton <strong className="text-slate-100">« Effacer les données importées »</strong> en bas de la
              page Import (supprime les mains et erreurs).
            </li>
            <li>
              • Pour tout effacer (progression comprise) : vide les données du site dans ton navigateur
              (Réglages → Confidentialité → Données des sites).
            </li>
          </ul>
        </section>

        <p className="text-xs text-slate-500">
          Si un outil de mesure d’audience venait à être ajouté, cette page serait mise à jour. Aucun n’est
          présent aujourd’hui.
        </p>
      </main>
    </div>
  );
}
