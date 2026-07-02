# 3. Architecture technique

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
| Ethereum / BNB / Polygon | `m/44'/60'/0'/0/0` | Adresse EVM `0x...` (identique pour les 3) |
| Bitcoin (SegWit natif) | `m/84'/0'/0'/0/0` | `bc1...` |
| Solana | `m/44'/501'/0'/0'` | base58, courbe Ed25519 |

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

## 3.6 Backend ?

**Aucun backend propriétaire pour les fonds.** L'app parle directement :
- aux **RPC** des chaînes (Alchemy/Infura pour EVM, mempool.space pour BTC, RPC Solana),
- à des **API de données** en lecture seule (CoinGecko pour les prix, indexeurs pour l'historique).

Ces services ne voient **jamais** de clé — seulement des **adresses publiques**. Un éventuel backend futur ne servirait qu'à des données non sensibles (notifications, prix), jamais à la custody.
