# 3. Architecture technique

> **Écarts avec le plan d'origine** (état réel, octobre 2026) :
> - Pas de TanStack Query ni de SQLite/MMKV : l'état et les caches sont dans des stores
>   **Zustand** persistés (AsyncStorage pour le non-secret, SecureStore pour le secret ;
>   IndexedDB chiffré côté web).
> - Dérivation Ed25519 maison en **SLIP-0010** (`src/crypto/slip10.ts`), partagée par
>   Solana et TON — pas de `ed25519-hd-key`.
> - **TON** a rejoint EVM, Bitcoin et Solana (voir [10-TON.md](10-TON.md)).
> - Un **tableau de bord web** (`ui/web/`, aussi mini-app Telegram) réutilise le moteur
>   et les stores, sans jamais détenir de clé : il demande les signatures au téléphone
>   par WalletConnect.
> - Pas de mise à jour à distance (OTA) : chaque version est un APK construit sur EAS.

## 3.1 Stack

| Couche | Choix | Pourquoi |
|--------|-------|----------|
| Framework | **React Native + Expo** (dev build / EAS) | Demandé. Dev build obligatoire car on a besoin de modules natifs (SecureStore, crypto). **Pas Expo Go.** |
| Langage | **TypeScript** (strict) | Sûreté de types, indispensable pour du code qui manipule des clés. |
| Navigation | **Expo Router** (file-based) | Simple, moderne, deep-linking natif. |
| État global | **Zustand** | Léger, sans boilerplate, parfait pour l'état wallet/session. |
| Data réseau | **TanStack Query** (React Query) | Cache, refetch, statut des requêtes soldes/prix/historique. |
| Stockage secret | **expo-secure-store** (Keychain/Keystore) | Stockage matériel chiffré des secrets. |
| Stockage non-secret | **expo-sqlite** ou MMKV | Cache d'historique, préférences (jamais de secret ici). |
| UI / style | Design system maison + **Reanimated** + **expo-linear-gradient** | Look Revolut = composants sur mesure. Éviter les kits génériques. |
| Biométrie | **expo-local-authentication** | Face ID / Touch ID / empreinte. |

## 3.2 Librairies cryptographiques (choix critique)

On utilise l'écosystème **audité et minimaliste de Paul Miller (`@noble` / `@scure`)**, référence de facto en JS pour la crypto de wallets. On évite les vieilles libs monolithiques non maintenues.

| Besoin | Lib |
|--------|-----|
| Aléatoire sûr (CSPRNG) | `react-native-get-random-values` (polyfill de `crypto.getRandomValues`) — **à importer en tout premier**. |
| Mnémonique BIP-39 | `@scure/bip39` |
| Dérivation HD BIP-32 | `@scure/bip32` |
| Courbes / hash | `@noble/curves`, `@noble/hashes` |
| Signature EVM + RPC | `ethers` v6 (ou `viem`) |
| Bitcoin (phase 3) | `@scure/btc-signer` |
| Solana (phase 4) | `@solana/web3.js` + dérivation Ed25519 (`ed25519-hd-key`) |
| Chiffrement symétrique | AES-GCM via `@noble/ciphers` (couche applicative en plus de SecureStore) |

> **Règle d'or :** on ne réécrit jamais de crypto soi-même. On utilise des libs auditées, on les tient à jour, on vérifie leur intégrité (voir [05-SECURITE.md](05-SECURITE.md)).

## 3.3 Dérivation des clés (BIP-44)

Une **seule seed BIP-39** → un master seed → dérivation par chaîne :

| Chaîne | Chemin | Type d'adresse |
|--------|--------|----------------|
| Tous les réseaux EVM (62) | `m/44'/60'/0'/0/i` | Adresse EVM `0x...` (identique partout) |
| Bitcoin (SegWit natif) | `m/84'/0'/0'/0/i` | `bc1...` |
| Solana | `m/44'/501'/i'/0'` | base58, courbe Ed25519 (SLIP-0010) |
| TON | `m/44'/607'/0'` (ou phrase TON native) | adresse de wallet v4/v5, Ed25519 (SLIP-0010) |

**Point clé :** ETH, BNB Chain et Polygon = **même clé, même adresse**. Seul le **RPC** (le réseau interrogé) change. C'est ce qui rend le MVP EVM si rentable : 3 chaînes pour le prix d'une.

## 3.4 Couches applicatives

```
┌─────────────────────────────────────────────┐
│  UI (écrans + design system)                 │  ← ne touche jamais aux clés brutes
├─────────────────────────────────────────────┤
│  State (Zustand) + Data (React Query)        │
├─────────────────────────────────────────────┤
│  Domain / Services                           │
│   - WalletService (create/import/lock)       │
│   - KeyManager (dérivation, signature)       │  ← seul endroit qui manipule les clés
│   - ChainAdapters (EVM / BTC / SOL)          │
│   - PriceService, HistoryService             │
├─────────────────────────────────────────────┤
│  Secure layer                                │
│   - SecureStorage (SecureStore + AES-GCM)    │
│   - Biometrics gate                          │
├─────────────────────────────────────────────┤
│  Crypto libs (@noble / @scure / ethers…)     │
└─────────────────────────────────────────────┘
```

**Principe d'isolation :** la clé privée en clair n'existe que **le temps de signer une transaction**, dans le `KeyManager`, puis elle est effacée de la mémoire. L'UI ne reçoit jamais qu'une clé publique / adresse / signature.

## 3.5 Pattern ChainAdapter (extensibilité)

Chaque chaîne implémente une interface commune, ce qui permet d'ajouter BTC/SOL sans toucher au reste :

```ts
interface ChainAdapter {
  deriveAccount(seed: Uint8Array, index: number): Account;
  getBalance(address: string): Promise<Balance>;
  buildTransaction(params: TxParams): Promise<UnsignedTx>;
  signTransaction(tx: UnsignedTx, privateKey: Uint8Array): Promise<SignedTx>;
  broadcast(signedTx: SignedTx): Promise<TxHash>;
  getHistory(address: string): Promise<Tx[]>;
}
```

- Phase 1-2 : `EvmAdapter` (paramétré par RPC + chainId).
- Phase 3 : `BitcoinAdapter` (modèle UTXO).
- Phase 4 : `SolanaAdapter` (Ed25519 + SPL).
- Ajout : `TonChainAdapter` / `TonAdapterV2` (jettons, staking Tonstakers, TON Connect).

Implémentation réelle : `src/domain/chains/` (`EvmChainAdapter`, `BitcoinChainAdapter`,
`SolanaChainAdapter`, `TonChainAdapter`, et la génération `v2/`).

## 3.6 Backend ?

**Aucun backend propriétaire pour les fonds.** L'app parle directement :
- aux **RPC** des chaînes (Alchemy/Infura pour EVM, mempool.space pour BTC, RPC Solana),
- à des **API de données** en lecture seule (CoinGecko pour les prix, indexeurs pour l'historique).

Ces services ne voient **jamais** de clé — seulement des **adresses publiques**.

Services Kalyx existants (Cloudflare), tous **sans aucune clé** :
- **`web/`** — site kalyxwallet.com et relais de paiement ;
- **`ton-proxy/`** — proxy TonAPI (la clé TonAPI reste côté serveur, routes en liste blanche) ;
- **`bot/`** — bot Telegram : ne garde que l'identifiant Telegram, la langue et les alertes de prix ;
- **app.kalyxwallet.com** — tableau de bord web statique (`ui/web/`), signatures relayées au téléphone.
