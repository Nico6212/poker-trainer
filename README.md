# Poker Trainer

Table d'entraînement No-Limit Hold'em : joue contre des bots pendant que l'application t'affiche (ou te cache, c'est le but) le pot, la cote du pot, tes outs et ton équité en direct. L'objectif : **créer des automatismes de calcul** pour le cash game micro-limites (NL2 à NL10) et les Spin & Go.

> Outil d'entraînement, sans argent réel. Ne pas utiliser pendant une partie en ligne.

## Fonctionnalités

- **Table de jeu** : heads-up ou 6-max contre 4 profils de bots (station, serré, agressif, reg), limites NL2/NL5/NL10, side pots, relance minimum, recave automatique.
- **Mode Spin & Go 3-max** : 25 BB de départ, blindes croissantes, élimination, winner-take-all, avec bots en push/fold (tableaux ~Nash) à tapis court.
- **Panneau pédagogique** : décomposition du pot, « il te faut X % », équité Monte-Carlo contre la range estimée du bot (jamais ses vraies cartes), outs + règle du 2 et du 4, verdict, conseil de taille de mise avec cote offerte et fold equity.
- **Trois niveaux d'aide** : Découverte (tout visible) → Masqué (les chiffres après ta décision) → Examen (tu calcules d'abord, correction à ±5 points avec diagnostic des confusions).
- **Drill** : séries de 20 spots ou sprint de 2 minutes — cote du pot, flash-cards tailles→%, outs, équité, ranges préflop, push/fold, mixte entrelacé. Statut de maîtrise par compétence (précision × vitesse).
- **Suivi** : chaque décision enregistrée et classée (call sans la cote, fold trop serré, taille hors norme), erreurs rejouées en **répétition espacée** (Leitner), bilan de session (VPIP, PFR, 3-bet, agression, temps médian), historique multi-sessions, export/import JSON.

Tout tourne **en local dans le navigateur** : aucun compte, aucune base de données, les données restent dans le `localStorage`.

## Stack

- [Next.js](https://nextjs.org) (App Router) · TypeScript strict · Tailwind CSS v4
- [pokersolver](https://github.com/goldfire/pokersolver) pour l'évaluation des mains
- Monte-Carlo (équité + outs) dans un **Web Worker**
- Tests : [Vitest](https://vitest.dev) — toute la logique (`src/lib/poker`) est pure, sans React, et testée

## Installation

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Scripts

| Commande          | Effet                                |
| ----------------- | ------------------------------------ |
| `pnpm dev`        | serveur de développement             |
| `pnpm build`      | build de production                  |
| `pnpm start`      | sert le build de production          |
| `pnpm test`       | lance la suite Vitest                |
| `pnpm test:watch` | tests en continu                     |
| `pnpm lint`       | ESLint                               |

## Déploiement (Vercel)

L'application est 100 % statique, aucune configuration spéciale :

1. Pousser le dépôt sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Add New → Project → Import** le dépôt. Le framework Next.js est détecté automatiquement — cliquer **Deploy**.
3. Domaine personnalisé : **Settings → Domains → Add**, puis chez le registrar créer un enregistrement `A` vers `76.76.21.21` (apex) et un `CNAME www` vers `cname.vercel-dns.com`. Le HTTPS est automatique.

## Architecture

```
src/
  lib/poker/          ← logique pure, sans React, testée
    cards.ts          ← cartes, paquet, mélange (RNG injectable)
    engine.ts         ← état de la main, enchères, side pots, showdown
    pot.ts            ← pot, cote du pot
    equity.ts         ← Monte-Carlo contre une range
    outs.ts           ← détection des outs
    ranges.ts         ← ranges 6-max par position (données)
    pushfold.ts       ← tableaux push/fold ~Nash (≤ 13 BB)
    advice.ts         ← tailles de mise conseillées + rentabilité
    session.ts        ← décisions, erreurs, stats, persistance
    srs.ts            ← répétition espacée des erreurs (Leitner)
    drill.ts          ← générateur de spots d'entraînement
    bots/             ← profils de bots
  workers/equity.worker.ts
  components/table/   ← table, sièges, panneau, examen, bilan
  components/drill/   ← mode drill
  app/                ← pages (table, /drill)
```

Tous les montants du moteur sont en **centimes entiers** (ou en jetons) : aucun flottant.

## Dette technique

- **Thème sombre** : `globals.css` remappe la palette Tailwind `neutral` sur `slate` pour unifier le sombre sans réécrire tous les composants d'un coup. Remplacer progressivement `neutral` par `slate` dans les composants, puis supprimer le remappage (`@theme` dans `globals.css`).
