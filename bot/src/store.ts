/** Accès D1 — uniquement des identifiants Telegram et des adresses publiques. */
import type { Env } from './env';

export interface TrackedWallet { id: number; telegram_id: number; family: string; address: string; label: string | null }
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

export async function listWatched(env: Env, telegramId: number): Promise<TrackedWallet[]> {
  const r = await env.DB.prepare('SELECT * FROM tracked_wallets WHERE telegram_id = ? ORDER BY created_at').bind(telegramId).all<TrackedWallet>();
  return r.results;
}

export async function addWatched(env: Env, telegramId: number, family: string, address: string, label: string | null): Promise<'ok' | 'exists' | 'limit'> {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM tracked_wallets WHERE telegram_id = ?').bind(telegramId).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) return 'limit';
  try {
    await env.DB.prepare('INSERT INTO tracked_wallets (telegram_id, family, address, label) VALUES (?, ?, ?, ?)').bind(telegramId, family, address, label).run();
    return 'ok';
  } catch {
    return 'exists';
  }
}

export async function removeWatched(env: Env, telegramId: number, address: string): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM tracked_wallets WHERE telegram_id = ? AND address = ?').bind(telegramId, address).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function subscribersOf(env: Env, address: string): Promise<TrackedWallet[]> {
  const r = await env.DB.prepare('SELECT * FROM tracked_wallets WHERE address = ?').bind(address).all<TrackedWallet>();
  return r.results;
}

/** Vrai si le hash n'avait jamais été vu (et le marque). Rejeu de webhook → false. */
export async function markTxSeen(env: Env, hash: string): Promise<boolean> {
  try {
    await env.DB.prepare('INSERT INTO seen_tx (hash) VALUES (?)').bind(hash).run();
    return true;
  } catch {
    return false;
  }
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

/** Ménage : hashs vus de plus de 7 jours. */
export async function pruneSeen(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM seen_tx WHERE seen_at < unixepoch() - 7 * 86400').run();
}
