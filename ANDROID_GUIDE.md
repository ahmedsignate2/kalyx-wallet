# 📱 Lancer Kalyx Wallet sur Android — guide simple

> Objectif : voir l'app tourner sur ton téléphone et tester le flux complet
> **welcome → seed → backup → PIN → home → receive/send** sur Sepolia.
>
> ⚠️ Cette app utilise des modules natifs (SecureStore, biométrie, anti-capture,
> crypto). **Expo Go ne suffit pas** : il faut un **dev build** (une app de dev
> installée sur le téléphone). Deux chemins possibles ci-dessous — choisis selon
> ce que tu as.

---

## 0. Prérequis communs

- **Node.js 18+** et npm (déjà le cas ici : Node 20).
- Un **compte Expo** gratuit → https://expo.dev/signup (nécessaire pour le dev build cloud).
- Ton **téléphone Android** avec le **mode développeur** activé :
  Réglages → À propos → appuie 7× sur « Numéro de build » → puis
  Réglages → Options développeur → active **Débogage USB**.

---

## 1. Installer les dépendances (une seule fois)

Depuis `/root/crypto-wallet` :

```bash
npm install

# Ajoute Expo, puis laisse Expo choisir les versions compatibles des modules :
npx expo install expo react react-native react-dom \
  expo-router expo-status-bar expo-constants expo-linking \
  react-native-safe-area-context react-native-screens \
  expo-secure-store expo-local-authentication expo-screen-capture \
  expo-linear-gradient expo-clipboard \
  react-native-qrcode-svg react-native-svg \
  react-native-get-random-values

npm install zustand

# Aligne toutes les versions sur le SDK Expo installé (corrige les écarts) :
npx expo install --fix
```

> `expo install` (au lieu de `npm install`) est important : il pose les
> **versions compatibles** avec ton SDK Expo. `--fix` corrige tout écart restant.

---

## 2. Deux chemins pour lancer

### 🟢 Chemin A — tu as (ou peux installer) Android Studio

C'est le plus direct si tu es sur un PC/Mac.

1. Installe **Android Studio** → https://developer.android.com/studio
   (il fournit le SDK Android, un émulateur, et Gradle).
2. Ouvre-le une fois, laisse-le installer le **SDK** + crée un **émulateur**
   (Device Manager → Create device), OU branche ton téléphone en USB.
3. Vérifie la variable d'env `ANDROID_HOME` (Android Studio l'affiche dans
   SDK Manager). Sur Linux/macOS, ajoute à ton shell :
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
4. Lance :
   ```bash
   npx expo run:android
   ```
   → compile un **dev build**, l'installe sur l'émulateur/téléphone, et démarre.

Ensuite, pour recharger le code sans recompiler :
```bash
npm start        # = expo start --dev-client
```

### 🔵 Chemin B — PAS d'Android Studio / tu es sur Termux ou Linux minimal

Ici on **ne compile pas en local** (Termux/Linux léger ne sont pas adaptés pour
builder un APK Android — il faut le SDK Android + Gradle + JDK, lourd et pénible).
On utilise le **build cloud EAS** : Expo compile l'APK pour toi, tu l'installes
sur ton téléphone.

1. Installe l'outil EAS et connecte-toi :
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Lance le build **development** (dev client) dans le cloud :
   ```bash
   eas build --profile development --platform android
   ```
   (le profil `development` est déjà défini dans `eas.json`.)
3. À la fin, EAS te donne un **lien**. Ouvre-le sur ton téléphone et
   **installe l'APK** (autorise « installer depuis cette source »).
4. Démarre le serveur de dev et connecte le téléphone :
   ```bash
   npm start -- --tunnel
   ```
   Ouvre l'app **Kalyx Wallet (dev)** installée, elle se connecte au serveur
   (le `--tunnel` évite les soucis de même réseau Wi-Fi).

> 💡 Sur **Termux** : garde Termux pour lancer `npm start -- --tunnel`. Le build
> lui-même se fait dans le cloud (EAS), donc pas besoin d'Android SDK local.

---

## 3. Tester le flux complet (checklist)

Une fois l'app ouverte :

1. **Welcome** → « Créer un wallet ».
2. **Backup** → tes **12 mots** s'affichent. Sur Android, la **capture d'écran
   est bloquée** (normal). Écris-les sur papier → « J'ai noté ma phrase ».
3. **Verify** → sélectionne les **3 mots** demandés aux bonnes positions.
4. **Set-PIN** → choisis un PIN (min 6 chiffres, évite 123456/000000),
   confirme-le. Active la **biométrie** si proposée.
5. **Home** → tu vois ton **adresse** et le **solde Sepolia** (0 au début).
   - Copie ton adresse (tap dessus).
   - Va sur un **faucet Sepolia** (ex. https://sepoliafaucet.com ou
     https://www.alchemy.com/faucets/ethereum-sepolia), colle ton adresse,
     reçois des ETH de test.
   - Reviens et **tire vers le bas** (pull-to-refresh) → le solde se met à jour.
6. **Receive** → vérifie le **QR code** + copie de l'adresse.
7. **Send** → colle une adresse (tu peux t'envoyer à toi-même), un petit montant,
   ton **PIN**, puis confirme. Tu obtiens un **hash de transaction**.
8. **Verrouillage** → ferme complètement l'app et rouvre-la → l'écran
   **Unlock** demande la **biométrie**, sinon le **PIN**.

Si tout ça marche, le rez-de-chaussée existe : on pourra monter Bitcoin. 🙂

---

## 4. Dépannage rapide

| Symptôme | Cause probable / solution |
|----------|---------------------------|
| `expo run:android` : « SDK location not found » | `ANDROID_HOME` non défini → voir chemin A, étape 3. |
| Écran blanc au démarrage | Vérifie que `index.js` importe bien `./polyfills` en premier (déjà le cas). Relance `npm start -c` (cache vidé). |
| « crypto.getRandomValues not supported » | `react-native-get-random-values` non installé → refais l'étape 1. |
| Le solde ne s'affiche pas | RPC public Sepolia lent → réessaie, ou mets une clé Alchemy dans `src/domain/chains/configs.ts`. |
| Biométrie absente | Normal sur émulateur sans empreinte configurée → utilise le PIN. |
| Build EAS échoue | Vérifie que tu es bien loggé (`eas whoami`) et que `app.config.ts` a bien un `android.package` (c'est le cas : `com.kalyx.wallet`). |

---

## 5. Important

- On teste **sur Sepolia (testnet)** : les fonds n'ont **aucune valeur réelle**,
  zéro risque. Ne mets jamais de vrais fonds avant l'audit (cf. `SECURITY.md`).
- La couche moteur (`src/`) est déjà **testée** (54 tests). Ce guide sert à
  vérifier la **couche UI** sur un vrai appareil — c'est là que les problèmes
  d'ergonomie apparaissent.
