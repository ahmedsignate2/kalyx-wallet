export interface Env {
  BOT_TOKEN: string;
  /** Valeur passée à setWebhook(secret_token) : chaque requête Telegram doit la porter. */
  WEBHOOK_SECRET: string;
  WEB_APP_URL: string;
  SITE_URL: string;
  DOWNLOAD_URL: string;
  SUPPORT_URL: string;
  DB: D1Database;
  CACHE: KVNamespace;
  /** Limiteurs de débit Cloudflare (wrangler.toml) : aucun stockage consommé. Absents en local. */
  USER_LIMIT?: RateLimiter;
  SCAN_LIMIT?: RateLimiter;
  SCAN_GLOBAL?: RateLimiter;
}

/** Liaison « ratelimit » des Workers : `limit()` répond `success: false` au-delà du quota de la fenêtre. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Échappe le texte pour parse_mode HTML — on n'utilise JAMAIS Markdown : une
 *  adresse, un nom de token ou un pseudo contenant `*` ou `_` casserait le
 *  message (et pourrait injecter du formatage). */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function short(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export const isEvm = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);
export const isSolana = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
export const isBitcoin = (a: string) => /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a);
export function familyOf(a: string): 'evm' | 'solana' | 'bitcoin' | null {
  if (isEvm(a)) return 'evm';
  if (isBitcoin(a)) return 'bitcoin';
  if (isSolana(a)) return 'solana';
  return null;
}

/**
 * Limitation de débit : `true` si la clé a dépassé son quota.
 *
 * Le limiteur intégré de Cloudflare ne consomme rien. L'ancien compteur en KV
 * écrivait à chaque message, et le KV gratuit n'accepte que 1 000 écritures
 * par jour pour tout le compte : au-delà, le bot ne répondait plus. Le KV ne
 * sert plus que de repli (développement local, liaison absente).
 *
 * En cas de panne du limiteur, on laisse passer : mieux vaut un bot qui répond
 * qu'un bot muet. Les services appelés ont leurs propres limites et le cache.
 */
export async function rateLimited(env: Env, limiter: RateLimiter | undefined, key: string, max: number, windowSec: number): Promise<boolean> {
  if (limiter) {
    try {
      return !(await limiter.limit({ key })).success;
    } catch {
      return false;
    }
  }
  try {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const cur = Number((await env.CACHE.get(k)) ?? '0');
    if (cur >= max) return true;
    await env.CACHE.put(k, String(cur + 1), { expirationTtl: Math.max(60, windowSec + 5) });
  } catch {
    /* KV indisponible ou quota atteint : on laisse passer */
  }
  return false;
}

/** Lecture du cache : `null` si absent ou si le KV est indisponible. */
export async function cacheGet(env: Env, key: string): Promise<string | null> {
  try {
    return await env.CACHE.get(key);
  } catch {
    return null;
  }
}

/** Écriture du cache, sans jamais faire échouer la commande (KV en panne ou quota du jour atteint). */
export async function cachePut(env: Env, key: string, value: string, ttlSec: number): Promise<void> {
  try {
    await env.CACHE.put(key, value, { expirationTtl: ttlSec });
  } catch {
    /* la réponse part quand même, simplement sans cache */
  }
}

/** fetch avec délai maximal (les API publiques peuvent pendre). */
export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // User-Agent explicite : plusieurs API publiques (CoinGecko, GoPlus) rejettent
    // ou limitent les requêtes anonymes venant des IP de datacenter.
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'KalyxBot/1.0 (+https://kalyxwallet.com)', ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}
