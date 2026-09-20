/** Accès D1 — uniquement des identifiants Telegram, leur langue et leurs alertes de prix. */
import type { Env } from './env';

export interface PriceAlert { id: number; telegram_id: number; coin: string; symbol: string; target: number; direction: 'above' | 'below'; fiat: string }

export async function upsertUser(env: Env, telegramId: number, lang: string): Promise<void> {
  await env.DB.prepare('INSERT INTO users (telegram_id, lang) VALUES (?, ?) ON CONFLICT(telegram_id) DO UPDATE SET lang = excluded.lang')
    .bind(telegramId, lang).run();
}

export async function userLangOrNull(env: Env, telegramId: number): Promise<string | null> {
  const r = await env.DB.prepare('SELECT lang FROM users WHERE telegram_id = ?').bind(telegramId).first<{ lang: string }>();
  return r?.lang ?? null;
}
export async function userLang(env: Env, telegramId: number): Promise<string> {
  return (await userLangOrNull(env, telegramId)) ?? 'en';
}






export async function addAlert(env: Env, telegramId: number, coin: string, symbol: string, target: number, direction: 'above' | 'below', fiat: string): Promise<void> {
  await env.DB.prepare('INSERT INTO price_alerts (telegram_id, coin, symbol, target, direction, fiat) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(telegramId, coin, symbol, target, direction, fiat).run();
}

export async function listAlerts(env: Env, telegramId: number): Promise<PriceAlert[]> {
  const r = await env.DB.prepare('SELECT * FROM price_alerts WHERE telegram_id = ? AND triggered = 0 ORDER BY created_at').bind(telegramId).all<PriceAlert>();
  return r.results;
}

export async function openAlerts(env: Env): Promise<PriceAlert[]> {
  const r = await env.DB.prepare('SELECT * FROM price_alerts WHERE triggered = 0 LIMIT 500').all<PriceAlert>();
  return r.results;
}

export async function markAlertTriggered(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE price_alerts SET triggered = 1 WHERE id = ?').bind(id).run();
}

