# 2. Roadmap — 5 phases

Chaque phase est **livrable et testable** seule. On ne passe à la suivante qu'une fois la précédente stable. La règle : **la sécurité et le socle crypto d'abord, le multi-chain ensuite, le confort à la fin.**

---

## Phase 1 — Socle sécurisé & wallet EVM (= le MVP)

**But :** un wallet Ethereum fonctionnel, sûr, beau. C'est la fondation.

- Setup projet Expo (dev build), design system de base, dark mode.
- Polyfills crypto (`react-native-get-random-values`) + génération aléatoire sûre.
- Onboarding : créer / importer une seed **BIP-39**.
- Sauvegarde + vérification de la seed phrase.
- Stockage **chiffré** de la seed (SecureStore + biométrie/PIN).
- Verrouillage app (PIN + biométrie, auto-lock).
- Dérivation d'un compte **EVM** (BIP-44 `m/44'/60'/0'/0/0`).
- Écran d'accueil : solde ETH (1 réseau : Ethereum mainnet ou testnet Sepolia).
- **Recevoir** : adresse + QR.
- **Envoyer** : transfert ETH natif avec estimation de gas + confirmation.

➡️ Détail exact dans [06-MVP.md](06-MVP.md).

---

## Phase 2 — Multi-EVM + tokens + historique

**But :** exploiter que ETH / BNB / Polygon partagent la même clé.

- Ajout des réseaux **BNB Chain** et **Polygon** (mêmes adresses EVM, RPC différents).
- Sélecteur de réseau, gestion de plusieurs RPC.
- Support **tokens ERC-20** (USDT, USDC, etc.) : lecture des soldes, envoi.
- **Historique** des transactions (via explorateur/indexeur : Etherscan-like API ou Covalent/Alchemy).
- Prix fiat temps réel + variation 24h (CoinGecko).
- Vue portefeuille agrégée (valeur totale en €/$).
- ⭐ **Détection d'arnaque avant signature** (v1) : simulation de tx + alerte sur les approbations illimitées + listes de contrats malveillants. Voir [07-DIFFERENCIATION.md](07-DIFFERENCIATION.md). C'est le différenciateur n°1 — à prioriser dès qu'on signe des tx réelles.

---

## Phase 3 — Bitcoin

**But :** ajouter la première chaîne non-EVM.

- Dérivation BTC (BIP-84 SegWit natif `m/84'/0'/0'`, adresses `bc1...`).
- Gestion du modèle **UTXO** (différent des comptes EVM).
- Solde, réception (QR), envoi avec estimation des frais (sat/vB).
- Historique via API (Blockstream / mempool.space).

---

## Phase 4 — Solana

**But :** deuxième chaîne non-EVM, dérivation Ed25519.

- Dérivation Solana (`m/44'/501'/0'/0'`, courbe Ed25519).
- Solde SOL + tokens **SPL** (USDC…).
- Réception, envoi, frais.
- Historique via RPC Solana / indexeur.

---

## Phase 5 — Confort, différenciation & durcissement

**But :** finir l'expérience premium et durcir la sécurité.

- **Multi-wallets en un clic** (plusieurs comptes/adresses par chaîne via index HD), renommage.
- **Mode débutant / expert** (masquer/afficher gas avancé, nonce, données hex).
- **Wallet caché** protégé par un **2e PIN** (déni plausible, façon passphrase Ledger).
- **Alertes de prix** (notifications locales).
- Carnet d'adresses.
- Détection root/jailbreak, protection anti-capture d'écran sur les écrans sensibles.
- WalletConnect (connexion aux dApps) — optionnel.
- Audit de sécurité externe avant toute mise en prod avec de vrais fonds.
- Multi-langue complète, onboarding pédagogique, animations.

---

## Phase 6 — Écosystème (catégorie B, via prestataires tiers)

**But :** enrichir sans jamais prendre la clé de l'utilisateur. Modules **isolés**, activables/désactivables.

