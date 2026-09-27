/**
 * Proxy TonAPI pour Kalyx (Cloudflare Worker).
 *
 * Décision du 26/09 : en production, TON passe par TonAPI, et la clé reste ICI,
 * côté serveur — jamais dans un `EXPO_PUBLIC_` que tous les utilisateurs
 * partageraient (et qui plafonnerait tout le monde au quota d'une seule clé).
 *
 *   GET/POST https://<worker>/<mainnet|testnet>/v2/…   → TonAPI, filtré
 *   GET      https://<worker>/health                    → « ok »
 *
 * Aucune donnée n'est journalisée : ni adresse, ni message, ni IP.
 */
import { MAX_BODY_BYTES, resolve, sanitizeBody, UPSTREAM } from './routes';

export interface Env {
  /** Clé TonAPI — SECRET : `wrangler secret put TONAPI_KEY`. */
  TONAPI_KEY: string;
  /** Origines web autorisées (séparées par des virgules). L'app native n'envoie pas d'Origin. */
  ALLOWED_ORIGINS?: string;
  /** Limiteur de débit Cloudflare (optionnel : absent, pas de limite côté Worker). */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

function cors(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin) return {}; // app native : pas d'en-tête Origin
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const corsHeaders = cors(origin, env);
    if (corsHeaders === null) return json(403, { error: 'origin not allowed' });

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' },
      });
    }
    if (url.pathname === '/health') return json(200, { ok: true }, corsHeaders);
    if (!env.TONAPI_KEY) return json(503, { error: 'proxy not configured' }, corsHeaders);

    const r = resolve(request.method, url.pathname, url.searchParams);
    if (!r.ok) return json(r.status, { error: r.error }, corsHeaders);

    // Débit par IP : une lecture peut être fréquente, un envoi beaucoup moins.
    if (env.LIMITER) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await env.LIMITER.limit({ key: `${request.method}:${ip}` });
      if (!success) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
    }

    let body: string | undefined;
    if (request.method === 'POST') {
      const len = Number(request.headers.get('content-length') ?? '0');
      if (len > MAX_BODY_BYTES) return json(413, { error: 'body too large' }, corsHeaders);
      const s = sanitizeBody(await request.text());
      if (!s.ok) return json(400, { error: s.error }, corsHeaders);
      body = s.body;
    }

    const upstream = `${UPSTREAM[r.network]}${r.upstreamPath}`;
    const cache = caches.default;
    const cacheKey = r.route.cacheSeconds ? new Request(upstream, { method: 'GET' }) : null;
    if (cacheKey) {
      const hit = await cache.match(cacheKey);
      if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...corsHeaders } });
    }

    let res: Response;
    try {
      res = await fetch(upstream, {
        method: request.method,
        headers: { authorization: `Bearer ${env.TONAPI_KEY}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body,
      });
    } catch {
      return json(502, { error: 'tonapi unreachable' }, corsHeaders);
    }

    // On ne relaie que le statut et le corps : aucun en-tête amont (quota, serveur…).
    const text = await res.text();
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', ...corsHeaders };
    if (cacheKey && res.ok) {
      ctx.waitUntil(cache.put(cacheKey, new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `max-age=${r.route.cacheSeconds}` } })));
    }
    return new Response(text, { status: res.status, headers });
  },
};
