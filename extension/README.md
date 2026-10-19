# Kalyx Wallet — extension de navigateur

Extension Manifest V3 pour Chromium (Chrome, Brave, Edge). Elle réutilise le
cœur de l'app (`../src` : dérivation des clés, coffre, réseaux) ; seule
l'interface et les adaptateurs de plateforme sont propres à l'extension.

```bash
cd extension
npm install          # dépendances de l'extension uniquement (pas celles de l'app)
npm run build        # → .output/chrome-mv3
npm test             # tests unitaires (Vitest, faux navigateur)
npm run test:smoke   # charge l'extension dans Chromium et vérifie le cœur
npm run icons        # régénère les icônes depuis ../assets/icon.png
```

Charger en développement : `chrome://extensions` → « Mode développeur » →
« Charger l'extension non empaquetée » → `extension/.output/chrome-mv3`.

## Ce qui vient de l'app

Le calcul des soldes (`../lib/portfolio/holdings`) et le tri anti-spam de
l'historique (`../lib/historyTrust`) sont ceux de l'app, partagés tels quels.
Au build, deux modules sont remplacés pour l'extension seulement
(`scripts/registryPlugin.ts`) :

- le registre des réseaux → `lib/chainRegistry.ts` (EVM + Solana ; Bitcoin et
  TON viendront plus tard) ;
- le journal technique de l'app → `lib/noLog.ts` (l'extension ne garde aucun
  journal).

Aucune clé d'API n'est embarquée : les listes de tokens ERC-20 (indexeur
Alchemy) attendent le relais Kalyx. Les soldes natifs et Solana passent par
les RPC publics.

## Pont vers les dApps

```
page (dApp) ── inpage.js (monde MAIN : EIP-1193 + EIP-6963, Wallet Standard)
                 │ window.postMessage (même origine, même fenêtre)
              relay.js (script isolé, page principale seulement) ── port ──►
              service worker : origine lue par CHROME, permissions par site,
              réseau par site, fenêtre d'approbation séparée (approval.html)
```

`inpage.js` est enregistré dynamiquement (`scripting`) : précédé de
`inpage-flag.js` quand « Kalyx par défaut » est activé (il prend alors aussi
`window.ethereum`). Rien n'est contacté tant qu'une page ne s'adresse pas à un
portefeuille. Signatures depuis une dApp : lot 6.

Le cahier des charges (sécurité, onboarding, multi-chaîne) et le plan par lots
sont dans l'historique du projet.
