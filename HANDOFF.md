# Nova Wallet — Sauvegarde de contexte (HANDOFF)

> Document de reprise. Résume l'état du projet, ce qui reste, les décisions et
> **les pièges déjà rencontrés** (à ne pas redécouvrir). Mis à jour : 2026-07-04.
> Wallet crypto **non-custodial** mobile, React Native / Expo (SDK 57), TypeScript.

---

## 1. Architecture (règle d'or)

Deux couches strictement séparées :

- **`src/` = le MOTEUR** (pur TypeScript, **testé**, aucune dépendance UI). Crypto,
  dérivation, chaînes, prix, swap, tokens, NFT. Exporté via le **barrel `src/index.ts`**.
  L'app n'importe QUE depuis `../src`. **103 tests jest** (vecteurs de référence +
  cross-check @scure/ethers). Testé via `npm test`.
- **`app/` (écrans expo-router)**, **`lib/` (stores zustand, logique app)**,
  **`ui/` (design system)** = la couche APP. Non testée par jest, mais typecheckée
  (⚠️ vraiment couverte depuis 2026-07-04 : le `include` du tsconfig omettait
  app/lib/ui — 15 erreurs corrigées à cette occasion, ne pas retirer du include).

**Invariants sécurité (voir SECURITY.md) :** ni seed ni clé privée dans le state ;
seed déchiffrée du coffre **à la volée** pour signer puis jetée ; jamais loggée ;
jamais sur le réseau. Le seul écart transitoire : `draftMnemonic` pendant l'onboarding.

### Stores (lib/)
- `walletStore.ts` — LE cœur : wallets, comptes, unlock, sign/send, swap, WC signing,
  multi-wallet. `revealMnemonic(walletId, unlock)` est la seule voie vers la seed.
- `settingsStore.ts` — nom profil, langue (i18n), devise fiat, biométrie, mode Débutant/Expert.
- `customTokensStore.ts`, `contactsStore.ts`, `walletconnect.ts`.
- `secureStore.ts` — wrappers expo-secure-store, **clés par wallet** (voir §5).
- `txError.ts` — `friendlyTxError()` : messages clairs (solde insuffisant, etc.).

---

## 2. Ce qui est FAIT (fonctionnel)

**Sécurité/core :** BIP-39 (12/24), HD BIP-32/44/84, coffre AES-256-GCM + PIN (scrypt),
biométrie, anti-brute-force, anti-capture seed, **multi-wallet** (créer/importer/gérer),
multi-comptes, changer PIN, révéler phrase, reset.

**Chaînes :** EVM (Ethereum, Polygon, BNB, Base, Sepolia — RPC Alchemy + fallbacks),
Bitcoin (réception, `bc1`). Envoi/réception EVM, réception BTC.

**Données réelles (CoinGecko/Alchemy/Etherscan) :** prix, marché, fiche token (24h→ALL),
recherche globale, tokens ERC-20 + ajout custom + anti-spam, NFT, historique EVM, valeur totale fiat.

**Services :** Swap+Bridge (LI.FI, **fee intégrateur `nova` 0,3 % → monétisé**),
WalletConnect (connexion dApps + signature SIWE/tx avec PIN).

**UI :** design premium (glass violet/bleu), icônes SVG (Ionicons), animations (scale,
skeletons, transitions), i18n 15 langues, 7 devises, contacts, mode Débutant/Expert,
bottom nav 5 onglets + FAB, ErrorBoundary.

---

## 3. Ce qui RESTE / à AMÉLIORER

### Finitions rapides (sans rebuild)
- ✅ ~~Fenêtre de signature WalletConnect enrichie~~ (fait 2026-07-04) : SIWE décodé +
  anti-phishing (domaine SIWE ≠ site → alerte), logo/nom dApp, résumé Site/Adresse/Réseau/Action,
  résumé EIP-712 (Permit…) et tx (vers/montant/données), détails techniques repliables.
  Moteur : `src/domain/wc/message.ts` (hexToText, parseSiwe, siweDomainMismatch,
  summarizeTypedData — 13 tests). UI : `ui/WalletConnectHost.tsx`.
- ✅ ~~Warnings WC~~ : `Record was recently deleted` filtrés dans `walletconnect.ts::init()`.
- ✅ ~~Graphique de prix interactif~~ (fait 2026-07-04) : `ui/InteractiveChart.tsx`
  (scrub façon Revolut : crosshair, haptique, prix/date sous le doigt) + police Inter
  chargée dans `_layout` (`fontFamily` par graisse, plus de `fontWeight`).
- ✅ ~~Vraie courbe portefeuille (accueil)~~ (fait 2026-07-04) : la sparkline du hero
  était factice ; désormais courbe 24h réelle + P&L en devise dans le badge.
- ✅ ~~Donut de répartition~~ (fait 2026-07-04) : `ui/AllocationDonut.tsx` sur l'écran
  Portefeuille. Palette catégorielle FIXE `#7C5CFF #3390EC #1FA96E #C9831C #B85F8F`
  validée daltonisme/contraste (skill dataviz) — ne pas cycler d'autres couleurs.

