# 4. Structure du projet

> Structure **réelle** du dépôt (bêta ouverte, octobre 2026). Les couches suivent
> [03-ARCHITECTURE.md](03-ARCHITECTURE.md) : le moteur `src/` ne dépend jamais de
> React ; l'app, le tableau de bord web et les tests l'utilisent par `src/index.ts`.

```
kalyx-wallet/
├── app/                      Écrans (Expo Router)
│   ├── (tabs)/               Accueil, Explorer (navigateur dApps), Gagner, Menu
│   ├── welcome · create-wallet · import · import-wallet · watch-wallet · backup · verify
│   ├── set-pin · unlock · change-pin · security · duress · whitelist · approvals
│   ├── send · receive · swap · pay · scan · history · tracking · token/[id]
│   ├── wallets · accounts · contacts · networks · price-alerts · notifications
│   ├── cloud-backup · restore-drive · reveal-phrase · reveal-private-key
│   ├── walletconnect · solana-request · ai-settings · developer · journal
│   └── settings · language · faq · legal · about · support · invite · feature-request
│
├── ui/                       Interface
│   ├── kit/                  Design system : Button, HoldButton, Sheet, AmountKeypad, ActivityRow…
│   ├── web/                  Tableau de bord web + mini-app Telegram (WebDashboard, SendFlow,
│   │                         SwapScreen, WebTokens, WebActivity, AgentPanel…)
│   ├── browser/              Navigateur dApps
│   └── *.tsx                 Écrans partagés : SignSheet, TxPreview, WalletConnectHost,
│                             TonConnectHost, TestnetSection, PinPad, ConfirmUnlock…
│
├── lib/                      Logique applicative (React Native, stores Zustand)
│   ├── walletStore.ts        Portefeuilles, comptes, déverrouillage, signatures
│   ├── portfolio/            Portefeuille agrégé, soldes de test, historique de valeur, NFT
│   ├── walletconnect.ts      WalletConnect côté téléphone (approbation, requêtes)
│   ├── webConnect.ts         WalletConnect côté tableau de bord web
│   ├── tonconnect/ · ton/    TON Connect, outils TON
│   ├── earn/                 Moteur Gagner (staking, prêt)
│   ├── decoyCurtain.ts       Session leurre (code de contrainte)
│   ├── whitelistStore.ts     Liste blanche des destinataires
│   ├── ai*.ts · copilot*.ts  Copilote IA (fournisseur et clé de l'utilisateur)
│   ├── kv.ts · kv.web.ts     Stockage (SecureStore / IndexedDB chiffré)
│   └── i18n.ts               15 langues
│
├── src/                      Moteur (TypeScript pur, sans React)
│   ├── crypto/               BIP-39, BIP-32/44/84, SLIP-0010 (Solana, TON), aléa
│   ├── security/             Coffre (scrypt + AES-256-GCM), PIN, robustesse des mots de passe
│   ├── domain/
│   │   ├── chains/           Adaptateurs EVM / Bitcoin / Solana / TON, configs (65 réseaux + tests),
│   │   │                     gas, frais, historique (Etherscan, Alchemy, Helius, TonAPI…)
│   │   ├── tx/               Décodage, humanisation, simulation, anti-spam
│   │   ├── swap/             LI.FI, Relay, Jupiter, STON.fi, garde-fous
│   │   ├── earn/             Catalogue des protocoles
│   │   ├── wc/ · tonconnect/ Explication des signatures, SIWE, EIP-712, TON proof
│   │   ├── security/         GoPlus, phishing, empoisonnement d'adresse
│   │   ├── approvals/ · tokens/ · nft/ · prices/ · ens/ · qr/ · pay/ · export/ · backup/
│   │   └── wallet/ · keys/ · validation/ · errors.ts
│   └── index.ts              Point d'entrée public du moteur
│
├── web/                      Site kalyxwallet.com (Next.js, 15 langues, pages légales)
├── bot/                      Bot Telegram (Cloudflare Worker + D1 + KV)
├── ton-proxy/                Proxy TonAPI (Cloudflare Worker, clé côté serveur)
├── scripts/                  Gardes CI (check-repo-files, check-address-usage), génération
│                             (logos, textes légaux, assets store), publish-release.mjs
├── docs/                     Cette documentation, captures, démo
├── assets/                   Icônes, splash, polices General Sans, assets store
├── locales/                  Textes de base des langues
├── .eas/workflows/           release-production.yml : build EAS + publication de la release
├── .github/workflows/        ci.yml : typecheck, tests, gardes
├── polyfills.ts · index.js   Polyfills crypto chargés EN PREMIER
├── app.config.ts · eas.json  Configuration Expo et profils de build
└── package.json · tsconfig.json · jest.config.js
```

## Conventions

- **Les clés ne sortent jamais du coffre** : un composant UI ne manipule jamais une
  phrase ou une clé ; il appelle `walletStore`, qui déchiffre le temps de signer.
- **Une adresse par chaîne** : on passe toujours par `addressForChain` (garde CI
  `scripts/check-address-usage.mjs`), jamais par `account.address`.
- **Aucun secret dans `.env`** : seulement des clés d'API publiques (`EXPO_PUBLIC_*`).
- **`polyfills.ts` est importé en toute première ligne** de l'entrée de l'app.
- **Textes** : toute chaîne visible passe par `lib/i18n.ts` (15 langues) ou
  `ui/web/webI18n.ts` pour le web ; pas de français codé en dur.
- **Tests** à côté des fichiers (`*.test.ts`), surtout pour `src/crypto`, `src/security`,
  les adaptateurs de chaînes et le décodage des signatures.
