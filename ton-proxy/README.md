# kalyx-ton-proxy

Proxy Cloudflare Worker vers **TonAPI** pour Kalyx. La clé TonAPI reste ici, côté
serveur — jamais dans l'app, où elle serait partagée par tous les utilisateurs.

```
GET/POST https://<worker>/<mainnet|testnet>/v2/…   → TonAPI (liste blanche)
GET      https://<worker>/health                    → { ok: true }
```

## Sécurité
- **Liste blanche** (`src/routes.ts`) : 10 routes, celles dont l'app a besoin, relevées
  sur TonAPI. Tout le reste → 404. Paramètres inconnus ou hors bornes → 400. Ce
  n'est pas un proxy ouvert : la clé ne peut pas servir à autre chose.
- **POST** : `{ boc }` seul, re-sérialisé, 64 Ko maximum.
- **Débit** par IP (limiteurs Cloudflare) : lectures 30 / 10 s, envois 10 / 60 s.
- **Cache** à la périphérie : cours 60 s, métadonnées de jeton 300 s, état /
  jetons / historique d'une adresse 10 s. **Jamais** le seqno (un seqno périmé
  fait refuser l'envoi suivant), ni le suivi d'une transaction, ni les envois.
- **Quota TonAPI** : il est global à la clé (1 requête/s en gratuit). Une lecture
  en 429 est retentée une fois ; une **diffusion** en 429 ou en panne part par
  TON Center — même BOC, aucun échec visible. Pour un vrai trafic : plan Lite.
- **Origines web** autorisées dans `wrangler.toml` ; l'app native n'envoie pas d'Origin.
- **Aucun journal** : ni adresse, ni message, ni IP. Aucun en-tête TonAPI relayé.

## Déploiement
```bash
cd ton-proxy
npm install
npx wrangler login                 # une fois
npx wrangler secret put TONAPI_KEY # colle la clé TonAPI (jamais dans un fichier)
npx wrangler deploy
curl https://kalyx-ton-proxy.<ton-sous-domaine>.workers.dev/health
```

## Tests
```bash
npm test        # liste blanche et corps POST (node --test)
npm run typecheck
```

## Achat de crypto (MoonPay)

Le même worker signe les URL du widget MoonPay : la **clé secrète** reste ici.

```
GET  /moonpay/currencies                → devises et actifs (cache 1 h)
GET  /moonpay/quote?currencyCode=eth&baseCurrencyCode=eur&baseCurrencyAmount=100
POST /moonpay/url  { currencyCode, walletAddress, baseCurrencyCode, baseCurrencyAmount, paymentMethod, theme }
                                         → { url } signée
```
- Le worker **construit** l'URL (liste fermée de paramètres validés) : ce n'est pas un signeur ouvert.
- URL liée à l'IP de l'appareil (`allowedIpAddress`, obligatoire chez MoonPay pour la production).
- Aucun paramètre de commission : Kalyx n'ajoute aucun frais.
- Signature vérifiée contre le vecteur de test officiel (`src/moonpay.test.ts`).

### Mode test (bac à sable)
```bash
# 1. wrangler.toml : MOONPAY_ENV = "sandbox" et MOONPAY_PUBLISHABLE_KEY = "pk_test_…"
# 2. la clé secrète de test, jamais dans un fichier :
npx wrangler secret put MOONPAY_SECRET_KEY      # sk_test_…
npx wrangler deploy
curl https://kalyx-ton-proxy.<ton-sous-domaine>.workers.dev/moonpay/currencies | head -c 300
```
Cartes de test : https://dev.moonpay.com/widget/sandbox-testing — jamais hors du bac à sable.

### Production
`MOONPAY_ENV = "production"`, `pk_live_…`, `wrangler secret put MOONPAY_SECRET_KEY` (sk_live_…).
Une clé de test avec `production` (ou l'inverse) est refusée net.
Ajouter `kalyxwallet.com` aux domaines autorisés du tableau de bord MoonPay.

## Relais RPC (Alchemy, Helius) — aucune clé dans l'app ni l'extension

```
POST /rpc/alchemy/<réseau>   → Alchemy (JSON-RPC, méthodes en liste blanche, lots ≤ 25)
POST /rpc/helius             → Helius (Solana, méthodes en liste blanche)
POST /v1/erc20  { address, chains: [réseaux] } → tokens ERC-20 de TOUS les réseaux en une requête
```

**Économie du quota**, pour rester dans les plans gratuits :
- **Une requête pour tous les réseaux** (`/v1/erc20`) au lieu d'une par réseau ; réponse gardée 30 s.
- **Cache à la périphérie** : métadonnées de token 1 jour (communes à tout le monde).
- **Quota mémorisé** : si Alchemy ou Helius répond « quota » (429, capacité mensuelle),
  le Worker le retient (1 min pour un débit, 1 h pour une capacité épuisée) et répond
  aussitôt `503 { error: "quota" }` avec `retry-after`, sans rappeler le fournisseur.
- **Côté clients** : sur ce 503, ou si le Worker lui-même dépasse son quota, l'app et
  l'extension se mettent en pause sur le relais et passent à leurs replis GRATUITS
  (nœuds publics, tokens principaux lus directement). Rien ne casse.
- Les appels qui ne demandent pas de clé (soldes natifs, prix DefiLlama…) ne passent
  PAS par le relais : ils partent directement de l'appareil, sans compter dans le quota.

```bash
npx wrangler secret put ALCHEMY_KEY   # clé Alchemy
npx wrangler secret put HELIUS_KEY    # clé Helius
npx wrangler deploy
```
`ALLOWED_EXTENSIONS` (wrangler.toml) : `*` pendant la bêta, puis l'identifiant du store.
