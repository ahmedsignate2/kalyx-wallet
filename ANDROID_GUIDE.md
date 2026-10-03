# 📱 Kalyx Wallet sur Android — guide

Trois façons d'avoir l'app sur un téléphone, de la plus simple à la plus technique :

| Je veux… | Chemin |
|---|---|
| **Utiliser / tester** la bêta | [1. Installer l'APK publié](#1-installer-lapk-publié) |
| **Développer** et voir mes changements | [2. Build de développement](#2-build-de-développement-local) |
| **Construire et publier** une version | [3. Builds EAS et releases](#3-builds-eas-et-releases) |

> L'app utilise des modules natifs (SecureStore, biométrie, anti-capture, caméra,
> crypto). **Expo Go ne suffit pas** : il faut un APK Kalyx (publié, ou construit
> par vous).

---

## 1. Installer l'APK publié

1. Sur le téléphone, ouvrez [kalyxwallet.com/download](https://kalyxwallet.com/download)
   (dernière release de [kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release/releases/latest)).
2. Autorisez « Installer des applis inconnues » pour le navigateur quand Android le demande.
3. Facultatif mais recommandé — vérifiez le fichier avant de l'installer :
   ```bash
   sha256sum -c kalyx-wallet.apk.sha256
   ```

Il n'y a **pas de mise à jour à distance** : une nouvelle version = un nouvel APK
à installer par-dessus (les portefeuilles sont conservés).

---

## 2. Build de développement (local)

### Prérequis
- **Node.js 20** et npm.
- **Android Studio** (SDK Android, Gradle, émulateur) → https://developer.android.com/studio
- `ANDROID_HOME` défini (Android Studio l'affiche dans SDK Manager) :
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```
- Un émulateur (Device Manager → Create device) **ou** un téléphone en
  **débogage USB** (Réglages → À propos → 7 appuis sur « Numéro de build », puis
  Options développeur → Débogage USB).

### Lancer

```bash
npm ci
cp .env.example .env          # renseigner au minimum ALCHEMY, WALLETCONNECT_ID
npx expo run:android          # compile, installe et démarre l'app
```

Ensuite, pour recharger le JavaScript sans recompiler :

```bash
npm start
```

Il ne faut **recompiler** (`npx expo run:android`) qu'après un changement natif :
nouvelle dépendance native, `app.config.ts`, plugin Expo.

### Tester sans risque : les réseaux de test

1. Créez un portefeuille (Bienvenue → Créer), notez et vérifiez la phrase, choisissez un PIN.
2. Réseaux → **Afficher les réseaux de test**.
3. Récupérez des jetons sur un faucet (Sepolia, Base Sepolia, Solana Devnet, TON Testnet).
4. L'accueil affiche une section **Réseaux de test** (sans valeur, hors du total) ;
   Envoyer propose un onglet **Testnet**.

---

## 3. Builds EAS et releases

Les builds de distribution se font **sur EAS** (serveurs Expo), pas en local.

### Profils (`eas.json`)

| Profil | Sortie | Version | Usage |
|---|---|---|---|
| `preview` | APK | 0.1.0 | Testeurs |
| `production-apk` | APK | 1.0.0 | Release publique |
| `production` | AAB | 1.0.0 | Play Store |

Les clés d'API (`EXPO_PUBLIC_*`) viennent des **variables d'environnement EAS**
(expo.dev → projet → Environment variables), environnement `preview` ou `production`.

### Publier une release (automatique)

Le workflow [`.eas/workflows/release-production.yml`](.eas/workflows/release-production.yml)
construit l'APK `production-apk` puis, **dès la fin du build**, le publie sur
[kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release)
(`kalyx-wallet.apk` + `kalyx-wallet.apk.sha256`).

```bash
git push origin main:release                         # déclenche le workflow
# ou, à la main :
npx eas-cli workflow:run release-production.yml
```

Pré-requis (une fois) sur expo.dev :
- **Project settings → GitHub** : relier `ahmedsignate2/kalyx-wallet` ;
- **Environment variables → production** : `GH_RELEASE_TOKEN` (visibilité *Secret*),
  jeton GitHub *fine-grained* limité à `kalyx-wallet-release`, permission
  **Contents: Read and write**.

La release est marquée comme la dernière : [kalyxwallet.com/download](https://kalyxwallet.com/download)
la sert immédiatement.

### Bêta ou stable

`EXPO_PUBLIC_APP_STAGE` (dans `eas.json`) vaut **`beta`** en production pendant la
bêta ouverte : badge Bêta et avertissement à l'accueil. Pour la sortie définitive,
le passer à `stable`.

### Build manuel (sans publication)

```bash
npx eas-cli login
npx eas-cli build --profile production-apk --platform android
```

EAS donne un lien de téléchargement de l'APK à la fin.

---

## 4. Dépannage

| Symptôme | Piste |
|---|---|
| `expo run:android` : « SDK location not found » | `ANDROID_HOME` non défini (voir §2). |
| Écran blanc au démarrage | `npm start -c` (vider le cache Metro). `index.js` doit importer `./polyfills` en premier (c'est le cas). |
| Soldes ou historique vides | Clés manquantes dans `.env` (Alchemy, Etherscan, Helius) — l'app reste utilisable, ces écrans restent vides. |
| Biométrie absente | Normal sur un émulateur sans empreinte : utiliser le PIN. |
| Workflow EAS : « An Expo user account is required » | Lancer depuis expo.dev (dépôt relié) ou se connecter avec `npx eas-cli login`. |
| Publication : `GH_RELEASE_TOKEN manquant` / HTTP 401-403 | Variable absente de l'environnement `production`, ou jeton sans droit d'écriture sur `kalyx-wallet-release`. |
| Publication : HTTP 422 | Cette version (`v<version>-<build>`) est déjà publiée. |
