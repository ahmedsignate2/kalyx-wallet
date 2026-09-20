#!/usr/bin/env bash
# Configure le bot côté Telegram après `wrangler deploy` :
#   webhook (avec secret), liste des commandes (FR + EN), bouton Menu → Mini App.
# Usage : BOT_TOKEN=123:abc WEBHOOK_SECRET=... WORKER_URL=https://kalyx-telegram-bot.<compte>.workers.dev bash scripts/setup.sh
set -euo pipefail
: "${BOT_TOKEN:?BOT_TOKEN manquant}"
: "${WEBHOOK_SECRET:?WEBHOOK_SECRET manquant (le même que `wrangler secret put WEBHOOK_SECRET`)}"
: "${WORKER_URL:?WORKER_URL manquant}"
WEB_APP_URL="${WEB_APP_URL:-https://app.kalyxwallet.com}"
API="https://api.telegram.org/bot${BOT_TOKEN}"

echo "→ setWebhook"
curl -sS -X POST "$API/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${WORKER_URL}/telegram\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
echo

echo "→ setMyCommands (défaut = anglais)"
curl -sS -X POST "$API/setMyCommands" -H 'content-type: application/json' -d '{"commands":[
 {"command":"app","description":"Open the Kalyx Mini App"},
 {"command":"price","description":"Live price — /price eth"},
 {"command":"gas","description":"Network fees right now"},
 {"command":"scan","description":"Honeypot / scam check — /scan 0x…"},
 {"command":"alert","description":"Price alert — /alert eth 3000"},
 {"command":"site","description":"Official site and Android app"},
 {"command":"lang","description":"Change language"},
 {"command":"help","description":"How Kalyx keeps your keys safe"}
]}'
echo

echo "→ setMyCommands (fr)"
curl -sS -X POST "$API/setMyCommands" -H 'content-type: application/json' -d '{"language_code":"fr","commands":[
 {"command":"app","description":"Ouvrir la Mini App Kalyx"},
 {"command":"price","description":"Cours en direct — /price eth"},
 {"command":"gas","description":"Frais réseau en ce moment"},
 {"command":"scan","description":"Détection honeypot / arnaque — /scan 0x…"},
 {"command":"alert","description":"Alerte de prix — /alert eth 3000"},
 {"command":"site","description":"Site officiel et app Android"},
 {"command":"lang","description":"Changer de langue"},
 {"command":"help","description":"Comment Kalyx protège tes clés"}
]}'
echo

echo "→ setChatMenuButton (bouton permanent → Mini App)"
curl -sS -X POST "$API/setChatMenuButton" -H 'content-type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Kalyx\",\"web_app\":{\"url\":\"${WEB_APP_URL}\"}}}"
echo

echo "→ getWebhookInfo"
curl -sS "$API/getWebhookInfo"
echo
