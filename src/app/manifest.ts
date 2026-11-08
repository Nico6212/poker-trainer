import type { MetadataRoute } from 'next';

// Manifest PWA : permet « Ajouter à l'écran d'accueil » avec une vraie icône
// et une ouverture plein écran, comme une application native.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Poker Trainer',
    short_name: 'Poker Trainer',
    description:
      "Entraînement NL Hold'em : cote du pot, outs, équité et push/fold contre des bots, sans argent réel.",
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#065f46',
    theme_color: '#065f46',
    lang: 'fr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
