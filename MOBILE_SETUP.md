# Lancer Kalyx Wallet en local

Mise en route rapide pour développer. Pour Android en détail (émulateur, téléphone,
builds EAS, releases) : [ANDROID_GUIDE.md](ANDROID_GUIDE.md).

## 1. Installer

```bash
git clone https://github.com/ahmedsignate2/kalyx-wallet.git
cd kalyx-wallet
npm ci
cp .env.example .env
```

Toutes les dépendances (moteur, app, web) sont dans le `package.json` racine ;
`npm ci` suffit. Le site (`web/`), le bot (`bot/`) et le relais TON (`ton-proxy/`)
ont chacun leur propre `package.json`.

## 2. Clés d'API (`.env`)

L'app démarre sans aucune clé, mais certaines fonctions restent vides sans elles :

| Variable | Sans elle… |
|---|---|
| `EXPO_PUBLIC_ALCHEMY_KEY` | RPC publics plus lents ; pas de liste de jetons EVM ni de simulation |
| `EXPO_PUBLIC_ETHERSCAN_KEY` | Pas d'historique EVM |
| `EXPO_PUBLIC_HELIUS_KEY` | RPC Solana public (limité) |
| `EXPO_PUBLIC_WALLETCONNECT_ID` | Pas de WalletConnect ni de tableau de bord web |
| `EXPO_PUBLIC_LIFI_KEY` | Swap / bridge limités |
| `EXPO_PUBLIC_COINGECKO_KEY` | Cours soumis aux limites de l'API gratuite |

Après une modification de `.env`, relancer avec le cache vidé : `npx expo start -c`.

## 3. Lancer

```bash
npx expo run:android   # app native (Android Studio ou téléphone USB) — à refaire après un changement natif
npm start              # serveur Metro : recharge le JavaScript
npm run web            # tableau de bord web (app.kalyxwallet.com) en local
```

**Expo Go ne suffit pas** : l'app utilise des modules natifs (SecureStore,
biométrie, anti-capture, caméra).

## 4. Vérifier avant de pousser

```bash
npm run typecheck
npm test
node scripts/check-repo-files.mjs
node scripts/check-address-usage.mjs
```

C'est ce que la CI exécute à chaque push.

## 5. Repères dans le code

| Dossier | Contenu |
|---|---|
| `app/` | Écrans (Expo Router) |
| `ui/kit/` | Composants du design system |
| `ui/web/` | Tableau de bord web et mini-app Telegram |
| `lib/` | Stores, coffre chiffré, WalletConnect, TON Connect, earn, IA, i18n (15 langues dans `lib/i18n.ts`) |
| `src/` | Moteur sans React : crypto, adaptateurs de chaînes, transactions, swap, sécurité |

## 6. Sécurité côté appareil (rappel)

- La phrase est chiffrée (AES-256-GCM, clé dérivée du PIN par scrypt) dans un coffre
  stocké dans SecureStore (Keystore Android).
- Une copie facultative protégée par la **biométrie du système** permet le
  déverrouillage rapide.
- La phrase et les clés ne sont jamais dans l'état global : elles sont déchiffrées
  le temps de signer, puis effacées.
- Ne jamais logger, envoyer ou committer un secret (la CI le vérifie).
