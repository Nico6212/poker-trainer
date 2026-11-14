'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navigation commune à toutes les pages de contenu (look dark). La table garde son
// propre en-tête plein écran (contrôles de jeu) ; elle est atteignable via « Table ».

const ITEMS = [
  { label: 'Accueil', href: '/' },
  { label: 'Table', href: '/table' },
  { label: 'Drill', href: '/drill' },
  { label: 'Import', href: '/import' },
  { label: 'Mes erreurs', href: '/mes-erreurs' },
  { label: 'Mes adversaires', href: '/mes-adversaires' },
  { label: 'Aide', href: '/aide/import' },
];

export function SiteNav() {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-2 sm:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">♠</span>
        <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:inline">Poker Trainer</span>
      </Link>
      <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`shrink-0 rounded-md px-2.5 py-1 font-medium transition ${
              active(it.href)
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
