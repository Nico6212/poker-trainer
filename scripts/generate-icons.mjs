// Génère les icônes PWA (PNG) à partir du pique vert.
// Usage : node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('src/app/icon.svg');

// Variante « maskable » / iOS : fond vert plein bord (le système applique son propre masque),
// pique réduit pour rester dans la zone sûre (80 %).
const fullBleed = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#065f46"/>
    <g transform="translate(32 32) scale(0.72) translate(-32 -32)">
      <path d="M32 10c6 9 17 15 17 25a10 10 0 0 1-15 8.6c.8 4 2.4 6.8 4.5 9.4H25.5c2.1-2.6 3.7-5.4 4.5-9.4A10 10 0 0 1 15 35c0-10 11-16 17-25z" fill="#ffffff"/>
    </g>
  </svg>`,
);

const render = (input, size, file) =>
  sharp(input, { density: 512 }).resize(size, size).png().toFile(file);

await render(svg, 192, 'public/icon-192.png');
await render(svg, 512, 'public/icon-512.png');
await render(fullBleed, 512, 'public/icon-maskable-512.png');
await render(fullBleed, 180, 'src/app/apple-icon.png');

console.log('Icônes générées : 192, 512, maskable-512, apple-180.');
