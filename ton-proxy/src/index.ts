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
import { BROADCAST_FALLBACK, MAX_BODY_BYTES, resolve, sanitizeBody, UPSTREAM } from './routes';
import { API_HOST, buyParams, canonicalIp, isTxId, quoteQuery, signedBuyUrl, trimCurrencies, trimQuote, trimRegion, trimTx, type MoonpayEnvName } from './moonpay';

export interface Env {
  /** Clé TonAPI — SECRET : `wrangler secret put TONAPI_KEY`. */
  TONAPI_KEY: string;
  /** Origines web autorisées (séparées par des virgules). L'app native n'envoie pas d'Origin. */
  ALLOWED_ORIGINS?: string;
  /** Limiteurs Cloudflare (optionnels) : lectures, et envois — plus strict. */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  LIMITER_WRITE?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** MoonPay : clé PUBLIQUE (pk_test_… / pk_live_…), dans wrangler.toml. */
  MOONPAY_PUBLISHABLE_KEY?: string;
  /** MoonPay : clé SECRÈTE — `wrangler secret put MOONPAY_SECRET_KEY`. */
  MOONPAY_SECRET_KEY?: string;
  /** `sandbox` (défaut) ou `production`. */
  MOONPAY_ENV?: string;
  /** `off` pour ne pas lier l'URL à l'IP (diagnostic seulement). */
  MOONPAY_IP_MATCH?: string;
  /** Page HTTPS de fin d'achat, interceptée par l'app. */
  MOONPAY_REDIRECT_URL?: string;
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
    if (url.pathname.startsWith('/moonpay/')) return moonpay(request, url, env, ctx, corsHeaders);
    if (!env.TONAPI_KEY) return json(503, { error: 'proxy not configured' }, corsHeaders);

    const r = resolve(request.method, url.pathname, url.searchParams);
    if (!r.ok) return json(r.status, { error: r.error }, corsHeaders);

    // Débit par IP : une lecture peut être fréquente, un envoi beaucoup moins.
    const limiter = request.method === 'POST' ? env.LIMITER_WRITE : env.LIMITER;
    if (limiter) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await limiter.limit({ key: ip });
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

