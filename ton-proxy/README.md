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
- **Débit** : 60 requêtes / 60 s par IP et par méthode (limiteur Cloudflare).
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
