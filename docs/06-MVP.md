# 6. Le MVP exact à coder en premier

**Définition du MVP = Phase 1.** Un wallet **EVM mono-compte**, sécurisé et beau, sur **un seul réseau** au départ (idéalement **testnet Sepolia** pour tester sans risque, puis Ethereum mainnet).

> Pourquoi EVM d'abord : la clé EVM est aussi valable pour BNB Chain et Polygon (mêmes adresses). On construit donc la base de 3 chaînes d'un coup, sans complexité UTXO (Bitcoin) ni Ed25519 (Solana).

## 6.1 Périmètre précis du MVP

### ✅ Dans le MVP
1. **Setup & socle**
   - Projet Expo (dev build) + TypeScript strict.
   - `polyfills.ts` (aléatoire sûr) importé en premier.
   - Design system minimal : thème dark, `Card`, `Button`, typographie.
2. **Onboarding**
   - Écran d'accueil (créer / importer).
   - **Créer** : génération d'une seed BIP-39 (12 mots).
   - **Backup** : affichage de la seed (écran protégé capture) + bouton « j'ai noté ».
   - **Verify** : re-sélection de quelques mots pour confirmer.
   - **Import** : coller une seed BIP-39 existante (validée).
3. **Sécurité locale**
   - Définition d'un **PIN**.
   - Activation **biométrie**.
   - Seed **chiffrée** stockée dans SecureStore.
   - Écran de **déverrouillage** au lancement + auto-lock.
4. **Compte EVM**
   - Dérivation `m/44'/60'/0'/0/0` → 1 adresse `0x...`.
5. **Accueil (Home)**
   - Affichage de l'adresse (tronquée) et du **solde ETH** (via RPC).
6. **Recevoir**
   - Adresse complète + **QR code** + copier.
7. **Envoyer**
   - Saisie/scan adresse + montant.
   - Estimation du **gas**.
   - **Écran de confirmation** (destinataire, montant, frais).
   - Signature locale + broadcast + retour du hash.

### ❌ Hors MVP (phases suivantes)
- Autres réseaux (BNB, Polygon) → phase 2.
- Tokens ERC-20 → phase 2.
- Historique des transactions → phase 2.
- Prix fiat / portefeuille agrégé → phase 2.
- Bitcoin → phase 3. Solana → phase 4.
- Multi-comptes, WalletConnect, swap → phases avancées.

## 6.2 Ordre de construction recommandé (dans le MVP)

Construire dans cet ordre garantit qu'on teste la sécurité avant de toucher au réseau :

1. Socle projet + polyfills + design system.
2. Module `crypto/` : mnemonic (BIP-39) + dérivation HD (BIP-32/44) → **testé unitairement**.
3. Module `security/` : SecureStorage (chiffrement) + PIN + biométrie.
4. `WalletService` : create / import / unlock, branché sur les 2 modules ci-dessus.
5. Flux onboarding UI (welcome → create → backup → verify → set-pin).
6. Écran unlock + auto-lock.
7. `EvmAdapter` : `getBalance` (lecture seule d'abord).
8. Home (affiche solde) + Receive (QR).
9. Send (build tx → confirm → sign → broadcast) **sur testnet uniquement au début**.

## 6.3 Définition de « MVP terminé » (Definition of Done)

Le MVP est fini quand **tout ceci est vrai** :

- [ ] Je crée un wallet, je vois ma seed (écran protégé capture), je la vérifie.
- [ ] Je ferme et rouvre l'app → elle me demande PIN/biométrie.
- [ ] Après réinstallation, j'importe ma seed et je **retrouve la même adresse**.
- [ ] Ma seed importée dans MetaMask donne **la même adresse EVM** (preuve BIP-39/44).
- [ ] Je vois mon solde ETH (testnet).
- [ ] Je reçois des ETH de test (adresse/QR) et le solde se met à jour.
- [ ] J'envoie des ETH de test avec confirmation, et je récupère le hash de transaction.
- [ ] **Aucune requête réseau ne contient de seed/clé** (vérifié au proxy).
- [ ] Aucun `console.log` de secret.

## 6.4 Pré-requis avant de commencer à coder

Quand tu me diras « go, on code », il me faudra savoir :
1. **iOS, Android, ou les deux** en priorité pour le premier build ?
2. Tu as un **compte EAS / Expo** pour les dev builds ? (nécessaire, Expo Go ne suffit pas).
3. On démarre sur **testnet Sepolia** (recommandé, zéro risque) — OK ?
4. Un **provider RPC** (Alchemy/Infura, offre gratuite) — je te guide pour la clé.

---

### Prochaine étape
Le plan est prêt. Dès que tu valides (et réponds aux 4 questions ci-dessus), je scaffolde le projet et j'attaque le MVP dans l'ordre du §6.2.
