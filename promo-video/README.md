# Kalyx Wallet — film vertical

Composition Remotion de 60 secondes, 1080 × 1920, 60 images/seconde.

Les cinq écrans du film sont des captures existantes de `web/public/screens`. Le logo et les couleurs reprennent `ui/KalyxLogo.tsx` et `ui/tokens.ts`. La composition ajoute uniquement la mise en scène, la typographie et l’animation autour de ces images.

## Démarrer

```sh
npm install
npm run score
npm run studio
```

## Compiler et exporter

```sh
npm run typecheck
npm run render
```

L’export est écrit dans `out/kalyx-wallet-promo.mp4`. La composition `KalyxWalletPromo` se termine exactement à l’image 3 600 ; le score généré est également long de 60 secondes.
