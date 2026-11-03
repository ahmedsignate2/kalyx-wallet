# Bot Telegram Kalyx (Cloudflare Worker)

Point d'entrée vers la Mini App et copilote marché dans Telegram. **Il ne
touche jamais aux clés** : il ne détient que le jeton du bot et, en base, des
identifiants Telegram, leur langue et leurs alertes de prix. Toute action (envoyer, swap)
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
| `/alert eth 3000` | Pose une alerte de prix (cron 5 min). Plafond : 20 alertes ouvertes par personne |
| `/alerts` (`/unalert`) | Liste les alertes, un bouton par alerte pour la supprimer (+ « tout supprimer ») |
| `/help` | Modèle non-custodial, ce que le bot ne demande jamais |

Réponses dans les 15 langues de l'app (fr, en, es, pt, de, it, nl, pl, tr, ru, ar, hi, zh, ja, ko) : langue choisie au `/start`, sinon celle de Telegram, sinon anglais.

## Sécurité
- Webhook Telegram authentifié par `X-Telegram-Bot-Api-Secret-Token` (comparaison à temps constant).
- Messages en `parse_mode: HTML` avec échappement systématique (jamais de Markdown : une adresse ou un pseudo ne peut pas injecter de formatage).
- Limitation de débit par les limiteurs intégrés de Cloudflare (`wrangler.toml`, sans écriture KV) : 20 messages / minute par personne, 5 scans / minute par personne, 30 scans / minute pour tout le bot (GoPlus public).
- Aucune clé d'API : prix, gas et scans passent par des services publics gratuits (CoinGecko, DefiLlama, Binance, RPC publicnode et Solana, GoPlus), avec 60 s de cache. Rien à épuiser ni à facturer.
- KV ou limiteur indisponible (panne, quota gratuit de 1 000 écritures / jour atteint) : le bot continue de répondre, sans cache.
- Suppression d'alerte autorisée par le `telegram_id` dans le `WHERE` : un identifiant deviné ne donne accès à rien.
- 20 alertes ouvertes au maximum par personne : le cron relit toutes les alertes toutes les 5 minutes.
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
npm run deploy
BOT_TOKEN=… WEBHOOK_SECRET=… WORKER_URL=https://kalyx-telegram-bot.<compte>.workers.dev bash scripts/setup.sh
```

Chez **@BotFather** : `/newbot`, puis `/setdomain` → `app.kalyxwallet.com` (nécessaire pour les boutons `web_app`), et une description courte. Le bouton Menu est posé par `setup.sh`.

## Développement
`npm run dev` (wrangler dev) puis exposer avec `cloudflared tunnel` pour tester le webhook.
`npm run typecheck`.
