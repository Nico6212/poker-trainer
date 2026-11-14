import { SiteNav } from '@/components/SiteNav';

export const metadata = {
  title: 'Mentions légales',
  description: 'Éditeur, directeur de la publication et hébergeur du site Poker Trainer.',
};

const SECTION = 'rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5';
const TODO = 'rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-500/20';

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-6">
        <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">Mentions légales</h1>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Éditeur du site</h2>
          <div className="mt-2 space-y-1 text-sm text-slate-300">
            <p>Elaphe Studio (Nicolas Hochart)</p>
            <p>
              Statut : <span className={TODO}>à compléter</span>
            </p>
            <p>
              SIRET : <span className={TODO}>à compléter</span>
            </p>
            <p>
              Adresse : <span className={TODO}>à compléter</span>
            </p>
            <p>
              Contact :{' '}
              <a href="mailto:contact.elaphestudio@gmail.com" className="text-emerald-400 underline">
                contact.elaphestudio@gmail.com
              </a>
            </p>
            <p>
              Téléphone : <span className={TODO}>à compléter</span>
            </p>
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Directeur de la publication</h2>
          <p className="mt-2 text-sm text-slate-300">Nicolas Hochart</p>
        </section>

        <section className={SECTION}>
          <h2 className="font-semibold text-slate-100">Hébergeur</h2>
          <div className="mt-2 space-y-1 text-sm text-slate-300">
            <p>Vercel Inc.</p>
            <p>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</p>
            <p>
              <a
                href="https://vercel.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline"
              >
                vercel.com
              </a>{' '}
              <span className="text-slate-500">(adresse indiquée sur leur site, à vérifier)</span>
            </p>
          </div>
        </section>

        <p className="text-xs text-slate-500">
          Poker Trainer est un outil d’entraînement sans argent réel. Aucune donnée personnelle n’est
          collectée — voir la page{' '}
          <a href="/confidentialite" className="text-emerald-400 underline">
            Confidentialité
          </a>
          .
        </p>
      </main>
    </div>
  );
}
