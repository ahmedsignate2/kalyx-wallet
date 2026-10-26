# Kalyx Wallet — extension de navigateur et tableau de bord web

Extension Manifest V3 pour Chromium (Chrome, Brave, Edge), construite avec WXT.
Elle réutilise le cœur de l'app (`../src` : dérivation des clés, coffre, réseaux,
adaptateurs EVM / Solana / Bitcoin / TON) ; seuls l'interface et les adaptateurs
de plateforme sont propres à l'extension.

Le même code sert aussi le **tableau de bord web** (`web/`, publié sur
app.kalyxwallet.com) : mêmes écrans, mais relié au téléphone et sans aucune clé.

```bash
cd extension
npm install          # dépendances de l'extension uniquement (pas celles de l'app)
npm run build        # → .output/chrome-mv3
npm run typecheck    # TypeScript strict
npm test             # tests unitaires (Vitest, faux navigateur)
npm run test:smoke   # charge l'extension dans Chromium et parcourt les écrans
npm run build:web    # tableau de bord web → .output/web (ou KALYX_WEB_OUT)
npm run test:web     # build de test du tableau de bord + parcours dans Chromium
npm run icons        # régénère les icônes depuis ../assets/icon.png
```

L'identifiant public WalletConnect est fourni au build par la variable
`WALLETCONNECT_ID` ; il n'est pas écrit dans le dépôt.

Charger en développement : `chrome://extensions` → « Mode développeur » →
« Charger l'extension non empaquetée » → `extension/.output/chrome-mv3`.

## Deux modes

- **Portefeuille autonome** : phrase créée ou importée dans l'extension,
  chiffrée dans un coffre local (scrypt étalonné selon l'appareil + AES-256-GCM),
  déverrouillé par mot de passe ou passkey.
- **Compagnon du téléphone** : l'extension se relie à l'app Kalyx par
  WalletConnect et ne détient aucune clé ; chaque signature est validée sur le
  téléphone. Un signe de vie régulier permet à l'app d'afficher l'état réel de
  la connexion (en ligne, silencieuse, expirée).

## Tableau de bord web (`web/`)

- `shim.ts` fournit l'API `browser` de l'extension au-dessus du stockage du
  navigateur ; `host.ts` branche les modules de l'extension en mode
  « téléphone seulement » (import ou création de phrase refusés).
- Liaison seule : QR, bouton « Ouvrir dans l'app » sur téléphone, lien à
  copier. Déconnexion automatique après 30 minutes d'inactivité.
- Le build écrit `_headers` (CSP stricte avec Trusted Types, HSTS…) et
  `.well-known/security.txt`.
- Copilote IA avec la clé de l'utilisateur (DeepSeek, OpenAI, Anthropic,
  Gemini…) : la clé reste dans le navigateur ; aucune adresse ni phrase de
  récupération n'est envoyée au fournisseur.

## Ce qui vient de l'app

Le calcul des soldes (`../lib/portfolio/holdings`) et le tri anti-spam de
l'historique (`../lib/historyTrust`) sont ceux de l'app, partagés tels quels.
Au build, quelques modules sont remplacés pour l'extension seulement
(`scripts/registryPlugin.ts`), entre autres :

- le registre des réseaux → `lib/chainRegistry.ts` ;
- le journal technique de l'app → `lib/noLog.ts` (l'extension ne garde aucun
  journal).

Aucune clé d'API n'est embarquée : les appels qui en demandent passent par le
relais Kalyx (Cloudflare). Les soldes natifs passent par des RPC publics.

## Pont vers les dApps

```
page (dApp) ── inpage.js (monde MAIN : EIP-1193 + EIP-6963, Wallet Standard)
                 │ window.postMessage (même origine, même fenêtre)
              relay.js (script isolé, page principale seulement) ── port ──►
              service worker : origine lue par CHROME, permissions par site,
              réseau par site, fenêtre d'approbation séparée (approval.html)
```

`inpage.js` est enregistré dynamiquement (`scripting`) : précédé de
`inpage-flag.js` quand « Kalyx par défaut » est activé (il prend alors aussi
`window.ethereum`). Rien n'est contacté tant qu'une page ne s'adresse pas à un
portefeuille. Les demandes de signature s'ouvrent dans la fenêtre
d'approbation, avec l'explication de la transaction et un score de risque.

## Interface

- `ui/picker.ts` : sélecteur Kalyx (réseaux, tokens, langues, devises…) qui
  remplace les `<select>` du navigateur : feuille avec logos, recherche et
  navigation au clavier.
- `ui/sheet.ts` : feuilles (bas d'écran sur mobile, fenêtre centrée à partir
  de 600 px de large).
- Textes : `ui/i18n.ts` (français, anglais) et `ui/locales/` (13 autres langues).

## Sécurité

Voir [SECURITY.md](../SECURITY.md) et la
[politique de divulgation](../docs/security/VDP.md).
