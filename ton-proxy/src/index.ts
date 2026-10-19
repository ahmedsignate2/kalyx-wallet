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
import { balancesBatch, CHAIN_ID_PROBE, chainIdMatches, extensionAllowed, nftUpstream, parsePriceRequest, parsePrices, pricesUpstream, resolveNft, solanaFallbackUrl, joinTokens, metadataBatch, nonZeroContracts, parseErc20Request, quotaPause, resolveRpc, sanitizeRpc, upstreamUrl, type Provider, type RelayToken } from './rpc';
import { etherscanError, resolveApi, sanitizeJsonBody, type ApiKeys, type ApiRoute } from './apis';
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
  /** Alchemy (réseaux EVM) — SECRET : `wrangler secret put ALCHEMY_KEY`. */
  ALCHEMY_KEY?: string;
  /** Helius (Solana) — SECRET : `wrangler secret put HELIUS_KEY`. */
  HELIUS_KEY?: string;
  /** CoinGecko (clé Demo), LI.FI, Relay.link, Etherscan — SECRETS : `wrangler secret put <NOM>`. */
  COINGECKO_KEY?: string;
  LIFI_KEY?: string;
  RELAY_LINK_KEY?: string;
  ETHERSCAN_KEY?: string;
  /** Extensions autorisées (identifiants séparés par des virgules, `*` = toutes). */
  ALLOWED_EXTENSIONS?: string;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

function cors(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin) return {}; // app native : pas d'en-tête Origin
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin) && !extensionAllowed(origin, env.ALLOWED_EXTENSIONS)) return null;
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
    if (url.pathname.startsWith('/rpc/')) return rpc(request, url, env, ctx, corsHeaders);
    if (url.pathname === '/v1/erc20') return erc20(request, env, ctx, corsHeaders);
    if (url.pathname.startsWith('/nft/')) return nft(request, url, env, ctx, corsHeaders);
    if (url.pathname === '/v1/prices') return prices(request, env, ctx, corsHeaders);
    const a = resolveApi(request.method, url.pathname, url.searchParams);
    if (a) return api(request, a, env, ctx, corsHeaders);
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

/* ── Relais RPC (Alchemy, Helius) : voir src/rpc.ts ─────────────────────── */

/** Clé de cache interne (jamais une URL amont : elle contiendrait la clé). */
const internal = (path: string) => new Request(`https://relay.kalyx.internal/${path}`, { method: 'GET' });

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Quota du fournisseur épuisé récemment ? (mémorisé à la périphérie, sans rappeler le fournisseur). */
async function quotaHit(provider: string): Promise<boolean> {
  return !!(await caches.default.match(internal(`quota/${provider}`)));
}

function rememberQuota(provider: string, seconds: number, ctx: ExecutionContext) {
  ctx.waitUntil(caches.default.put(internal(`quota/${provider}`), new Response('1', { headers: { 'cache-control': `max-age=${seconds}` } })));
}

/**
 * Le réseau Alchemy sert-il bien l'identifiant attendu ? Contrôlé une fois par
 * jour et par réseau (mémorisé à la périphérie) ; en cas de doute, on refuse :
 * mieux vaut le repli sur les nœuds publics qu'un solde d'un autre réseau.
 */
async function chainVerified(slug: string, key: string, ctx: ExecutionContext): Promise<boolean> {
  const k = internal(`chainid/${slug}`);
  const hit = await caches.default.match(k);
  if (hit) return (await hit.text()) === '1';
  let ok: boolean;
  try {
    const res = await fetch(upstreamUrl('alchemy', slug, { alchemy: key })!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: CHAIN_ID_PROBE });
    if (!res.ok) return false; // non mémorisé : on réessaiera
    ok = chainIdMatches(slug, await res.json());
  } catch {
    return false;
  }
  ctx.waitUntil(caches.default.put(k, new Response(ok ? '1' : '0', { headers: { 'cache-control': 'max-age=86400' } })));
  return ok;
}

const quotaReply = (corsHeaders: Record<string, string>, seconds = 300) => json(503, { error: 'quota' }, { ...corsHeaders, 'retry-after': String(seconds) });

async function limited(request: Request, env: Env, write: boolean, prefix: string): Promise<boolean> {
  const limiter = write ? env.LIMITER_WRITE : env.LIMITER;
  if (!limiter) return false;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  return !(await limiter.limit({ key: `${prefix}:${ip}` })).success;
}

