# Carte d'audit — Kalyx

**But :** savoir ce qui a été vérifié et ce qui reste. Un audit est terminé quand
toutes les lignes sont ✅. Chaque type de faille trouvé reçoit, si possible, une
**garde automatique** (test ou contrôle CI) qui l'empêche de revenir.

Statuts : ✅ vérifié · ⚠️ vérifié en partie / réserve connue · ⬜ à vérifier ·
🛡️ protégé par une garde automatique.

Priorité : **P0** perte de fonds ou de secret · **P1** fausse information avant
signature, fuite de donnée · **P2** fonctionnement, confort.

---

## A. Entrées externes (tout ce qui arrive de l'extérieur)

| # | Surface | Fichiers | Prio | Statut | Notes |
|---|---|---|---|---|---|
| A1 | Liens profonds `kalyx://`, `wc:`, `ethereum:`, `bitcoin:`, `solana:`, `ton://`, liens https | `ui/DeepLinks.tsx`, `app/+native-intent.tsx` | P0 | ✅ 🛡️ | Aucun lien n'ouvre un écran directement (e401228). Verrouillé : mis en attente. |
| A2 | Scan de QR | `app/scan.tsx`, `src/domain/qr/parse.ts`, `lib/paymentIntent.ts` | P0 | ⬜ | Jeton résolu sur la chaîne (vu) ; cas limites du parseur à revoir. |
| A3 | Navigateur dApps — fournisseur EVM | `app/(tabs)/browser.tsx`, `lib/dappProvider.ts` | P0 | ✅ 🛡️ | Jeton de page contre les iframes, https obligatoire, adresse EVM, Chain ID de la demande. |
| A4 | Navigateur dApps — pont TON | `src/domain/tonconnect/jsBridge.ts` | P0 | ✅ 🛡️ | Jeton de page, manifeste = page. |
| A5 | WalletConnect (sessions, requêtes) | `lib/walletconnect.ts`, `ui/WalletConnectHost.tsx` | P0 | ⚠️ | Adresses par espace de noms, `from` = compte actif, EIP-712 autre réseau signalé. SDK `web3wallet` à migrer (dépendance `elliptic` vulnérable, non utilisée pour nos clés). |
| A6 | TON Connect (pont HTTP / SSE et navigateur) | `lib/tonconnect/store.ts`, `ui/TonConnectHost.tsx` | P0 | ✅ 🛡️ | Messages chiffrés et authentifiés, `from` / réseau / échéance vérifiés, compte revérifié à la signature. **Corrigé :** sans émulation, un transfert de jetons ou de NFT caché dans les données était signable ; maintenant décodé localement (`src/domain/tonconnect/payload.ts`) et bloqué. `restoreConnection` limité au portefeuille de la session. |
| A7 | WalletConnect Pay | `lib/walletconnectPay.ts`, `app/pay.tsx` | P0 | ⚠️ | Méthodes et réseaux en liste fermée. **Réserve :** la signature n'est pas comparée au montant choisi. |
| A8 | Solana Pay (transaction construite par un serveur) | `app/solana-request.tsx` | P0 | ✅ | Décodée avant signature, adresse Solana correcte (e401228). |
| A9 | Assistant IA (actions proposées) | `lib/aiActions.ts`, `components/ai/*`, `ui/CopilotSheet.tsx` | P1 | ✅ 🛡️ | Liste blanche d'écrans et de paramètres. Outils du copilote (`lib/copilotTools.ts`) à revoir. |
| A10 | Presse-papiers (coller une adresse) | `app/send.tsx` | P1 | ⬜ | Empoisonnement d'adresse, adresses sosies. |
| A11 | Import de phrase / clé | `app/import*.tsx`, `src/domain/keys` | P0 | ⚠️ | Classification des phrases vérifiée ; saisie protégée contre la capture. |
| A12 | Restauration de sauvegarde (Drive / fichier) | `src/domain/backup`, `app/restore-drive.tsx`, `lib/googleDrive.ts` | P0 | ✅ | Phrases TON acceptées, portefeuilles supplémentaires importés. OAuth Drive à revoir (⬜). |

## B. Données distantes (peuvent mentir)

