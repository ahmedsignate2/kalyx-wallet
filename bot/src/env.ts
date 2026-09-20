export interface Env {
  BOT_TOKEN: string;
  /** Valeur passée à setWebhook(secret_token) : chaque requête Telegram doit la porter. */
  WEBHOOK_SECRET: string;
  /** Clé de signature du webhook Alchemy (Notify → « Signing key »). Optionnel : sans elle, la route /webhooks/alchemy est fermée. */
  ALCHEMY_SIGNING_KEY?: string;
  WEB_APP_URL: string;
  SITE_URL: string;
  DOWNLOAD_URL: string;
  SUPPORT_URL: string;
  DB: D1Database;
  CACHE: KVNamespace;
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

/** Limitation de débit par utilisateur (KV) : `max` appels par fenêtre de `windowSec`. */
export async function rateLimited(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const cur = Number((await env.CACHE.get(k)) ?? '0');
  if (cur >= max) return true;
  await env.CACHE.put(k, String(cur + 1), { expirationTtl: Math.max(60, windowSec + 5) });
  return false;
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