- **Swap** même chaîne et cross-chain via agrégateurs (0x / 1inch / LiFi, Jupiter pour Solana). L'utilisateur signe lui-même.
- **Staking** via contrats de liquid staking, avec avertissements de risque smart-contract.

> Détails et garde-fous dans [07-DIFFERENCIATION.md](07-DIFFERENCIATION.md).

---

## Phase 7 — Services régulés (catégorie C, optionnelle)

**But :** achat/vente fiat et cartes — **uniquement** via un partenaire régulé.

- **Achat/vente crypto in-app** via on/off-ramp régulé (MoonPay / Ramp / Transak) : implique KYC côté prestataire.
- **Cartes virtuelles** via émetteur régulé : chantier juridique majeur (licence, KYC, conformité AML).

> ⚠️ Ces fonctions changent la nature réglementaire du produit. À ne lancer qu'après cadrage juridique, et à garder strictement séparées du cœur non-custodial. Voir catégorie C de [07-DIFFERENCIATION.md](07-DIFFERENCIATION.md).

---

# Vision long terme (phases 8 → 10)

Ces phases ne sont pas planifiées en détail — ce sont des **caps**, pas des engagements. Elles n'ont de sens qu'une fois le cœur mobile (phases 1-5) mature et audité. Elles montrent que l'architecture (couche `domain` isolée de l'UI, pattern `ChainAdapter`, secrets cloisonnés) est conçue pour les accueillir sans réécriture.

## Phase 8 — Multi-plateforme & synchronisation E2E

- **Extension navigateur** : Chrome / Firefox / Edge (pour interagir avec les dApps sur desktop).
- **Application desktop** : Windows / macOS / Linux.
- **Synchronisation sécurisée entre appareils** : chiffrement **de bout en bout**, la seed **ne transite jamais en clair** — un appareil chiffre localement, le transport ne voit que du chiffré, seul un autre appareil autorisé déchiffre. Le serveur de sync (s'il existe) est aveugle.

> Contrainte : la logique métier (`src/domain`) doit rester **indépendante de React Native** pour être réutilisable côté extension/desktop. À garder en tête dès maintenant dans le découpage des modules.

## Phase 9 — Sécurité avancée & comptes intelligents

- **Wallets matériels** : Ledger, Trezor, Keystone, GridPlus (la clé reste sur le device physique).
- **Multisignature** : portefeuilles à plusieurs signataires (sécurité familiale / trésorerie).
- **Comptes intelligents (ERC-4337 / account abstraction)** quand c'est pertinent : récupération sociale, sponsoring de gas, limites de dépense — sans sacrifier le non-custodial.

## Phase 10 — Intelligence & protection proactive

- **IA locale** qui explique chaque transaction en langage simple, **sur l'appareil** (aucune donnée sensible envoyée à un service tiers).
- Version aboutie de la **détection d'approbations dangereuses** (démarrée en phase 2).
- **Vérification des adresses/contrats** contre des listes publiques d'arnaques.
- **Analyse de risque avant signature** complète : score de risque, explication, recommandation.

> C'est l'aboutissement du positionnement « le wallet qui te protège et que tu comprends ». Ce qui commence comme une simple alerte en phase 2 devient ici un vrai copilote de sécurité.

---

## Jalons de validation

| Fin de phase | Preuve que ça marche |
|--------------|----------------------|
| Phase 1 | Seed exportée = mêmes adresses que MetaMask ; envoi/réception ETH sur testnet OK. |
| Phase 2 | Un même wallet montre ses soldes sur 3 réseaux EVM + un token ERC-20 envoyé + une tx à risque déclenche une alerte avant signature. |
| Phase 3 | Réception + envoi BTC sur testnet. |
| Phase 4 | Réception + envoi SOL sur devnet. |
| Phase 5 | Multi-wallets + wallet caché + mode expert OK ; checklist sécurité complète cochée, revue externe passée. |
| Phase 6 | Un swap cross-chain signé par l'utilisateur aboutit ; staking testé. |
| Phase 7 | On/off-ramp partenaire intégré et cloisonné du cœur non-custodial. |