| # | Source | Prio | Statut | Notes |
|---|---|---|---|---|
| B1 | Devis d'échange LI.FI / Jupiter → transaction à signer | P0 | ✅ 🛡️ | `src/domain/swap/guard.ts` : contrat et autorisation LI.FI officiels par réseau, réseau, jeton, montant, réception chez soi ; Solana : payé par nous. Revérifié au moment de signer. Testé sur devis réels. |
| B2 | Earn / staking (transactions construites) | P0 | ✅ 🛡️ | Contrats directs codés en dur (Aave, Lido, Benqi) ; routes LI.FI passées au même contrôle que B1. |
| B3 | Métadonnées de jetons (nom, symbole, décimales) | P1 | ⬜ | Usurpation de symbole, faux USDC, décimales. |
| B4 | Historique (spam, empoisonnement d'adresse) | P1 | ⬜ | `lib/historySpam.ts`. |
| B5 | NFT (métadonnées, images) | P2 | ⬜ | |
| B6 | RPC et réseaux personnalisés | P1 | ⬜ | `lib/customChainsStore.ts` : un RPC peut mentir sur solde, gas, simulation. |
| B7 | Jetons personnalisés | P1 | ⬜ | `lib/customTokensStore.ts`. |
| B8 | GoPlus, simulation | P1 | ✅ | Raisons traduites ; une panne ne doit pas afficher « sûr » (à revérifier ⬜). |
| B9 | Résolution ENS / DNS TON | P1 | ⬜ | Afficher l'adresse résolue avant envoi. |

## C. Signature et envoi (fonctions du coffre, `lib/walletStore.ts`)

| # | Fonction | Prio | Statut | Notes |
|---|---|---|---|---|
| C1 | `signAndSend` / `sendDraft` (envoi natif, toutes chaînes) | P0 | ⬜ | Montant, décimales, frais, réserve de gas. |
| C2 | `sendToken`, `sendSolToken`, `sendJetton` | P0 | ⬜ | |
| C3 | Envoi de NFT (EVM, Solana, TON) | P0 | ⬜ | Message d'erreur corrigé (a9a8fc3). |
| C4 | `executeSwap` | P0 | ✅ 🛡️ | Contrôle B1 avant dérivation de la clé. |
| C5 | `signMessage`, `signTypedData` | P0 | ⚠️ | Décodage et alerte autre réseau ; Permit / Permit2 à vérifier. |
| C6 | `sendRawTxOn` | P0 | ⚠️ | Chain ID de la demande, `from` EVM. Clé en hexadécimal non effacée. |
| C7 | `signSolanaTransaction(s)`, `signSolanaMessage` | P0 | ✅ | Décodeur unique (1d974f1). Rafraîchissement du blockhash à revoir. |
| C8 | `signBitcoinPsbt`, `signBitcoinMessage`, `bumpBitcoin` | P0 | ⚠️ | PSBT décodé (ed70cdc) ; RBF à revoir. |
| C9 | Révocation d'approbations | P1 | ⬜ | `app/approvals.tsx`. |

## D. Secrets et verrouillage

| # | Élément | Prio | Statut | Notes |
|---|---|---|---|---|
| D1 | Stockage de la phrase (SecureStore, chiffrement, dérivation du PIN) | P0 | ⬜ | Revue du format et des options SecureStore. |
| D2 | Tentatives de PIN, blocage | P0 | ✅ 🛡️ | Comptées partout (`lib/walletPinLockout.test.ts`). |
| D3 | Biométrie | P0 | ✅ | Pas de repli sur le code du téléphone (1d974f1). |
| D4 | Verrouillage (rideau, fenêtres, hôtes) | P0 | ✅ | `app/_layout.tsx`, `SafeModal`, `useLocked`. Verrouillage auto en arrière-plan à revérifier (⬜). |
| D5 | Affichage de la phrase / clé privée | P0 | ✅ | Clé du réseau affiché, presse-papiers effacé, anti-capture. |
| D6 | Export chiffré des sauvegardes | P0 | ✅ | Biométrie exigée (C-01). Force du chiffrement à revoir (⬜). |
| D7 | Effacement des clés en mémoire | P1 | ⚠️ | `withSigner` efface ; clé EVM (hexadécimal) non effaçable. |
| D8 | Journaux, diagnostics, tickets de support | P1 | ⚠️ | `sanitizeLog`, détecteur de secrets ; contenu des tickets à revoir. |
| D9 | Suppression / réinitialisation | P0 | ✅ 🛡️ | PIN exigé et compté. |

## E. Infrastructure

| # | Élément | Prio | Statut | Notes |
|---|---|---|---|---|
| E1 | **Mises à jour OTA non signées** | P0 | ⬜ | Sans signature de code, un accès au compte Expo suffit pour envoyer du code à tous les téléphones. Nécessite un nouvel APK. |
| E2 | Variables `EXPO_PUBLIC_` (aucun secret) | P0 | ✅ | Clé Helius retirée. **À faire par toi :** révoquer l'ancienne clé. |
| E3 | Historique git (secrets, fichiers privés) | P0 | ✅ 🛡️ | Historique réécrit ; `scripts/check-repo-files.mjs` en CI. |
| E4 | Dépendances (`npm audit`) | P1 | ⚠️ | 5 alertes, toutes via `@walletconnect/web3wallet` (voir A5). |
| E5 | Proxy TON (Worker) | P1 | ✅ | Liste blanche stricte, aucun journal. À redéployer par toi. |
| E6 | Bot Telegram | P2 | ✅ | Webhook signé. Déployé depuis kalyx-wallet. |
| E7 | Tableau de bord web (`ui/web`, `web/`) | P1 | ⬜ | |
| E8 | Runtime natif / OTA incompatible | P1 | ✅ 🛡️ | `scripts/check-native-runtime.mjs`. |

---

## Gardes automatiques

En place :
- `scripts/check-repo-files.mjs` : aucun fichier interdit dans le dépôt.
- `scripts/check-native-runtime.mjs` : natif changé ⇒ runtime incrémenté.
- CI « Anti-log de secret » : pas de `console.log` de phrase ou de clé dans `src/`.
- Tests : blocage du PIN, jeton de page, actions de l'assistant, décodage PSBT / Solana, fenêtres de signature traduites.

- `scripts/check-address-usage.mjs` (CI) : tout nouvel `account.address` (adresse du réseau affiché) doit être vérifié.
- `lib/nativeIntent.test.ts` : aucun lien externe n'ouvre un écran directement.
- `src/domain/tonconnect/payload.test.ts` + `lib/tonconnect/store.test.ts` : jamais de signature TON à l'aveugle.
- `src/domain/swap/guard.test.ts` (+ `guardLive.test.ts`, `EARN_LIVE=1`) : devis d'échange / Earn contrôlés.

## Journal

| Date | Commit | Lignes passées à ✅ |
|---|---|---|
| 2026-09-28 | a9a8fc3 | A3, A4, E3 |
| 2026-09-28 | e401228 | A1, A8, A9 |
| 2026-09-28 | (ce commit) | B1, B2, C4 |