async function rpc(request: Request, url: URL, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  const r = resolveRpc(request.method, url.pathname);
  if (!r.ok) return json(r.status, { error: r.error }, corsHeaders);
  const primary = upstreamUrl(r.provider, r.slug, { alchemy: env.ALCHEMY_KEY, helius: env.HELIUS_KEY });
  // Solana : Alchemy en SECOURS de Helius (saturé ou non configuré).
  const backup = r.provider === 'helius' ? solanaFallbackUrl(env.ALCHEMY_KEY) : null;
  if (!primary && !backup) return json(503, { error: 'relay not configured' }, corsHeaders);
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > 32 * 1024) return json(413, { error: 'body too large' }, corsHeaders);
  const s = sanitizeRpc(r.provider, await request.text());
  if (!s.ok) return json(400, { error: s.error }, corsHeaders);
  if (await limited(request, env, s.write, r.provider)) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  // Le cache d'abord : une réponse gardée sert même quand le quota est épuisé.
  const key = s.cacheSeconds ? internal(`rpc/${r.slug}/${await sha256(s.body)}`) : null;
  if (key) {
    const hit = await caches.default.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  }
  // 421 et non 503 : un réseau mal apparié ne doit pas mettre en pause tous les autres côté client.
  if (r.provider === 'alchemy' && !(await chainVerified(r.slug, env.ALCHEMY_KEY!, ctx))) return json(421, { error: 'chain not verified' }, corsHeaders);

  /** Un fournisseur ; `null` = quota (mémorisé), on passe au suivant. */
  const attempt = async (target: string, provider: Provider): Promise<Response | null> => {
    if (!s.write && (await quotaHit(provider))) return null;
    let res: Response;
    try {
      res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: s.body });
    } catch {
      return json(502, { error: 'upstream unreachable' }, corsHeaders);
    }
    const text = await res.text();
    const pause = quotaPause(res.status, res.ok ? '' : text);
    if (pause) {
      rememberQuota(provider, pause, ctx);
      return null;
    }
    if (key && res.ok && !/"error"/.test(text)) {
      ctx.waitUntil(caches.default.put(key, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${s.cacheSeconds}` } })));
    }
    // Statut et corps seulement : aucun en-tête amont.
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  };
  const first = primary ? await attempt(primary, r.provider) : null;
  if (first && first.status < 500) return first;
  // Helius saturé ou en panne : la même requête part chez Alchemy Solana.
  const second = backup ? await attempt(backup, 'alchemy') : null;
  return second ?? first ?? quotaReply(corsHeaders);
}

/**
 * API REST à clé (CoinGecko, LI.FI, Relay.link, Etherscan, Helius) :
 * chemins et paramètres en liste blanche (src/apis.ts), clé ajoutée ici,
 * lectures gardées en cache pour TOUS les clients, quota mémorisé par service.
 */
async function api(request: Request, r: ApiRoute, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  if (!r.ok) return json(r.status, { error: r.error }, corsHeaders);
  const keys: ApiKeys = { coingecko: env.COINGECKO_KEY, lifi: env.LIFI_KEY, relaylink: env.RELAY_LINK_KEY, etherscan: env.ETHERSCAN_KEY, helius: env.HELIUS_KEY };
  const up = r.upstream(keys);
  if (!up) return json(503, { error: 'relay not configured' }, corsHeaders);
  let body: string | undefined;
  if (r.method === 'POST') {
    const len = Number(request.headers.get('content-length') ?? '0');
    if (len > r.maxBody) return json(413, { error: 'body too large' }, corsHeaders);
    const b = sanitizeJsonBody(await request.text(), r.maxBody);
    if (b === null) return json(400, { error: 'bad body' }, corsHeaders);
    body = b;
  }
  if (await limited(request, env, r.method === 'POST', r.provider)) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  // Clé de cache : le chemin public (déjà normalisé), jamais l'URL amont qui porte la clé.
  const url = new URL(request.url);
  const key = r.cacheSeconds ? internal(`api/${r.provider}/${await sha256(`${url.pathname}?${[...url.searchParams].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')}`)}`) : null;
  if (key) {
    const hit = await caches.default.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  }
  if (await quotaHit(r.provider)) return quotaReply(corsHeaders);
  let res: Response;
  try {
    res = await fetch(up.url, { method: r.method, headers: up.headers, body });
  } catch {
    return json(502, { error: 'upstream unreachable' }, corsHeaders);
  }
  const text = await res.text();
  const softError = res.ok && r.provider === 'etherscan' ? etherscanError(text) : '';
  const pause = quotaPause(res.status, res.ok ? softError : text);
  if (pause) {
    rememberQuota(r.provider, pause, ctx);
    return quotaReply(corsHeaders, pause);
  }
  if (key && res.ok && !softError) ctx.waitUntil(caches.default.put(key, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${r.cacheSeconds}` } })));
  // Statut et corps seulement : aucun en-tête amont.
  return new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
}