**Cap UI « battre MetaMask/Phantom » — priorités restantes (décidé 2026-07-04) :**
1. **Apparence** (thème clair/sombre) — gros refactor : l'app utilise `colors` statique de
  `ui/theme.ts` partout ; il faut un `useColors()` + adapter les écrans (StyleSheet dynamiques).
2. Activité inline sur l'accueil (3-4 dernières tx, la section est vide aujourd'hui).
3. Écran de succès de transaction animé (check + haptique) ; empty states illustrés.
4. Galerie NFT dédiée (le moteur existe, Phantom est la référence à battre).
5. Boutons « Bientôt » (Buy/Convert/cloche) : brancher ou griser proprement.

### Gros morceaux (rebuild / partenaires)
- **Notifications** (locales `expo-notifications` + push via backend/Alchemy Notify) — rebuild.
- **Ledger/Trezor** (natif + Bluetooth) — rebuild.
- **Navigateur Web3 intégré** (WebView + injection EIP-1193) → **v2** (complexe).
- **Achat/Vente fiat** (MoonPay/Transak/Ramp) — partenaire régulé + KYC.
- **Envoi Bitcoin** (UTXO) — `@scure/btc-signer` déjà installé, à câbler.
- **Staking**, positions **DeFi**.
- Nouvelles chaînes : Solana, Tron, XRP, Sui, Arbitrum, Optimism, Avalanche (via ChainAdapter).
- **Carte virtuelle** Visa/MC (Immersve/Baanx/Gnosis Pay) — régulé.

### Durcissement avant lancement
- **Audit de sécurité externe** (obligatoire avant de vrais fonds).
- Tests E2E sur device ; persister compteurs anti-brute-force ; auto-lock arrière-plan +
  écran de garde ; détection root/jailbreak ; assets store (icône/splash/captures).

---

## 4. Clés API (dans `.env`, gitignoré ; `EXPO_PUBLIC_*` inliné au build)

| Variable | Service | Rôle | Statut |
|---|---|---|---|
| `EXPO_PUBLIC_ALCHEMY_KEY` | Alchemy | RPC EVM fiable + tokens ERC-20 + NFT | ✅ en place |
| `EXPO_PUBLIC_ETHERSCAN_KEY` | Etherscan V2 | historique + transferts ERC-20 | ✅ |
| `EXPO_PUBLIC_COINGECKO_KEY` | CoinGecko | prix/marché (marche même sans clé) | ✅ (optionnel) |
| `EXPO_PUBLIC_LIFI_KEY` | LI.FI | swap+bridge (fee `nova` 0.3% configuré sur portal.li.fi) | ✅ |
| `EXPO_PUBLIC_0X_KEY` | 0x | swap same-chain (non utilisé, LI.FI suffit) | slot prêt |
| `EXPO_PUBLIC_WALLETCONNECT_ID` | Reown/WalletConnect | connexion dApps | ✅ |

**IMPORTANT pour les builds EAS** : `.env` étant gitignoré, il faut aussi déclarer ces
variables côté EAS (`eas env:create --environment development --name … --value … --visibility plaintext`),
sinon elles ne sont PAS embarquées dans l'APK/dev-build.

---

## 5. Décisions d'architecture importantes

- **Multi-wallet NON DESTRUCTIF** : le wallet historique = id **`primary`** qui garde les
  clés SecureStore d'origine (`nova.vault` / `nova.accounts` / `nova.bioSeed`). Les nouveaux
  wallets ont des clés suffixées (`nova.vault.{id}`…). Migration douce au boot (voir
  `walletStore.bootstrap`). **Un seul PIN d'app** chiffre tous les coffres ; `changePin`
  les re-chiffre tous. Biométrie par wallet.
- **ChainAdapter** (`src/domain/chains/`) : interface commune ; `EvmChainAdapter` paramétré
  couvre tous les réseaux EVM (même clé/adresse, seul le RPC change). Ajouter un EVM = 1 config.
  Bitcoin = adapter séparé. Solana/Tron = futurs adapters.
- **Prix libs** : écosystème `@noble`/`@scure` (audité) + `ethers` v6. Jamais de crypto maison.

---

## 6. PIÈGES DÉJÀ RENCONTRÉS (⚠️ ne pas refaire)

1. **`require('crypto')` Node dans du code embarqué** → Metro plante (`Unable to resolve
   module crypto`). Solution : n'utiliser que `globalThis.crypto.getRandomValues`
   (présent en RN via `react-native-get-random-values` chargé EN PREMIER dans `index.js`,
   et dans Node 18+). Voir `src/crypto/random.ts`.
2. **`TextDecoder`** absent sur Hermes → crash. Utiliser `bytesToUtf8` de `@noble/hashes/utils`.
3. **`metro.config.js` manquant** → les polices `.ttf` d'`@expo/vector-icons` ne se résolvent
   pas (`ttf` pas dans assetExts). Fichier présent maintenant (`getDefaultConfig`).
