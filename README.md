# 🔐 Kalyx Wallet

### Secure. Non-custodial. Multi-chain.

[![CI](https://github.com/ahmedsignate2/kalyx-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmedsignate2/kalyx-wallet/actions/workflows/ci.yml)
![Bêta ouverte](https://img.shields.io/badge/statut-b%C3%AAta%20ouverte-DDB565)
![Non-custodial](https://img.shields.io/badge/keys-non--custodial-2ea44f)
![65 réseaux](https://img.shields.io/badge/r%C3%A9seaux-65-5B8CFF)
![15 langues](https://img.shields.io/badge/langues-15-informational)
![No independent audit](https://img.shields.io/badge/security%20audit-none%20yet-orange)
[![License: proprietary, source-available](https://img.shields.io/badge/license-proprietary%20%C2%B7%20source--available-lightgrey)](LICENSE)
[![Security policy](https://img.shields.io/badge/security-policy-critical)](SECURITY.md)
[![Vulnerability disclosure: HackerOne](https://img.shields.io/badge/VDP-HackerOne-494649)](docs/security/VDP.md)

Kalyx Wallet est un **wallet crypto non-custodial** pour Android, accompagné d'une **extension navigateur** (bêta), d'un **tableau de bord web**, d'une **mini-app Telegram** et d'un **bot Telegram**. Il est construit avec **React Native, Expo et TypeScript** (l'extension : TypeScript, WXT, Manifest V3).

Les clés sont générées et gardées **sur l'appareil où vous les créez — le téléphone, ou l'ordinateur avec l'extension — et nulle part ailleurs**. Kalyx n'a aucun serveur de conservation, aucun compte, aucune télémétrie. Le web et Telegram ne signent jamais : chaque opération est validée sur le téléphone. L'extension peut aussi fonctionner **sans aucune clé** (mode compagnon) : elle relaie chaque signature à l'app du téléphone.

> 🚀 **Bêta ouverte.** L'app est utilisable et gratuite, et vos retours façonnent la suite :
> Telegram [@kalyxntw](https://t.me/kalyxntw) · X [@kalyxntw](https://x.com/kalyxntw) · support@kalyxwallet.com
>
> ⚠️ Kalyx n'a pas fait l'objet d'un **audit de sécurité indépendant** et est développé par une seule personne. N'y placez pas de montants que vous ne pouvez pas perdre.

| | |
|---|---|
| 📲 **Télécharger (Android)** | [kalyxwallet.com/download](https://kalyxwallet.com/download) — APK + empreinte SHA-256 sur [kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release/releases/latest) |
| 🧩 **Extension navigateur (bêta)** | Chrome, Edge, Brave : portefeuille complet (clés chiffrées sur l'ordinateur) ou **mode compagnon** (clés sur le téléphone, chaque signature validée dans l'app). EVM, Solana, Bitcoin, TON. |
| 🖥️ **Tableau de bord web** | [app.kalyxwallet.com](https://app.kalyxwallet.com) — la même interface que l'extension, reliée au téléphone par QR (WalletConnect) : aucune clé, aucun mot de passe |
| ✈️ **Telegram** | Mini-app (le tableau de bord web) + bot : cours, gas, analyse de token, alertes de prix |
| 🌐 **Site** | [kalyxwallet.com](https://kalyxwallet.com) — FAQ, confidentialité, conditions, mentions légales |

---

## 📱 Aperçu

| Accueil | Marché | Swap | Gagner |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/02-home.jpg" width="190" /> | <img src="docs/screenshots/03-market.jpg" width="190" /> | <img src="docs/screenshots/04-swap.jpg" width="190" /> | <img src="docs/screenshots/09-earn.jpg" width="190" /> |

| Sécurité | Code de contrainte | Liste blanche | Autorisations |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/10-security.jpg" width="190" /> | <img src="docs/screenshots/11-duress.jpg" width="190" /> | <img src="docs/screenshots/12-whitelist.jpg" width="190" /> | <img src="docs/screenshots/13-approvals.jpg" width="190" /> |

| Bienvenue | Envoyer | Explorer | Réglages |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/01-welcome.jpg" width="190" /> | <img src="docs/screenshots/05-send.jpg" width="190" /> | <img src="docs/screenshots/07-browser.jpg" width="190" /> | <img src="docs/screenshots/08-settings.jpg" width="190" /> |

**Tableau de bord web** : la même interface que l'extension en mode compagnon (voir plus bas).

---

## 🛡️ Sécurité en un coup d'œil

| | |
|---|---|
| **Où sont les clés** | Téléphone : Keystore/Keychain, chiffrées AES-256-GCM sous une clé dérivée du PIN par scrypt. Extension : coffre chiffré sur l'ordinateur (scrypt + AES-256-GCM, mot de passe fort imposé, passkeys en second facteur au choix) — ou aucune clé en mode compagnon. Jamais sur un serveur, jamais sur le web. |
| **Serveur Kalyx** | Aucun pour le wallet : pas de compte, pas de session distante, pas de télémétrie. (Le bot Telegram ne garde que l'identifiant Telegram, la langue et les alertes de prix.) |
| **Signatures** | Chaque demande est expliquée en clair (« Tu vas envoyer 0,25 ETH à … ») avec un **score de risque** (0-100, même moteur dans l'app et l'extension) ; un score élevé impose de maintenir pour signer. Validation par PIN/biométrie sur le téléphone, par mot de passe ou passkey dans l'extension. Le web et Telegram ne font que lire et relayer (WalletConnect). |
| **Avant chaque envoi** | Anti-Drainer (simulation de la transaction), détection d'empoisonnement d'adresse, première fois vers cette adresse, analyse GoPlus des contrats, « maintenir pour envoyer ». |
| **Sous la contrainte** | Un **code de contrainte** ouvre un **portefeuille leurre** : les vrais portefeuilles, contacts et historiques restent invisibles. |
| **Liste blanche** | Envois limités aux adresses approuvées ; un ajout ou une désactivation ne prend effet qu'après **24 h**. |
| **Audit indépendant** | **Aucun à ce jour.** |
| **Signaler une faille** | Programme de divulgation (VDP) sur **HackerOne** — politique : [docs/security/VDP.md](docs/security/VDP.md), périmètre : [docs/security/SCOPE.md](docs/security/SCOPE.md), à défaut support@kalyxwallet.com. Jamais via les Issues publiques. |

## 💸 Frais — transparence

| Opération | Frais Kalyx | Détail |
|---|---|---|
| Envoyer / recevoir | **0 %** | Uniquement les frais du réseau. |
| Swap et bridge EVM (LI.FI) | **0,3 %** | Seulement si `EXPO_PUBLIC_FEE_RECIPIENT_EVM` est configuré au build. Si LI.FI refuse la commission, repli automatique sur une route **sans** commission. |
| Swap Solana (Jupiter) | **0,3 %** | Seulement si `EXPO_PUBLIC_FEE_RECIPIENT_SOLANA` est configuré et que SOL/wSOL est d'un côté de l'échange. |
| Gagner (staking, prêt) | **0 %** | Aucune commission Kalyx. |

Aucune adresse de perception n'est codée en dur. Le récapitulatif de swap affiche toujours le pourcentage **réellement** inclus dans le devis (`kalyxFeeApplied`).

## ⚠️ Limites connues

- Pas d'audit de sécurité indépendant.
- Android (APK signé, hors Play Store pour l'instant) ; pas encore d'app iOS. L'extension navigateur est en **bêta**.
- Extension : les passkeys ne fonctionnent pas dans tous les navigateurs (souvent refusées aux extensions sur Android : Mises, Kiwi) ; le mot de passe reste alors la protection.
- Tableau de bord web : TON n'y est pas signable (WalletConnect ne couvre pas TON) ; pas d'onglet Gagner ni de marché (absents de l'extension, dont il reprend l'interface).
- Pas de mise à jour à distance : chaque correctif passe par un nouvel APK.
- Plusieurs fonctions dépendent de services tiers (RPC, CoinGecko, GoPlus, LI.FI…) qui peuvent être lents, limités ou indisponibles.
- Pas de wallet matériel (Ledger, Trezor…) pour l'instant.

---

## ✨ Fonctionnalités

### 💼 Portefeuilles et comptes
- Création **BIP-39** (12 ou 24 mots), vérification de la phrase, import par phrase.
- Import par **clé privée** : EVM (hex), Bitcoin (WIF), Solana (base58 / hex / JSON).
- **Recherche des comptes** à l'import (comptes dérivés déjà utilisés).
- **Multi-portefeuilles**, multi-comptes dérivés, **portefeuilles en lecture seule** (adresse suivie, sans clé).
- PIN avec anti-brute-force (horloge murale + monotone), biométrie, verrouillage automatique.
- Sauvegarde **chiffrée** (fichier, mot de passe distinct du PIN, scrypt + AES-256-GCM) et sauvegarde **Google Drive** de tous les portefeuilles.

### 🔗 65 réseaux
**62 réseaux EVM + Bitcoin + Solana + TON**, derrière une même interface d'adaptateur :

Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Linea, Scroll, Blast, zkSync Era, Gnosis, Mantle, Celo, Berachain, Hyperliquid, Sonic, Cronos, Moonbeam, Metis, Polygon zkEVM, Mode, Manta Pacific, opBNB, Taiko, Unichain, World Chain, Sei, Flare, Kava, Aurora, Fantom, Fraxtal, Ink, Soneium, Abstract, Zora, Lisk, Boba Network, BOB, Immutable zkEVM, Astar, Fuse, Kaia, Gravity, Rootstock, Ronin, ApeChain, Core, ZetaChain, Etherlink, Story, Zircuit, Plume, Morph, Swellchain, Superseed, Hemi, Bitlayer, Merlin, Degen, MemeCore, **Bitcoin**, **Solana**, **TON**.

**Réseaux de test** (masqués par défaut, jamais comptés dans le total) : Sepolia, Base Sepolia, Monad Testnet, Solana Devnet, TON Testnet. Une fois affichés, leurs soldes apparaissent dans une section à part de l'accueil, et ils sont utilisables depuis le tableau de bord web. Plus des **réseaux EVM personnalisés** (Chain ID vérifié auprès du RPC).

### 💸 Envoyer et recevoir
- Envoi en 4 étapes : actif → destinataire (contacts, récents, ENS, scan QR) → montant (clavier, bascule devise/jeton, Max moins les frais) → récapitulatif **maintenir pour envoyer**.
- Contrôles : adresse empoisonnée (bloquant), première fois vers cette adresse, contrat destinataire, loyer Solana, réserve de gas, simulation Anti-Drainer.
- Suivi Envoyée → Incluse → Confirmée ; accélération Bitcoin (RBF).
- Recevoir : QR, partage, URI de paiement **EIP-681**, **BIP-21**, **Solana Pay**, **TON Pay** ; WalletConnect Pay.
- Historique tous réseaux : filtres Reçus / Envoyés / Swaps, puces par réseau, recherche, spam replié avec sa raison, alerte d'empoisonnement, **export CSV**.

### 🔄 Échanger et faire fructifier
- **Swap et bridge** : LI.FI (EVM, inter-chaînes), Relay en source secondaire, Jupiter (Solana), STON.fi (TON).
- **Gagner** : staking liquide et prêt — Lido, Rocket Pool, Benqi, Jito, Marinade, Aave, Tonstakers — avec soldes, rendements estimés et retrait.
- Jetons ERC-20, SPL, jettons TON ; jetons non vérifiés masqués ; NFT (galerie, envoi).

### 🔗 dApps
- **WalletConnect v2** (EVM, Solana, Bitcoin), **TON Connect** (pont JS intégré, ton_proof, signData).
- **Navigateur intégré** avec onglets, signatures expliquées (SIWE, EIP-712, Permit/Permit2, ordres NFT), confirmation avant tout changement de réseau demandé par un site.
- **Autorisations de dépense** : liste et **révocation groupée**.
- **Suivi des connexions** : pour chaque site ou extension relié, son dernier signe de vie réel (point vert seulement s'il répond), sa date d'expiration, et une déconnexion immédiate.

### 🧩 Extension navigateur (bêta)
- **Deux modes** : portefeuille complet (coffre chiffré sur l'ordinateur : scrypt + AES-256-GCM, mot de passe fort imposé, jusqu'à 5 passkeys en second facteur) ou **mode compagnon** (aucune clé : tous les portefeuilles et comptes du téléphone reliés par QR, chaque signature validée dans l'app).
- **EVM, Solana, Bitcoin, TON** : soldes agrégés, tokens, NFT, activité, envoyer, recevoir, swap, achat.
- **Pont vers les dApps** : EIP-1193 / EIP-6963, Wallet Standard Solana et Bitcoin ; permissions par site, présence limitée aux sites autorisés au choix.
- **Fenêtre de signature** : explication en clair, simulation (EVM, Solana), **score de risque 0-100** (même moteur que l'app), maintien pour signer quand le score est élevé, mot de passe redemandé par défaut, plafond journalier, rappel de révocation des autorisations.
- **Code de contrainte** (profil leurre), liste blanche, verrouillage automatique et mode parano, sauvegarde chiffrée compatible avec l'app.
- 15 langues, thèmes Nuit / Crème, mode Débutant / Expert. Code : [`extension/`](extension/README.md).

### 🖥️ Web et Telegram
- **Tableau de bord** [app.kalyxwallet.com](https://app.kalyxwallet.com) (ordinateur, navigateur mobile) : **l'interface de l'extension en mode compagnon**, avec le même code (`extension/web/`) : tous les portefeuilles et comptes du téléphone en une liaison (QR), solde agrégé, tokens tous réseaux, NFT, activité, envoyer / recevoir / swap / acheter, autorisations de tokens à révoquer, contacts, réglages, et le **Copilote IA** avec ta propre clé d'API (gardée dans le navigateur, envoyée seulement au fournisseur choisi ; le modèle voit tokens et activité, jamais les adresses). **Il ne détient aucune clé et ne demande aucun mot de passe** : chaque action se valide sur le téléphone ; après 30 min sans activité, la liaison se ferme et le navigateur oublie tout.
- **Bot Telegram** : `/price`, `/gas`, `/scan`, `/alert` (alertes de prix), ouverture de la mini-app — voir [bot/README.md](bot/README.md).

### 🤖 Copilote IA
Assistant intégré qui lit le contexte du portefeuille (jamais les clés) et prépare des actions que l'utilisateur valide. Fournisseur au choix avec **votre propre clé** : DeepSeek, OpenAI, Anthropic, Gemini, Groq, OpenRouter, Together, Hugging Face ou point d'accès compatible. La clé est stockée chiffrée sur l'appareil.

### 🧭 Le reste
- Marché (cours, variations, graphiques), **alertes de prix**, notifications, contacts, favoris.
- Thèmes sombre / clair / système, mode Débutant / Expert, **15 langues** (fr, en, es, pt, de, it, nl, pl, tr, ru, ar, hi, zh, ja, ko), 7 devises (USD, EUR…).
- Support intégré (tickets), FAQ, journal de diagnostic (sans aucun secret).

---

## 🏗️ Architecture

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  📱 APP (Expo / RN)          │   │  🧩 EXTENSION (extension/)    │
│  app/  écrans Expo Router    │   │  coffre chiffré ou compagnon │
│  ui/   design system (kit)   │◄──┤  pont dApps, signature       │
│  lib/  stores, coffre, WC…   │   │  🖥️ WEB (extension/web) :     │
│                              │◄──┤  même interface, aucune clé  │
└──────────────┬───────────────┘   └──────────────────────────────┘
               │
┌──────────────▼───────────────┐   ┌──────────────────────────────┐
│  🔐 MOTEUR (src/)            │   │  ☁️ SERVICES (Cloudflare)    │
│  BIP-39/32/44/84, SLIP-10    │   │  web/       site Next.js     │
│  adaptateurs EVM/BTC/SOL/TON │   │  bot/       bot Telegram      │
│  tx, simulation, sécurité    │   │  ton-proxy/ proxy TonAPI      │
│  swap, earn, WC, TON Connect │   │  (aucun ne voit de clé)       │
└──────────────────────────────┘   └──────────────────────────────┘
```

`src/` est le moteur TypeScript (sans React) exposé par `src/index.ts`. L'app, l'extension, le tableau de bord web et les tests l'utilisent tous de la même façon. Le tableau de bord web n'est pas un second code : c'est l'interface de l'extension, construite comme un site (`extension/web/`), en mode compagnon.

### 🔑 Dérivation

| Réseau | Chemin | Courbe |
|---|---|---|
| EVM (tous) | `m/44'/60'/0'/0/i` | secp256k1 |
| Bitcoin | `m/84'/0'/0'/0/i` (SegWit natif) | secp256k1 |
| Solana | `m/44'/501'/i'/0'` | ed25519 (SLIP-0010) |
| TON | `m/44'/607'/0'` (ou phrase TON native) | ed25519 (SLIP-0010) |

### 📁 Structure

```
kalyx-wallet/
├── app/              Écrans (Expo Router)
├── ui/               Design system (ui/kit), écrans partagés (ui/web : ancien tableau de bord, plus déployé)
├── extension/        Extension navigateur (WXT, MV3) ; extension/web = tableau de bord app.kalyxwallet.com
├── lib/              Logique applicative : stores, coffre, WalletConnect, TON Connect, earn, IA…
├── src/              Moteur : crypto, chains (evm/btc/sol/ton), tx, swap, wc, tonconnect, security
├── web/              Site kalyxwallet.com (Next.js, Cloudflare)
├── bot/              Bot Telegram (Cloudflare Worker + D1)
├── ton-proxy/        Proxy TonAPI : la clé TonAPI reste côté serveur (Cloudflare Worker)
├── scripts/          Gardes CI, génération (logos, textes légaux), publication des releases
├── docs/             Documentation technique et de conception
├── .eas/workflows/   Build de production + publication automatique
└── app.config.ts · eas.json · package.json
```

### 🛠️ Stack

| Domaine | Technologie |
|---|---|
| App | React Native 0.86, Expo SDK 57, Expo Router, TypeScript, Zustand |
| UI | General Sans, Phosphor, Reanimated, react-native-svg |
| EVM | ethers v6 |
| Bitcoin | @scure/btc-signer |
| Solana | @solana/web3.js + transactions construites en interne |
| TON | @ton/core |
| Crypto | @scure/bip39, @scure/bip32, @noble/* |
| Stockage | expo-secure-store, expo-local-authentication |
| dApps | WalletConnect v2, TON Connect |
| Données | Alchemy, Etherscan V2, Helius, TonAPI, CoinGecko, DefiLlama, GoPlus |
| Swap | LI.FI, Relay, Jupiter, STON.fi |
| Web / services | Next.js, Cloudflare Workers, D1, KV |
| Extension | WXT (Manifest V3), TypeScript sans framework, Vite (tableau de bord web) |
| Tests / CI | Jest (app), Vitest (extension), Playwright (tests de bout en bout de l'extension et du web), GitHub Actions |
| Build / distribution | EAS Build + EAS Workflows → GitHub Releases |

---

## 🚀 Développer

### Prérequis
- Node.js 20, npm
- Android : Android Studio (SDK + émulateur) ou un téléphone en débogage USB
- Un **build natif** est nécessaire (modules natifs) : Expo Go ne suffit pas

### Installer et lancer

```bash
git clone https://github.com/ahmedsignate2/kalyx-wallet.git
cd kalyx-wallet
npm ci
cp .env.example .env        # puis renseigner les clés utiles
npx expo run:android        # compile et installe l'app de développement
npm start                   # serveur Metro (rechargement du JS)
npm run build:web --prefix extension   # tableau de bord web (extension/.output/web)
```

Guides détaillés : [MOBILE_SETUP.md](MOBILE_SETUP.md) (lancer en local) et [ANDROID_GUIDE.md](ANDROID_GUIDE.md) (Android, builds, releases).

### Variables d'environnement (`.env.example`)

| Variable | Rôle |
|---|---|
| `EXPO_PUBLIC_ALCHEMY_KEY` | RPC, jetons, NFT, simulation (EVM) |
| `EXPO_PUBLIC_ETHERSCAN_KEY` | Historique EVM (Etherscan V2) |
| `EXPO_PUBLIC_COINGECKO_KEY` | Cours et marché |
| `EXPO_PUBLIC_LIFI_KEY` | Swap / bridge |
| `EXPO_PUBLIC_HELIUS_KEY` | RPC et historique Solana |
| `EXPO_PUBLIC_WALLETCONNECT_ID` | WalletConnect (app et tableau de bord) |
| `EXPO_PUBLIC_WALLETCONNECT_PAY_ID` | WalletConnect Pay |
| `EXPO_PUBLIC_RELAY_API_KEY` | Relay (relay.link) : 2ᵉ source de devis cross-chain (facultatif) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Sauvegarde Google Drive |
| `EXPO_PUBLIC_FEE_RECIPIENT_EVM` / `_SOLANA` | Perception de la commission de swap (facultatif) |

Ce sont des clés d'API **publiques** (intégrées au JS). Ne mettez jamais une phrase, une clé privée, un PIN ou un mot de passe dans le code ou une variable.

### Tests et CI

```bash
npm run typecheck
npm test

# extension et tableau de bord web
npm ci --prefix extension
npm test --prefix extension
npm run build --prefix extension
npm run test:smoke --prefix extension     # extension chargée dans Chromium
npm run test:web --prefix extension       # tableau de bord web, sous sa CSP de production
```

La [CI](.github/workflows/ci.yml) exécute à chaque push : typecheck strict, tests Jest, garde anti-log de secrets, garde des fichiers interdits (`scripts/check-repo-files.mjs`) et garde d'usage des adresses par chaîne (`scripts/check-address-usage.mjs`) ; pour l'extension : typecheck, tests, build avec empreinte, build du tableau de bord web.

---

## 📦 Builds et releases

Les APK sont construits sur **EAS** et publiés **automatiquement** sur [kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release) par le workflow [`.eas/workflows/release-production.yml`](.eas/workflows/release-production.yml) :

1. déclenchement : push sur la branche `release` (`git push origin main:release`) ou `npx eas-cli workflow:run release-production.yml` ;
2. build EAS du profil `production-apk` ;
3. dès la fin du build, [`scripts/publish-release.mjs`](scripts/publish-release.mjs) télécharge l'APK, calcule son SHA-256 et crée la release (`kalyx-wallet.apk` + `kalyx-wallet.apk.sha256`) — [kalyxwallet.com/download](https://kalyxwallet.com/download) la sert aussitôt.

Pré-requis côté expo.dev : dépôt GitHub relié au projet, et variable `GH_RELEASE_TOKEN` (Secret) dans l'environnement **production** — un jeton GitHub limité à `kalyx-wallet-release` (Contents: Read and write).

| Profil (`eas.json`) | Sortie | Usage |
|---|---|---|
| `preview` | APK, version 0.1.0 | Testeurs |
| `production-apk` | APK, version 1.0.0 | Distribution publique (release) |
| `production` | AAB | Play Store |

`EXPO_PUBLIC_APP_STAGE` vaut **`beta`** en production pendant la bêta ouverte (badge et avertissement Bêta visibles). Le passer à `stable` dans `eas.json` pour la sortie définitive.

Vérifier un APK téléchargé :

```bash
sha256sum -c kalyx-wallet.apk.sha256
```

Il n'y a **pas de mise à jour à distance (OTA)** : tout changement passe par un nouvel APK.

---

## 🗺️ État du projet

**En place :** wallet EVM / Bitcoin / Solana / TON · multi-portefeuilles et lecture seule · PIN, biométrie, verrouillage · code de contrainte · liste blanche · sauvegarde chiffrée et Google Drive · envoi avec simulation et anti-empoisonnement · historique filtrable et CSV · swap / bridge · Gagner · WalletConnect et TON Connect · navigateur dApps · révocation d'autorisations · suivi des connexions · extension navigateur (complète ou compagnon) · tableau de bord web et mini-app Telegram · bot Telegram · Copilote IA · alertes de prix · 15 langues · réseaux de test.

**À venir / à renforcer :**
- [ ] Audit de sécurité indépendant
- [ ] App iOS, Play Store
- [ ] Gagner dans le tableau de bord web ; TON signable depuis le web ; mini-app Telegram sur la nouvelle interface
- [ ] Lightning, multisig / coffre partagé
- [ ] Wallets matériels

---

## 📚 Documentation

| Document | Contenu |
|---|---|
| [SECURITY.md](SECURITY.md) | Modèle de sécurité, signalement de failles |
| [docs/security/VDP.md](docs/security/VDP.md) · [SCOPE.md](docs/security/SCOPE.md) | Programme de divulgation de vulnérabilités (HackerOne) : règles, périmètre, délais, safe harbor |
| [PRIVACY.md](PRIVACY.md) · [TERMS.md](TERMS.md) | Confidentialité et conditions (générés depuis le site : `node scripts/gen-legal-md.mjs`) |
| [MOBILE_SETUP.md](MOBILE_SETUP.md) | Lancer l'app en local |
| [ANDROID_GUIDE.md](ANDROID_GUIDE.md) | Android : émulateur, téléphone, builds EAS, releases |
| [STORE_LISTING.md](STORE_LISTING.md) | Textes de fiche store |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribuer |
| [extension/README.md](extension/README.md) | Extension navigateur et tableau de bord web : build, tests, architecture |
| [docs/](docs/) | Conception : cahier des charges, architecture, sécurité, réseaux, TON, design, carte d'audit |
| [bot/README.md](bot/README.md) · [ton-proxy/README.md](ton-proxy/README.md) | Services Cloudflare |
| [docs/vente/](docs/vente/README.md) | Vente : dossier de vente, audit de propriété intellectuelle, annonce, modèle de licence en marque blanche |

---

## 🤝 Contribuer et signaler

- 💡 Suggestions et retours de bêta : Telegram [@kalyxntw](https://t.me/kalyxntw) · X [@kalyxntw](https://x.com/kalyxntw) · ou depuis l'app (Support)
- 🐛 Bugs : GitHub Issues — 🔐 Vulnérabilités : **jamais** en public, à **security@kalyxwallet.com** (accusé immédiat avec numéro de ticket, lu par une personne) ou via le programme HackerOne ([politique](docs/security/VDP.md))

Ne transmettez **jamais** une phrase de récupération, une clé privée, un PIN, un mot de passe ou un jeton. Kalyx ne vous les demandera jamais.

## 💙 Soutenir le projet

Depuis l'app : **Menu → Soutenez-nous** (un appui ouvre l'écran Envoyer pré-rempli). Kalyx est gratuit à l'usage ; une commission de 0,3 % s'applique aux échanges intégrés.

| Réseau | Adresse |
|---|---|
| **BTC** | `bc1qkalyxyueng23j7elpqrk4pcp3thp94u6cs5rkn` |
| **ETH / EVM** (Base, Arbitrum, Ethereum…) | `0x7411b6a0b4df0f3a0bab9fe2c5d5cb47ddbdb69b` |
| **SOL** | `KALYXiXBdhzuEyFuPx9EdoqyaiUcrBTT9k66v4C13jz` |
| **TON** | `kalyxwallet.ton` — `UQBapKtQghRx5Wh1WpscDbNNH9kLIpdd89rSxMU5EJCmVBrU` |

Source unique de ces adresses : [`src/constants/donations.ts`](src/constants/donations.ts) (testée).

## 📄 Licence

**Licence propriétaire, code source consultable** ([LICENSE](LICENSE)) :
- lecture, clonage, build local et recherche en sécurité : **autorisés** ;
- usage commercial, redistribution, revente, forks publics, réutilisation de la marque : **interdits** sans accord écrit ;
- **acquisition** du projet ou **licence commerciale** : possibles — Telegram [@kalyxntw](https://t.me/kalyxntw), X [@kalyxntw](https://x.com/kalyxntw), support@kalyxwallet.com. Documents : [docs/vente/](docs/vente/README.md).

Les bibliothèques tierces restent soumises à leurs propres licences. WalletConnect : « Portions © 2025 Reown, Inc. All Rights Reserved » (licence reproduite dans l'app, écran Licences tierces).

## 👤 À propos

Kalyx Wallet est conçu, développé et maintenu par **un développeur indépendant** (KALYX, entreprise individuelle, France). Pas d'équipe, pas de levée de fonds, pas de serveur de conservation.

---

**Your keys. Your wallet. Your control.**
