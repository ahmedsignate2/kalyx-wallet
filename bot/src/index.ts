/**
 * Bot Telegram Kalyx — Cloudflare Worker.
 *
 *  POST /telegram          webhook Telegram (secret_token vérifié)
 *  GET  /health            supervision
 *  cron (toutes les 5 min)  alertes de prix
 *
 * Le Worker ne détient que : le jeton du bot, et en base des identifiants
 * Telegram + leurs alertes de prix. Aucune clé de wallet,
 * jamais — même compromis, il ne peut rien signer.
 */
import { Bot, webhookCallback } from 'grammy';
import { createBot } from './bot';
import type { Env } from './env';
import { esc } from './env';
import { strings } from './i18n';
import { fmtFiat, getPrices } from './market';
import { markAlertTriggered, openAlerts, userLang } from './store';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: SECURITY_HEADERS });
    }

    if (url.pathname === '/telegram' && request.method === 'POST') {
      const secret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
      if (!env.WEBHOOK_SECRET || !timingSafeEqual(secret, env.WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403, headers: SECURITY_HEADERS });
      }
      const bot = createBot(env);
      // Telegram attend une réponse rapide : grammY répond 200 dès que la mise à jour est traitée.
      return webhookCallback(bot, 'cloudflare-mod', { timeoutMilliseconds: 25_000 })(request);
    }

    return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
  },

  /** Alertes de prix : un appel CoinGecko pour toutes les alertes ouvertes. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const alerts = await openAlerts(env);
      if (!alerts.length) return;
      const ids = [...new Set(alerts.map((a) => a.coin))];
      const prices = await getPrices(env, ids, 'usd').catch(() => ({} as Record<string, number>));
      const bot = new Bot(env.BOT_TOKEN);
      for (const a of alerts) {
        const p = prices[a.coin];
        if (p == null) continue;
        const hit = a.direction === 'above' ? p >= a.target : p <= a.target;
        if (!hit) continue;
        await markAlertTriggered(env, a.id);
        const lang = await userLang(env, a.telegram_id);
        const t = strings(lang);
        try {
          await bot.api.sendMessage(a.telegram_id, t.alertFired(esc(a.symbol), fmtFiat(p, a.fiat, lang), a.direction, fmtFiat(a.target, a.fiat, lang)), { parse_mode: 'HTML' });
        } catch {
          /* bot bloqué par l'utilisateur */
        }
      }
    })());
  },
};
