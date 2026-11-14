import Link from 'next/link';

// Pied de page commun : cadre du jeu responsable + liens légaux. Barre sombre,
// cohérente sur toutes les pages (claires comme sombres).

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-4 py-4 text-center text-xs text-slate-400">
      <p className="mx-auto max-w-2xl">
        Outil d’entraînement, sans argent réel. Ne pas utiliser pendant une partie en ligne.
      </p>
      <p className="mx-auto mt-1.5 max-w-2xl text-slate-500">
        Réservé aux personnes majeures. Les jeux d’argent et de hasard peuvent être dangereux : pertes
        d’argent, conflits familiaux, addiction… Retrouvez des conseils sur{' '}
        <a
          href="https://www.joueurs-info-service.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-300 underline"
        >
          joueurs-info-service.fr
        </a>{' '}
        (09 74 75 13 13, appel non surtaxé).
      </p>
      <nav className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-slate-400">
        <Link href="/mentions-legales" className="hover:text-slate-200">
          Mentions légales
        </Link>
        <span className="text-slate-700">·</span>
        <Link href="/confidentialite" className="hover:text-slate-200">
          Confidentialité
        </Link>
        <span className="text-slate-700">·</span>
        <Link href="/aide/import" className="hover:text-slate-200">
          Aide
        </Link>
      </nav>
    </footer>
  );
}