    const call = () =>
      fetch(upstream, {
        method: request.method,
        headers: { authorization: `Bearer ${env.TONAPI_KEY}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body,
      });
    let res: Response | null;
    try {
      res = await call();
      // Le quota TonAPI est GLOBAL à la clé : un 429 est souvent passager. Une
      // lecture est retentée une fois, une seconde plus tard.
      if (res.status === 429 && request.method === 'GET') {
        await new Promise((r) => setTimeout(r, 1000));
        res = await call();
      }
    } catch {
      res = null;
    }

    /*
     * Diffusion : si TonAPI sature ou tombe, le MÊME BOC part par TON Center.
     * L'utilisateur qui vient de confirmer un envoi ne doit pas voir d'échec
     * pour une question de quota. Un refus du message lui-même (4xx autre que
     * 429) n'est PAS rejoué ailleurs : il serait refusé là-bas aussi.
     */
    if (r.route.broadcast && body && (!res || res.status === 429 || res.status >= 500)) {
      try {
        const fb = await fetch(BROADCAST_FALLBACK[r.network], { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        const out = (await fb.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        // HTTP 200 = accepté, sauf refus EXPLICITE (`ok: false`) : présenter un
        // envoi parti comme un échec pousserait l'utilisateur à recommencer.
        if (fb.ok && out?.ok !== false) return json(200, { relayed: 'toncenter' }, corsHeaders);
        return json(fb.status === 200 ? 502 : fb.status, { error: out?.error ?? 'broadcast failed' }, corsHeaders);
      } catch {
        return json(502, { error: 'broadcast unreachable' }, corsHeaders);
      }
    }
    if (!res) return json(502, { error: 'tonapi unreachable' }, corsHeaders);

    // On ne relaie que le statut et le corps : aucun en-tête amont (quota, serveur…).
    const text = await res.text();
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', ...corsHeaders };
    if (cacheKey && res.ok) {
      ctx.waitUntil(cache.put(cacheKey, new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `max-age=${r.route.cacheSeconds}` } })));
    }
    return new Response(text, { status: res.status, headers });
  },
};

/* ── Achat de crypto (MoonPay) : voir src/moonpay.ts ─────────────────────── */
async function moonpay(request: Request, url: URL, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  const pk = env.MOONPAY_PUBLISHABLE_KEY?.trim();
  if (!pk) return json(503, { error: 'moonpay not configured' }, corsHeaders);
  const mpEnv: MoonpayEnvName = env.MOONPAY_ENV === 'production' ? 'production' : 'sandbox';
  // Une clé de test en production (ou l'inverse) : refus net plutôt qu'un widget cassé.
  if ((mpEnv === 'sandbox') !== pk.startsWith('pk_test_')) return json(503, { error: 'moonpay key/env mismatch' }, corsHeaders);

  const ip = request.headers.get('true-client-ip') ?? request.headers.get('cf-connecting-ip');
  const limiter = request.method === 'POST' ? env.LIMITER_WRITE : env.LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({ key: `mp:${ip ?? 'unknown'}` });
    if (!success) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  }

  const upstreamJson = async (path: string, cacheSeconds: number) => {
    const target = `${API_HOST}${path}`;
    const cache = caches.default;
    const key = cacheSeconds ? new Request(target, { method: 'GET' }) : null;
    if (key) {
      const hit = await cache.match(key);
      if (hit) return { status: hit.status, body: (await hit.json()) as unknown };
    }
    const res = await fetch(target, { headers: { accept: 'application/json' } });
    const body = (await res.json().catch(() => null)) as unknown;
    if (key && res.ok) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${cacheSeconds}` } })));
    return { status: res.status, body };
  };
  const upstreamError = (body: unknown) => (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : 'moonpay error');

  try {
    if (request.method === 'GET' && url.pathname === '/moonpay/currencies') {
      const r = await upstreamJson(`/v3/currencies?apiKey=${encodeURIComponent(pk)}`, 3600);
      if (r.status !== 200) return json(502, { error: upstreamError(r.body) }, corsHeaders);
      return json(200, { env: mpEnv, currencies: trimCurrencies(r.body) }, corsHeaders);
    }
    if (request.method === 'GET' && url.pathname === '/moonpay/quote') {
      const q = quoteQuery(url.searchParams, pk);
      if (!q) return json(400, { error: 'bad quote request' }, corsHeaders);
      const r = await upstreamJson(`/v3/currencies/${q.code}/buy_quote${q.query}`, 0);
      const quote = r.status === 200 ? trimQuote(r.body) : null;
      // Montant hors limites, actif indisponible… : le message de MoonPay est relayé tel quel.
      if (!quote) return json(r.status >= 400 && r.status < 500 ? 400 : 502, { error: upstreamError(r.body) }, corsHeaders);
      return json(200, quote, corsHeaders);
    }
    if (request.method === 'GET' && url.pathname === '/moonpay/tx') {
      // Suivi d'une commande : l'identifiant vient du retour du widget.
      const id = url.searchParams.get('id');
      if (!isTxId(id)) return json(400, { error: 'bad id' }, corsHeaders);
      const r = await upstreamJson(`/v1/transactions/${id}?apiKey=${encodeURIComponent(pk)}`, 0);
      const tx = r.status === 200 ? trimTx(r.body) : null;
      if (!tx) return json(r.status === 404 ? 404 : 502, { error: upstreamError(r.body) }, corsHeaders);
      return json(200, tx, { ...corsHeaders, 'cache-control': 'no-store' });
    }
    if (request.method === 'GET' && url.pathname === '/moonpay/region') {
      // Le pays de l'APPAREIL (pas celui du worker) : on transmet son IP.
      const cip = canonicalIp(ip);
      const r = await upstreamJson(`/v4/ip_address?apiKey=${encodeURIComponent(pk)}${cip ? `&ipAddress=${encodeURIComponent(cip)}` : ''}`, 0);
      const region = r.status === 200 ? trimRegion(r.body) : null;
      if (!region) return json(502, { error: upstreamError(r.body) }, corsHeaders);
      return json(200, region, { ...corsHeaders, 'cache-control': 'no-store' });
    }
    if (request.method === 'POST' && url.pathname === '/moonpay/url') {
      const secret = env.MOONPAY_SECRET_KEY?.trim();
      if (!secret) return json(503, { error: 'moonpay signing not configured' }, corsHeaders);
      const len = Number(request.headers.get('content-length') ?? '0');
      if (len > 4096) return json(413, { error: 'body too large' }, corsHeaders);
      const body = (await request.json().catch(() => null)) as unknown;
      const p = buyParams(body, pk);
      if (!p.ok) return json(400, { error: p.error }, corsHeaders);
      const redirect = env.MOONPAY_REDIRECT_URL?.trim();
      const signed = await signedBuyUrl({
        env: mpEnv,
        params: p.value,
        secret,
        clientIp: ip,
        ipMatch: env.MOONPAY_IP_MATCH !== 'off',
        redirectURL: redirect && redirect.startsWith('https://') ? redirect : undefined,
      });
      // URL liée à l'IP et à l'adresse : jamais mise en cache.
      return json(200, { url: signed, env: mpEnv }, { ...corsHeaders, 'cache-control': 'no-store' });
    }
  } catch {
    return json(502, { error: 'moonpay unreachable' }, corsHeaders);
  }
  return json(404, { error: 'not found' }, corsHeaders);
}
