# Lancer l'app Nova Wallet (Expo)

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
  expo-linear-gradient expo-clipboard expo-status-bar react-native react react-dom
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

| Écran | État |
|-------|------|
| Onboarding (créer / importer) | Fonctionnel : génère/valide une seed BIP-39 via le moteur testé |
| Sauvegarde de seed | Affichage des 12 mots + confirmation (protection anti-capture à brancher) |
| Stockage | Seed dans SecureStore (Keychain/Keystore). **TODO** : couche AES + PIN |
| Accueil | Adresse + solde réel via RPC Sepolia (pull-to-refresh) |
| Recevoir | Adresse + copie. **TODO** : QR code |
| Envoyer | Validation + confirmation + **signature/broadcast réels** (nécessite des ETH de test) |
| Verrouillage PIN / biométrie | **TODO** (prochaine étape sécurité) |

## 5. Prochaines étapes UI/sécurité

1. Écran de déverrouillage (PIN + biométrie via `expo-local-authentication`) + auto-lock.
2. Couche AES-GCM au-dessus de SecureStore (clé dérivée du PIN).
3. Protection anti-capture d'écran sur `backup` (expo-screen-capture).
4. QR code sur `receive` (react-native-qrcode-svg).
5. Écran de vérification de seed (le moteur `createBackupChallenge` est déjà prêt et testé).