/** NFT (Alchemy NFT v3) : méthodes en liste blanche, réponses en cache. */
async function nft(request: Request, url: URL, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  const r = resolveNft(request.method, url.pathname, url.searchParams);
  if (!r.ok) return json(r.status, { error: r.error }, corsHeaders);
  if (!env.ALCHEMY_KEY) return json(503, { error: 'relay not configured' }, corsHeaders);
  if (await limited(request, env, false, 'nft')) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  const key = internal(`nft/${r.slug}/${r.method}?${r.query}`);
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  if (await quotaHit('alchemy')) return quotaReply(corsHeaders);
  if (!(await chainVerified(r.slug, env.ALCHEMY_KEY, ctx))) return json(421, { error: 'chain not verified' }, corsHeaders);
  let res: Response;
  try {
    res = await fetch(nftUpstream(r.slug, r.method, r.query, env.ALCHEMY_KEY), { headers: { accept: 'application/json' } });
  } catch {
    return json(502, { error: 'upstream unreachable' }, corsHeaders);
  }
  const text = await res.text();
  const pause = quotaPause(res.status, res.ok ? '' : text);
  if (pause) {
    rememberQuota('alchemy', pause, ctx);
    return quotaReply(corsHeaders, pause);
  }
  if (res.ok) ctx.waitUntil(caches.default.put(key, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${r.cacheSeconds}` } })));
  return new Response(text, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
}

/** Prix (Alchemy Prices) : 25 tokens par requête, gardés 1 minute pour tout le monde. */
async function prices(request: Request, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, corsHeaders);
  if (!env.ALCHEMY_KEY) return json(503, { error: 'relay not configured' }, corsHeaders);
  const q = parsePriceRequest(await request.text());
  if (!q.ok) return json(400, { error: q.error }, corsHeaders);
  if (await limited(request, env, false, 'prices')) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  const key = internal(`prices/${await sha256(JSON.stringify(q.tokens))}`);
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  if (await quotaHit('alchemy')) return quotaReply(corsHeaders);
  let res: Response;
  try {
    res = await fetch(pricesUpstream(env.ALCHEMY_KEY), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ addresses: q.tokens }) });
  } catch {
    return json(502, { error: 'upstream unreachable' }, corsHeaders);
  }
  const text = await res.text();
  const pause = quotaPause(res.status, res.ok ? '' : text);
  if (pause) {
    rememberQuota('alchemy', pause, ctx);
    return quotaReply(corsHeaders, pause);
  }
  if (!res.ok) return json(502, { error: 'upstream' }, corsHeaders);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(502, { error: 'upstream' }, corsHeaders);
  }
  const body = JSON.stringify({ prices: parsePrices(parsed) });
  ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' } })));
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
}

/**
 * Tokens ERC-20 de plusieurs réseaux, en UNE requête au Worker : par réseau,
 * un lot de soldes (énumération + tokens connus) puis un lot de métadonnées.
 * Réponse gardée 30 s à la périphérie (même adresse, mêmes réseaux).
 */
async function erc20(request: Request, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, corsHeaders);
  if (!env.ALCHEMY_KEY) return json(503, { error: 'relay not configured' }, corsHeaders);
  const q = parseErc20Request(await request.text());
  if (!q.ok) return json(400, { error: q.error }, corsHeaders);
  if (await limited(request, env, false, 'erc20')) return json(429, { error: 'rate limited' }, { ...corsHeaders, 'retry-after': '10' });
  const key = internal(`erc20/${await sha256(`${q.address}|${q.slugs.join(',')}`)}`);
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
  if (await quotaHit('alchemy')) return quotaReply(corsHeaders);

  let quota = 0;
  const post = async (slug: string, body: string): Promise<unknown> => {
    const res = await fetch(upstreamUrl('alchemy', slug, { alchemy: env.ALCHEMY_KEY })!, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const text = await res.text();
    const p = quotaPause(res.status, res.ok ? '' : text);
    if (p) {
      quota = Math.max(quota, p);
      throw new Error('quota');
    }
    if (!res.ok) throw new Error('upstream');
    return JSON.parse(text) as unknown;
  };
  const chains: Record<string, { tokens: RelayToken[] } | { error: 'quota' | 'upstream' }> = {};
  await Promise.all(
    q.slugs.map(async (slug) => {
      try {
        if (!(await chainVerified(slug, env.ALCHEMY_KEY!, ctx))) throw new Error('upstream');
        const balances = nonZeroContracts(await post(slug, balancesBatch(slug, q.address)));
        chains[slug] = { tokens: balances.length ? joinTokens(balances, await post(slug, metadataBatch(balances.map((b) => b.contract)))) : [] };
      } catch (e) {
        chains[slug] = { error: (e as Error).message === 'quota' ? 'quota' : 'upstream' };
      }
    }),
  );
  if (quota) rememberQuota('alchemy', quota, ctx);
  const body = JSON.stringify({ chains });
  // Une réponse complète seulement : un réseau en échec ne doit pas rester figé 30 s.
  if (Object.values(chains).every((c) => 'tokens' in c)) {
    ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30' } })));
  }
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } });
}
