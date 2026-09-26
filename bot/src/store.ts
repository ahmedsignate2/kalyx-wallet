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






/**
 * Plafond d'alertes ouvertes par personne.
 *
 * Il n'y en avait AUCUN. Rien n'empêchait d'en créer des milliers, et le cron les
 * relit toutes les cinq minutes : une seule personne pouvait donc faire grossir
 * indéfiniment le travail périodique et la consommation d'API partagée. Vingt
 * couvre tout usage réel.
 */
export const MAX_ALERTS_PER_USER = 20;

/** Nombre d'alertes ouvertes d'une personne. */
export async function countAlerts(env: Env, telegramId: number): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM price_alerts WHERE telegram_id = ? AND triggered = 0')
    .bind(telegramId).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function addAlert(env: Env, telegramId: number, coin: string, symbol: string, target: number, direction: 'above' | 'below', fiat: string): Promise<void> {
  await env.DB.prepare('INSERT INTO price_alerts (telegram_id, coin, symbol, target, direction, fiat) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(telegramId, coin, symbol, target, direction, fiat).run();
}

/**
 * Supprime une alerte, par son numéro dans la liste de CETTE personne.
 *
 * On ne pouvait pas en supprimer : `/alerts` les listait, et c'était tout. Qui en
 * avait posé dix les gardait jusqu'à leur déclenchement.
 *
 * Le `telegram_id` est dans la clause WHERE, et ce n'est pas décoratif : sans lui,
 * n'importe qui pourrait supprimer l'alerte de quelqu'un d'autre en devinant un
 * identifiant.
 */
export async function removeAlert(env: Env, telegramId: number, id: number): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM price_alerts WHERE id = ? AND telegram_id = ? AND triggered = 0')
    .bind(id, telegramId).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Supprime toutes les alertes ouvertes d'une personne. */
export async function removeAllAlerts(env: Env, telegramId: number): Promise<number> {
  const r = await env.DB.prepare('DELETE FROM price_alerts WHERE telegram_id = ? AND triggered = 0')
    .bind(telegramId).run();
  return r.meta?.changes ?? 0;
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