4. **Sélecteur zustand instable** : `useStore((s) => s.x ?? [])` crée une **nouvelle réf à
   chaque rendu** → boucle infinie « Maximum update depth ». Sélectionner l'objet stable
   puis dériver avec `useMemo`. (cf. wallet.tsx `customByChain`).
5. **WalletConnect SDK = modules natifs** (`async-storage`) : importé en **import DYNAMIQUE**
   dans `lib/walletconnect.ts::init()` pour ne pas crasher l'app avant un rebuild. **Un
   rebuild du dev build est nécessaire** pour que WC marche.
6. **LI.FI fee** : le fee intégrateur (`integrator=nova&fee=0.003`) est **rejeté** tant que
   le wallet de collecte n'est pas configuré par chaîne sur portal.li.fi. `getSwapQuote`
   réessaie **sans fee** en repli pour ne pas bloquer le swap. (Config portail = faite.)
7. **Cache npm sur PRoot** : `rename` échoue → utiliser `--cache <dossier neuf>` (ex.
   `$CLAUDE_JOB_DIR/tmp/npmcacheN`) et réessayer.
8. Warnings WC `Record was recently deleted - proposal` = **bénins** (nettoyage heartbeat).
   (Filtrés depuis 2026-07-04 dans `walletconnect.ts::init()`.)
9. **`Requiring unknown module "NNNN"`** au chargement de WalletConnect = **lazy bundling
   Metro** : en dev, Expo découpe chaque `await import(...)` en bundles séparés dont les
   IDs de modules se désynchronisent du bundle principal (symptôme : IDs réclamés juste
   au-dessus du nombre de modules d'index.js). Solution : **`EXPO_NO_METRO_LAZY=1`**,
   posé **dans `metro.config.js`** (`process.env.EXPO_NO_METRO_LAZY = '1'`) car @expo/cli
   lit cette var **à la volée** à chaque requête de bundle → marche avec `npx expo start`
   comme `npm start` (l'avoir seulement dans le script npm ne suffit PAS si on lance
   `npx expo start`). Tout dans un seul bundle cohérent. Les `import()` dynamiques restent
   dans le code (utiles si modules natifs absents). Dev only. **Après ce changement,
   relancer avec `--clear` une fois.**

---

## 7. Workflow de dev

- **Metro (téléphone = Termux, même appareil)** : **`npm start`** (= `EXPO_NO_METRO_LAZY=1
  expo start --dev-client --localhost`). Ajouter `-- --clear` après un ajout de fichiers.
  Le `--localhost` évite l'IP LAN (marche en 4G, sans data, loopback). PAS `--tunnel`
  (lent, consomme). Recharger = `r`.
- **Reload vs Rebuild** : changement JS → juste `r`. Nouveau **module natif** (async-storage,
  vector-icons la 1re fois, expo-notifications futur) → **rebuild** :
  `eas build --profile development --platform android` (Termux, pas d'Android Studio).
- **Vérif avant commit** :
  - `npm test` (jest, moteur) — doit rester **vert (103)**.
  - Typecheck app+lib+ui (react-native types) via un tsconfig temporaire :
    ```
    { "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true, "types": [] },
      "include": ["app","lib","ui","src","expo-env.d.ts"] }
    ```
    puis `npx tsc -p tsconfig.check.json | grep 'error TS' | grep -v tsconfig`.
- **Diagnostic crash** : `ErrorBoundary` (ui/ErrorBoundary.tsx) affiche l'erreur à l'écran ;
  logs `[Nova]` dans le **terminal Metro** (pas logcat) via `index.js` (ErrorUtils global).
- **Build APK autonome (usage réel hors Metro)** : `eas build --profile preview --platform android`.

---

## 8. Fichiers clés
- Docs plan : `docs/01…07`, `SECURITY.md`, `MOBILE_SETUP.md`, `ANDROID_GUIDE.md`, `README.md`.
- Moteur : `src/crypto/*`, `src/domain/chains/*`, `src/domain/prices/coingecko.ts`,
  `src/domain/swap/lifi.ts`, `src/domain/tokens/alchemyTokens.ts`, `src/domain/nft/alchemyNft.ts`.
- App : `app/home|wallet|market|swap|menu|token/[id]|walletconnect|contacts|wallets|…`.
- CI : `.github/workflows/ci.yml` (typecheck + tests + garde anti-log de secret).

---

## 9. Prochaine étape recommandée
**Apparence (thème clair/sombre)** — refactor `useColors()` + écrans, sans rebuild. Puis les
gros morceaux (notifs, Ledger, fiat) selon priorité produit. La fenêtre de signature WC
enrichie (SIWE + anti-phishing) est faite mais **à tester sur device** (reconnexion à une
dApp type OpenSea). **Audit sécurité avant tout vrai fonds.**
