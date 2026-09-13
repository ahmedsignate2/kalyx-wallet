# Lancer l'app Kalyx Wallet (Expo)

> ⚠️ **Statut honnête** : le **moteur** (`src/`) est testé et vérifié (40 tests).
> La **couche UI Expo** (`app/`, `ui/`, `lib/`) a été **écrite mais pas encore
> lancée** — elle n'a pas pu être bootée dans l'environnement de dev (pas de
> simulateur/téléphone). Les commandes ci-dessous sont à exécuter **sur ta
> machine** pour l'ouvrir et itérer sur le design. C'est le moment où les vrais
> problèmes d'ergonomie apparaissent.

## 1. Réseau par défaut

L'app démarre sur **Sepolia (testnet)** via un RPC public — **zéro risque, aucune
config requise** pour ouvrir l'app. Pour de meilleures perfs, remplace le RPC
public dans `src/domain/chains/configs.ts` par un endpoint Alchemy/Infura.

Récupère des ETH de test gratuits sur un faucet Sepolia pour tester recevoir/envoyer.

## 2. Installer les dépendances Expo

Le `package.json` racine ne contient que le moteur (pour garder la CI/les tests
rapides). Ajoute la couche mobile :

```bash
npx expo install expo expo-router expo-secure-store expo-local-authentication \
  expo-linear-gradient expo-clipboard expo-status-bar expo-screen-capture \
  react-native-qrcode-svg react-native-svg react-native react react-dom
npm install zustand
```

Puis, dans `package.json`, assure-toi d'avoir :

```json
{
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  }
}
```

> Note : `expo install` alignera les versions RN/Expo compatibles et mettra à
> jour le lockfile (la CI se re-verrouillera au prochain PR).

## 3. Lancer

Il faut un **dev build** (pas Expo Go) car on utilise des modules natifs
(secure-store, get-random-values) :

```bash
# Android (SDK Android installé)
npx expo run:android

# iOS (macOS + Xcode)
npx expo run:ios
```

Puis `npx expo start` pour le rechargement à chaud.

## 4. Ce qui marche / ce qui est encore stubbé

| Écran / brique | État |
|----------------|------|
| Onboarding (créer / importer) | Fonctionnel : seed BIP-39 via le moteur testé |
| Sauvegarde de seed | 12 mots + **anti-capture d'écran** (expo-screen-capture) |
| Vérification de backup | **Fonctionnelle** via `createBackupChallenge` (moteur testé) |
| Code PIN | **Fait** : choix + confirmation, politique de robustesse (moteur testé) |
| Chiffrement de la seed | **Fait** : AES-256-GCM, clé dérivée du PIN via scrypt (moteur testé) |
| Biométrie | **Fait** : déverrouillage Face ID / empreinte (expo-local-authentication) |
| Anti-brute-force | **Fait** : verrouillage progressif après 5 échecs (moteur testé) |
| Déverrouillage | Écran unlock : biométrie auto + PIN de secours |
| Accueil | Adresse + solde réel via RPC Sepolia (pull-to-refresh) |
| Recevoir | Adresse + **QR code** + copie |
| Envoyer | Validation + confirmation + **signature/broadcast réels** (PIN requis pour signer) |

### Détail sécurité (device)
- La seed est chiffrée (AES-GCM + PIN) dans un **coffre** stocké dans SecureStore (Keychain/Keystore).
- Une copie optionnelle protégée par la **biométrie de l'OS** permet le déverrouillage rapide.
- L'adresse **publique** est stockée à part pour afficher le solde même verrouillé.
- La seed/clé n'est **jamais** dans le state global : elle est déchiffrée à la volée, uniquement le temps de signer.

## 4bis. Activer l'historique des transactions (clé Etherscan)

L'historient utilise l'API Etherscan V2 (une seule clé pour toutes les chaînes EVM).

1. `cp .env.example .env`
2. Édite `.env` et colle ta clé :
   ```
   EXPO_PUBLIC_ETHERSCAN_KEY=TA_CLE_ICI
   ```
   (`.env` est gitignoré — ta clé n'est jamais committée.)
3. Relance le serveur en vidant le cache pour que la variable soit prise en compte :
   ```bash
   npx expo start -c
   ```

Sans clé, l'écran Historique reste simplement vide (aucun blocage).

## 5. Ce qui reste (durcissement)

1. **Persister les compteurs anti-brute-force** hors mémoire (survivre au redémarrage de l'app).
2. **Auto-lock** au passage en arrière-plan + écran de garde (blur) dans l'app switcher.
3. **Détection root/jailbreak** (roadmap phase 5).
4. **Wallet caché** (2e PIN) — cf. `docs/07-DIFFERENCIATION.md`.
