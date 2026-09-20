# Bot Telegram Kalyx (Cloudflare Worker)

Point d'entrée vers la Mini App et copilote on-chain dans Telegram. **Il ne
touche jamais aux clés** : il ne détient que le jeton du bot et, en base, des
identifiants Telegram + des adresses publiques. Toute action (envoyer, swap)
se fait dans la Mini App, signée sur le téléphone.

## Commandes
| Commande | Rôle |
|---|---|
| `/start` | Premier lancement : choix de la langue (15 langues, boutons) puis accueil + bouton Mini App + installer l'app |
| `/lang` | Changer de langue (mémorisée en D1) |
| `/app` (`/wallet`) | Ouvre `app.kalyxwallet.com` dans Telegram (bouton `web_app`) |
| `/site` (`/web`) | Site officiel, téléchargement Android, support |
| `/price eth` | Cours CoinGecko (cache 60 s) |
| `/gas` | Gas Ethereum / Base / Arbitrum / Polygon / BNB + priorité Solana (cache 30 s) |
| `/scan 0x…` | Rapport GoPlus : honeypot, taxes, droits du owner |
| `/watch 0x… [libellé]` · `/unwatch` | Suivi d'adresse (10 max) → message à chaque transaction (webhook Alchemy) |
| `/alert eth 3000` · `/alerts` | Alerte de prix (cron 5 min) |
| `/help` | Modèle non-custodial, ce que le bot ne demande jamais |

Réponses dans les 15 langues de l'app (fr, en, es, pt, de, it, nl, pl, tr, ru, ar, hi, zh, ja, ko) : langue choisie au `/start`, sinon celle de Telegram, sinon anglais.

## Sécurité
- Webhook Telegram authentifié par `X-Telegram-Bot-Api-Secret-Token` (comparaison à temps constant).
- Webhook Alchemy authentifié par HMAC-SHA256 (`X-Alchemy-Signature`) ; route fermée sans clé.
- Messages en `parse_mode: HTML` avec échappement systématique (jamais de Markdown : une adresse ou un pseudo ne peut pas injecter de formatage).
- Limitation de débit par utilisateur (KV), 5 scans / minute.
- Dédoublonnage des transactions notifiées (rejeu de webhook).
- Aucune donnée sensible en base (voir `schema.sql`).

## Déploiement
```bash
cd bot && npm install
wrangler login
wrangler d1 create kalyx-bot          # → coller database_id dans wrangler.toml
wrangler kv namespace create CACHE    # → coller id dans wrangler.toml
npm run db:init
wrangler secret put BOT_TOKEN         # jeton donné par @BotFather
wrangler secret put WEBHOOK_SECRET    # chaîne aléatoire longue (openssl rand -hex 32)
wrangler secret put ALCHEMY_SIGNING_KEY   # optionnel : Alchemy Notify → webhook « Address Activity » → signing key
npm run deploy
BOT_TOKEN=… WEBHOOK_SECRET=… WORKER_URL=https://kalyx-telegram-bot.<compte>.workers.dev bash scripts/setup.sh
```

Chez **@BotFather** : `/newbot`, puis `/setdomain` → `app.kalyxwallet.com` (nécessaire pour les boutons `web_app`), et une description courte. Le bouton Menu est posé par `setup.sh`.

### Suivi d'adresses (Alchemy)
Créer un webhook Alchemy Notify de type *Address Activity* par réseau, URL
`https://<worker>/webhooks/alchemy`, et y ajouter les adresses suivies (l'API
Alchemy `PATCH /update-webhook-addresses` peut être appelée depuis `/watch` si
vous ajoutez `ALCHEMY_NOTIFY_TOKEN` ; non fait dans cette v1 pour garder le
Worker sans secret Alchemy côté écriture).

## Développement
`npm run dev` (wrangler dev) puis exposer avec `cloudflared tunnel` pour tester le webhook.
`npm run typecheck`.
