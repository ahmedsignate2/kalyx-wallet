# 🔐 NovaWallet – Wallet Crypto Non-Custodial Mobile

**Un wallet crypto mobile design, sécurisé et simple d'usage.**  
Contrôle total de tes clés. Aucun serveur, aucun intermédiaire. Juste la beauté d'une app moderne.

> **Prêt pour la production**, fondé sur 281 tests automatisés, cryptographie auditée, couche de sécurité renforcée.

---

## 📋 Table des matières

1. [Vision & Principes](#-vision--principes)
2. [Fonctionnalités](#-fonctionnalités)
3. [Architecture](#-architecture)
4. [Installation & Setup](#-installation--setup)
5. [Développement](#-développement)
6. [Sécurité](#-sécurité)
7. [Roadmap](#-roadmap)
8. [Structure du projet](#-structure-du-projet)
9. [Documentation](#-documentation)
10. [FAQ](#-faq)

---

## 🎯 Vision & Principes

### Les 3 piliers du produit

1. **Design** – Une interface qui donne envie. Les gens ne partent pas pour un bouton manquant, mais pour manque de confiance.
2. **Sécurité** – Prévenir les erreurs *avant* qu'elles arrivent. Détection d'arnaque avant signature = arme n°1.
3. **Simplicité** – Un débutant doit pouvoir envoyer de la crypto sans l'impression de piloter une centrale nucléaire.

### Non-négociable

✅ **Non-custodial** – *Tu* as tes clés, zéro serveur.  
✅ **Les clés privées ne quittent jamais l'appareil** – Ni seed, ni clé brute n'est envoyée sur le réseau ou loggée.  
✅ **BIP-39 standard** – Phrases de récupération universelles (12 ou 24 mots).  
✅ **Chiffrement local** – Keychain (iOS) / Keystore (Android) pour les secrets.  
✅ **Tests exhaustifs** – 281 tests couvrent la cryptographie, la dérivation, la validation.

---

## ✨ Fonctionnalités

### Phase 1 : MVP (Ethereum + Polygon + BNB Chain)

#### Onboarding & Sécurité
- 📱 Création d'un nouveau wallet → génération seed BIP-39 (12/24 mots)
- 🔐 Verrouillage PIN (anti-brute-force) + Biométrie (Face ID / Touch ID / empreinte)
- 📝 Import d'un wallet existant par seed phrase
- ⏱️ Auto-lock après inactivité
- ✓ Sauvegarde guidée avec vérification (anti-copier-coller)

#### Portefeuille & Comptes
- 🪙 **Multi-chain** : Ethereum, Polygon, BNB Chain (même clé = même adresse)
- 🔄 Multi-comptes : plusieurs comptes dérivés de la même seed
- 💰 Solde total agrégé + vue par chaîne
- 🎨 Dark mode (défaut) & light mode
- 🌐 Multi-langue (FR/EN)

#### Transactions
- 📤 **Recevoir** : adresse + QR code + copy-to-clipboard
- 💸 **Envoyer** : saisie/scan d'adresse, montant, estimation frais (gas), confirmation
- 📊 Historique par compte + statut temps réel (pending/confirmed/failed)
- 🏷️ Tokens ERC-20 principaux + token natif

#### Extras
- 💹 Prix temps réel + variation 24h
- 🔗 Deep linking / QR scanning
- 💡 Détection d'arnaque avant signature

### Phase 2–3 : Bitcoin & Solana

- ₿ **Bitcoin** : dérivation BIP-84 (bc1…), réception, bientôt envoi
- ◎ **Solana** : dérivation Ed25519, tokens SPL
- 🔀 Swap cross-chain (via LiFi)
- 📍 Intégration ENS (Ethereum Name Service)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  📱 UI (React Native Expo)                   │
│     Écrans + Design System (Revolut-style)  │
├─────────────────────────────────────────────┤
│  🎛️  State (Zustand) + Requests (TanStack)  │
│     Cache, refetch, statuts                 │
├─────────────────────────────────────────────┤
│  🔧 Domain / Services                        │
│     WalletService (create/import/lock)      │
│     KeyManager (dérivation, signature)      │  ← Seul endroit avec clés en clair
│     ChainAdapters (EVM / BTC / SOL)         │
│     PriceService, HistoryService            │
├─────────────────────────────────────────────┤
│  🔒 Sécurité                                 │
│     SecureStorage (Keychain + AES-256-GCM) │
│     PIN + Biometrics gate                   │
├─────────────────────────────────────────────┤
│  🔐 Cryptographie (libs auditées)            │
│     @noble/*, @scure/*, ethers, …           │
└─────────────────────────────────────────────┘
```

### Pattern ChainAdapter (extensible)

Chaque chaîne implémente la même interface → ajouter Bitcoin/Solana = zéro changement au reste du wallet.

```typescript
interface ChainAdapter {
  deriveAccount(seed: Uint8Array, index: number): Account;
  getBalance(address: string): Promise<Balance>;
  buildTransaction(params: TxParams): Promise<UnsignedTx>;
  signTransaction(tx: UnsignedTx, privateKey: Uint8Array): Promise<SignedTx>;
  broadcast(signedTx: SignedTx): Promise<TxHash>;
}
```

### Dérivation des clés (BIP-44)

**Une seule seed BIP-39** dérive tous les comptes :

| Chaîne | Chemin | Adresse |
|--------|--------|---------|
| Ethereum / Polygon / BNB | `m/44'/60'/0'/0/0` | `0x...` (identique) |
| Bitcoin (SegWit natif) | `m/84'/0'/0'/0/0` | `bc1...` |
| Solana | `m/44'/501'/0'/0'` | Base58 (Ed25519) |

**Points clés:**
- ETH, Polygon, BNB = **même clé, même adresse** → seul le RPC change (MVP ultra rentable)
- Bitcoin = dérivation différente (BIP-84)
- Solana = courbe Ed25519 (pas secp256k1)

---

## 🚀 Installation & Setup

### Prérequis

```
Node.js 18+
npm / yarn
Xcode 15+ (macOS pour iOS)
Android Studio + NDK (pour Android)
EAS CLI (npm install -g eas-cli)
```

### Cloner & installer

```bash
git clone https://github.com/yourusername/nova-wallet.git
cd nova-wallet
npm install
```

### Configuration locale

Créer `.env.local` (ignoré par git) :

```env
# Clés d'API publiques (non-sensibles)
EXPO_PUBLIC_ETHEREUM_RPC=https://eth.llamarpc.com
EXPO_PUBLIC_ALCHEMY_API_KEY=your_alchemy_key
EXPO_PUBLIC_COINGECKO_API_KEY=your_cg_key

# Dev/staging
EXPO_PUBLIC_ENV=development
```

⚠️ **Jamais de clés privées ou secrets dans `.env` ou le code.**

### Démarrage

#### Web (dev)
```bash
npm run web
# Ouvre http://localhost:19000
```

#### iOS
```bash
npm run ios
# Ou : npx expo run:ios
```

#### Android
```bash
npm run android
# Ou : npx expo run:android
```

#### Start serveur Expo (dev client)
```bash
npm start
# Scanner le QR avec Expo Go (dev) ou un dev build
```

---

## 🔨 Développement

### Structure des fichiers

```
nova-wallet/
├── app/                    # Écrans React Native (Expo Router file-based)
│   ├── (auth)/            # Stack d'authentification
│   ├── (main)/            # Onglets principaux
│   ├── ...
│   └── _layout.tsx        # Layout racine
├── src/                    # Logique métier (TypeScript)
│   ├── crypto/            # Mnémonique, dérivation HD, Bitcoin
│   ├── domain/
│   │   ├── chains/        # ChainAdapter, EVM, Bitcoin, Solana
│   │   ├── validation/    # Adresses, montants
│   │   ├── wallet/        # Gestion portefeuille
│   │   ├── tokens/        # Métadonnées tokens
│   │   ├── prices/        # CoinGecko
│   │   ├── nft/           # Alchemy NFT
│   │   ├── swap/          # LiFi swap
│   │   └── ...
│   ├── security/          # Vault AES, PIN, biométrie
│   └── index.ts           # Exports publics
├── lib/                    # Composants UI et design system
│   ├── components/        # Boutons, inputs, cartes, etc.
│   ├── styles/            # Tokens (couleurs, spacing, typo)
│   └── hooks/             # useWallet, useTransaction, etc.
├── docs/                   # Documentation complète
│   ├── 01-CAHIER-DES-CHARGES.md
│   ├── 02-ROADMAP.md
│   ├── 03-ARCHITECTURE.md
│   ├── 04-STRUCTURE-PROJET.md
│   ├── 05-SECURITE.md
│   ├── 06-MVP.md
│   └── 07-DIFFERENCIATION.md
├── __tests__/             # Tests unitaires
├── jest.config.js
├── tsconfig.json          # TypeScript strict
└── package.json
```

### Scripts npm

```bash
npm start              # Lance Expo dev server
npm run android        # Build & run sur Android
npm run ios            # Build & run sur iOS
npm run web            # Web (dev uniquement)
npm test               # Jest + couverture
npm run typecheck      # TypeScript strict check
npm run build:web      # Export web (static)
```

### Tests

**281 tests**, couverture crypto/domain complète.

```bash
npm test               # Lance jest
npm test -- --coverage # Avec couverture
npm test -- --watch    # Mode watch
```

Tests par catégorie :

```bash
npm test -- crypto/          # Mnémonique, dérivation, Bitcoin
npm test -- domain/chains/   # ChainAdapters, EVM, BTC, Solana
npm test -- domain/validation/  # Adresses, montants
npm test -- security/        # Vault, PIN
npm test -- domain/backup/   # Cloud backup
```

### Code quality

```bash
npm run typecheck      # TypeScript strict (obligatoire avant PR)
```

⚠️ **Pas de crypto sans test. Chaque feature = test avant commit.**

---

## 🔒 Sécurité

### Principes d'architecture

1. **Isolation des clés** – La clé privée en clair existe uniquement le temps de signer, puis est effacée mémoire.
2. **Pas d'export** – UI ne reçoit jamais une clé brute, seulement adresses/signatures.
3. **Stockage chiffré** – Seed stockée en AES-256-GCM, déverrouillée via PIN (scrypt + argon2).
4. **Validation stricte** – Adresses checksum (EIP-55), montants en `bigint`, pas de parse lossy.
5. **Détection d'arnaque** – Check GoPlus avant signature, détection contrats risqués.

### Vecteurs d'attaque mitigés

| Risque | Mitigation |
|--------|-----------|
| Extraction clé via log | Pas d'export clé, logs filtrés en CI |
| Tampering supply chain | Dépendances auditées, hash check, npm audit |
| Side-channel (timing) | Libs @noble (timing-safe), pas de crypto custom |
| Phishing adresse | Checksum EIP-55, QR validation |
| Faux montant | Validation bigint stricte |
| Contrat malveillant | Integration GoPlus |
| Jailbreak / root | Jail-monkey, Secure Enclave sur iOS |

Voir [`SECURITY.md`](SECURITY.md) pour la liste complète.

### Politique de sécurité (responsible disclosure)

Trouver une vulnérabilité ? → [`SECURITY.md`](SECURITY.md) → Ne pas poster sur GitHub, nous contacter en privé.

---

## 🗺️ Roadmap

### Phase 1 : MVP (fait ✅)
- Wallet EVM (Ethereum + Polygon + BNB)
- Création / import de seed
- PIN + Biométrie
- Envoi / réception
- Historique
- ~280 tests, chiffre sûr

### Phase 2 : Bitcoin (Q3 2026)
- Dérivation BIP-84 (bc1…)
- Réception + envoi
- UTXO management
- Historique blockchain

### Phase 3 : Solana (Q4 2026)
- Dérivation Ed25519
- Tokens SPL
- Envoi / réception
- Programme calls (voting, staking)

### Phase 4 : Améliorations (2027)
- Swap cross-chain (LiFi)
- Staking Solana + Ethereum Lido
- NFT galerie (Alchemy)
- Notifications push
- Cloud backup (iCloud / Google Drive)

### Phase 5 : Goodies (Nice-to-have)
- Portefeuille hardware (Ledger BLE)
- WalletConnect v2
- Brancher sur Brave Wallet
- ENS support complet

---

## 📚 Documentation

Tous les docs sont dans `/docs` :

| Doc | Contenu |
|-----|---------|
| **01-CAHIER-DES-CHARGES.md** | Vision, périmètre, contraintes |
| **02-ROADMAP.md** | 5 phases, timeline, dépendances |
| **03-ARCHITECTURE.md** | Stack, libs crypto, BIP-44, pattern adapter |
| **04-STRUCTURE-PROJET.md** | Arbo fichiers cible |
| **05-SECURITE.md** | Risques, mitigations, checklist deploy |
| **06-MVP.md** | Périmètre exact Phase 1 |
| **07-DIFFERENCIATION.md** | Features uniques vs MetaMask |

**Lire avant de coder :** 01 + 03 + 05.

---

## 💾 Stack technique complet

### Frontend
- **React Native 0.86** + **Expo 57** (dev build)
- **Expo Router** (file-based navigation)
- **TypeScript** (strict)
- **Zustand** (state management)
- **TanStack Query** (React Query) (server state)
- **Reanimated** + **expo-linear-gradient** (design)

### Native / Sécurité
- **expo-secure-store** (Keychain / Keystore)
- **expo-local-authentication** (biométrie)
- **expo-camera** (QR code scan)
- **expo-clipboard** (copy/paste)
- **expo-screen-capture** (anti-screenshot)
- **jail-monkey** (détection jailbreak/root)

### Cryptographie
- **@noble/hashes** (SHA-256, BLAKE2b, etc.)
- **@noble/curves** (secp256k1, Ed25519)
- **@noble/ciphers** (AES-GCM)
- **@scure/bip39** (mnémonique)
- **@scure/bip32** (dérivation HD)
- **@scure/btc-signer** (Bitcoin)
- **ethers v6** (EVM, RPC, signature)

### Données / Réseau
- **TanStack Query** (cache, refetch)
- **Alchemy API** (balances, tokens, NFT)
- **CoinGecko API** (prix, charts)
- **Etherscan / BlockScout** (historique TX)
- **LiFi API** (swap cross-chain)

### Dev & Test
- **jest** (unit tests)
- **ts-jest** (TypeScript)
- **@types/jest**
- **@resvg/resvg-js** (SVG rasterization)

---

## 🐛 Troubleshooting

### Erreurs courantes

#### "Unable to locate adb"
```bash
# Android
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

#### "React Native version mismatch"
```bash
npm install
npx expo prebuild --clean
```

#### "Jest tests timeout"
```bash
# Augmenter timeout (tests crypto lourds)
npm test -- --testTimeout=60000
```

#### "Keychain access denied" (iOS)
```bash
# Sur simulateur : settings > Keychain, puis réinstaller l'app
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

#### "Private key not decrypting"
- Vérifier le PIN correct (case-sensitive)
- Vérifier que Secure Store n'a pas été effacé
- Logs de debug : `DEBUG=nova:* npm start`

### Logs & Debug

```bash
# Avec Xcode
⌘D dans le simulateur → debug menu

# Avec Android Studio
logcat → Filter "nova" ou "RN"

# Remote debugging (dev server)
npm start → option "j" (ouvre dev menu)
```

---

## 🤝 Contributing

1. **Fork** le repo
2. **Branch** : `git checkout -b feat/cool-feature`
3. **Commit** : `git commit -m "feat: add cool feature"`
   - Respecte [Conventional Commits](https://www.conventionalcommits.org/)
4. **Test** : `npm test` (281 tests + typecheck)
5. **Push** : `git push origin feat/cool-feature`
6. **PR** : Décris ta change, screenshot si UI

### Règles de contribution

✅ **Pour tout changement crypto/domain :** tests obligatoires  
✅ **TypeScript strict** – `npm run typecheck` passe  
✅ **Pas de secrets** dans le code – env vars ou `.env.local`  
✅ **Pas de dépendances non-auditées** – justifier en PR  

---

## 📝 Licence

MIT (à confirmer)

---

## 👥 Team

- **@ahmedsignate2** – Product, Arch, Lead Dev

---

## 💬 FAQ

### "Pourquoi pas MetaMask ?"
MetaMask = poids lourd (40+ chaînes, 1MB extension). NovaWallet = design + sécurité + simplicité. On bats pas sur le nombre, on bats sur l'expérience.

### "Est-ce qu'on peut importer depuis MetaMask ?"
Oui ! Import via seed phrase BIP-39 (même standard). Les adresses générées seront **identiques** si tu utilises le même chemin de dérivation.

### "Qu'est-ce qui se passe si j'oublie mon PIN ?"
Il n'y a pas de "réinitialisation". Si tu as ta seed phrase, tu peux réimporter sur ce wallet ou un autre. Si tu n'as que le PIN (et pas la seed), c'est fini. **À sauvegarder en sécurité.**

### "La seed est stockée où ?"
- iOS → Keychain (chiffré par Secure Enclave)
- Android → Keystore (chiffré par TEE ou scrypt)
- Toutes les deux sous AES-256-GCM avec clé dérivée du PIN.

### "Puis-je exporter ma seed ?"
Oui, depuis Paramètres > Sécurité > Afficher Seed (après PIN). Attention = risque maximum. À faire une seule fois, copier sur papier, puis jamais plus.

### "Qu'est-ce qu'un "multi-compte" ?"
Une seule seed → plein d'index de dérivation (`m/44'/60'/0'/0/0`, `m/44'/60'/0'/0/1`, etc.) = plein d'adresses différentes. Pratique pour séparer les portefeuilles (trading vs épargne).

### "Comment ça marche WalletConnect ?"
Phase 5. Pour l'instant : scan QR → approuve TX sur le wallet → envoie signature. Pas de session persistante.

### "Puis-je brancher un Ledger ?"
Phase 5. Travail en cours. Pour l'instant : Ledger signer (seed localement, pas sur Ledger).

### "Ça marche offline ?"
Partiellement :
- ✅ Voir solde = besoin Internet (requête RPC)
- ✅ Signer TX = offline (clé locale)
- ❌ Broadcast = besoin Internet

Fonctionnalité "mode airplane" → Phase 5.

---

## 📞 Support

- **Issues** : [GitHub Issues](https://github.com/yourusername/nova-wallet/issues)
- **Discussions** : [GitHub Discussions](https://github.com/yourusername/nova-wallet/discussions)
- **Security** : [`SECURITY.md`](SECURITY.md)
- **Email** : [contact info]

---

**Construisons le wallet que tout le monde voudrait. 🚀**


## Acquisition

Nova Wallet is currently available for acquisition.

For acquisition inquiries, commercial licensing, partnerships,
or other business opportunities:

**amsssr400@gmail.com**

## Support the Project

If you would like to support the continued development of Nova Wallet,
you can make a voluntary Bitcoin contribution:

**Bitcoin (BTC):**

`bc1qwdqesyfzja4585f09ylvp4rc2lyqhvmvlvytx4`

Every contribution helps support development, testing, infrastructure,
documentation, and security improvements.

### Security Warning

Nova Wallet support will never ask you for your recovery phrase,
private key, password, or authentication code.
