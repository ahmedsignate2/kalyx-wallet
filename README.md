# Wallet crypto non-custodial — Plan complet

Wallet mobile **non-custodial**, multi-chain, en **React Native / Expo**, avec une UI premium style Revolut (dark mode, cartes arrondies, mobile-first).

> ⚠️ Ce dossier ne contient **que le plan**. Aucun code d'application n'est écrit pour l'instant.
> Nom de code provisoire dans la doc : **NovaWallet** (à renommer librement).

## Principes non négociables

- **Non-custodial** : c'est l'utilisateur qui détient ses clés. Aucun serveur ne les voit.
- **Les clés privées ne quittent jamais l'appareil.** Aucune clé, aucune seed phrase n'est envoyée sur le réseau, ni loggée.
- **BIP-39** pour la phrase de récupération (12 ou 24 mots).
- **Chiffrement local** des données sensibles, stockage dans le Keychain (iOS) / Keystore (Android).
- **MVP d'abord**, puis extension chaîne par chaîne. On ne fait pas tout d'un coup.

## Les 6 documents

| # | Document | Contenu |
|---|----------|---------|
| 1 | [docs/01-CAHIER-DES-CHARGES.md](docs/01-CAHIER-DES-CHARGES.md) | Ce que le produit doit faire, périmètre, contraintes |
| 2 | [docs/02-ROADMAP.md](docs/02-ROADMAP.md) | 5 phases, de l'MVP à la version complète |
| 3 | [docs/03-ARCHITECTURE.md](docs/03-ARCHITECTURE.md) | Stack technique, couches, choix des libs crypto |
| 4 | [docs/04-STRUCTURE-PROJET.md](docs/04-STRUCTURE-PROJET.md) | Arborescence fichiers/dossiers cible |
| 5 | [docs/05-SECURITE.md](docs/05-SECURITE.md) | Risques à éviter + contre-mesures |
| 6 | [docs/06-MVP.md](docs/06-MVP.md) | Le périmètre exact à coder en premier |
| 7 | [docs/07-DIFFERENCIATION.md](docs/07-DIFFERENCIATION.md) | Fonctions qui font quitter MetaMask, classées par compatibilité non-custodial |

## État du code (en cours)

Le cœur cryptographique est implémenté et **testé dès le départ** (une régression ici coûterait de l'argent aux utilisateurs) :

| Module | Rôle | Tests |
|--------|------|-------|
| `src/crypto/random.ts` | Aléatoire sûr (CSPRNG) | — |
| `src/crypto/mnemonic.ts` | Phrase BIP-39 (génération, validation, seed) | ✅ 7 |
| `src/crypto/hd.ts` | Dérivation HD BIP-44 EVM → adresse | ✅ 5 |
| `src/domain/errors.ts` | Erreurs typées (`code` stable, sans détail sensible) | — |
| `src/domain/validation/address.ts` | Validation adresse EVM + checksum EIP-55 | ✅ 6 |
| `src/domain/validation/amount.ts` | Montants en `bigint`, décimales, solde/frais | ✅ 6 |
| `src/domain/wallet/backupChallenge.ts` | Vérification de la sauvegarde de seed | ✅ 4 |
| `src/domain/chains/types.ts` | Interface plugin `ChainAdapter` (multi-chaînes) | — |
| `src/domain/chains/EvmChainAdapter.ts` | Adapter EVM : dérivation, transfert, signature, broadcast | ✅ 6 |
| `src/domain/chains/registry.ts` + `configs.ts` | Registre + réseaux (Ethereum, BNB, Polygon, Sepolia) | ✅ 4 |
| `src/security/vault.ts` | Coffre chiffré AES-256-GCM, clé dérivée du PIN (scrypt) | ✅ 7 |
| `src/security/pin.ts` | Politique de PIN + verrouillage anti-brute-force | ✅ 7 |
| `src/domain/chains/net.ts` | Timeout + fallback multi-RPC (`tryInOrder`) | ✅ 6 |
| `src/domain/chains/etherscan.ts` | Parseur d'historique de transactions | ✅ 4 |
| `formatBalance` (amount.ts) | Solde tronqué 4-6 décimales, poussière `<0.000001` | ✅ 2 |

**66 tests, typage strict OK.** Réseaux EVM : Sepolia (défaut), Ethereum, Polygon, BNB, Base — sélectionnables dans l'app (même adresse partout).

### Architecture multi-chaînes (plugins)
Chaque réseau est branché via l'interface `ChainAdapter`. Un seul `EvmChainAdapter` paramétré couvre **tous** les réseaux EVM (même clé, même adresse — seul le RPC/chainId change) : ajouter Base / Arbitrum / Avalanche = **une entrée de config**. Ajouter Bitcoin ou Solana = **un nouvel adapter**, sans toucher au reste du wallet. Les tests s'appuient sur des **vecteurs de référence connus** (phrase `abandon…about` → adresse `0x9858…da94`) et sur un **contrôle croisé** entre `@scure` et `ethers` : deux implémentations indépendantes doivent produire la même adresse. Conformité BIP-39/44 prouvée.

```bash
npm install     # une fois
npm test        # lance la suite (28 tests)
npm run typecheck
```

CI GitHub Actions (`.github/workflows/ci.yml`) : typecheck + tests + garde-fou anti-log de secret à chaque push/PR. Voir [`SECURITY.md`](SECURITY.md).

**Règle du projet :** chaque module crypto/domain arrive avec ses tests dans le même commit. Pas de code sensible sans test.

## Résumé en une phrase

On construit d'abord un **wallet EVM mono-clé** (Ethereum, BNB Chain, Polygon partagent la même dérivation) avec création/import de seed, stockage chiffré, réception et envoi — puis on ajoute **Bitcoin** et **Solana** dans des phases séparées.
