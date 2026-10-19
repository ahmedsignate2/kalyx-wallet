/**
 * RELAIS DES API À CLÉ (hors JSON-RPC) : CoinGecko, LI.FI, Relay.link,
 * Etherscan, Helius (REST). Même règle que partout dans ce Worker :
 * ce n'est pas un proxy ouvert. Chaque service n'expose que les chemins dont
 * Kalyx a besoin, avec des paramètres contrôlés ; la clé est ajoutée ICI et ne
 * repart jamais vers le client.
 *
 * Fonctions pures, testées sans Cloudflare (`apis.test.ts`).
 */

export type ApiProvider = 'coingecko' | 'lifi' | 'relaylink' | 'etherscan' | 'helius';

export interface ApiKeys {
  coingecko?: string;
  lifi?: string;
  relaylink?: string;
  etherscan?: string;
  helius?: string;
}

export type ApiRoute =
  | { ok: true; provider: ApiProvider; method: 'GET' | 'POST'; upstream: (keys: ApiKeys) => { url: string; headers: Record<string, string> } | null; cacheSeconds: number; staleSeconds: number; maxBody: number }
  | { ok: false; status: number; error: string };

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ID = /^[a-z0-9-]{1,80}$/;
const NUM = /^\d{1,20}$/;

/** Contrôle des paramètres : tous connus, chacun valide, aucun en double ; rend la requête triée. */
function checkQuery(search: URLSearchParams, allowed: Record<string, RegExp>, required: string[] = []): string | null {
  const out = new URLSearchParams();
  for (const [k, v] of search) {
    const re = allowed[k];
    if (!re || !re.test(v) || out.has(k)) return null;
    out.set(k, v);
  }
  if (required.some((k) => !out.has(k))) return null;
  out.sort();
  return out.toString();
}

const bad = (error = 'bad request'): ApiRoute => ({ ok: false, status: 400, error });
const notFound: ApiRoute = { ok: false, status: 404, error: 'not found' };

/* ── CoinGecko (clé « Demo ») ─────────────────────────────────────────────── */
const CG = 'https://api.coingecko.com/api/v3';
const VS = /^[a-z]{3,5}(?:,[a-z]{3,5}){0,9}$/;
/**
 * `cache` : fraîcheur partagée entre tous les clients. `stale` : âge maximal
 * d'une copie de SECOURS, rendue seulement si CoinGecko ET l'appel direct de
 * l'appareil échouent (voir `relayOrDirect` côté client).
 */
const CG_ROUTES: { re: RegExp; params: Record<string, RegExp>; required: string[]; cache: number; stale: number }[] = [
  { re: /^\/simple\/price$/, params: { ids: /^[a-z0-9-]+(?:,[a-z0-9-]+){0,99}$/, vs_currencies: VS, include_24hr_change: /^(?:true|false)$/ }, required: ['ids', 'vs_currencies'], cache: 60, stale: 600 },
  { re: /^\/simple\/token_price\/[a-z0-9-]{1,40}$/, params: { contract_addresses: /^[0-9a-zA-Zx,]{1,4000}$/, vs_currencies: VS, include_24hr_change: /^(?:true|false)$/ }, required: ['contract_addresses', 'vs_currencies'], cache: 60, stale: 600 },
  { re: /^\/coins\/[a-z0-9-]{1,80}\/market_chart$/, params: { vs_currency: /^[a-z]{3,5}$/, days: /^(?:\d{1,4}|max)$/ }, required: ['vs_currency', 'days'], cache: 300, stale: 21_600 },
  { re: /^\/coins\/markets$/, params: { vs_currency: /^[a-z]{3,5}$/, ids: /^[a-z0-9-]+(?:,[a-z0-9-]+){0,249}$/, order: /^[a-z_]{1,30}$/, per_page: /^\d{1,3}$/, page: /^\d{1,3}$/, sparkline: /^(?:true|false)$/, price_change_percentage: /^[0-9a-z,]{1,40}$/ }, required: ['vs_currency'], cache: 120, stale: 3_600 },
  { re: /^\/coins\/[a-z0-9-]{1,80}$/, params: Object.fromEntries(['localization', 'tickers', 'market_data', 'community_data', 'developer_data', 'sparkline'].map((k) => [k, /^(?:true|false)$/])), required: [], cache: 300, stale: 21_600 },
  { re: /^\/search$/, params: { query: /^.{1,60}$/ }, required: ['query'], cache: 3_600, stale: 86_400 },
  { re: /^\/search\/trending$/, params: {}, required: [], cache: 600, stale: 21_600 },
];

function coingecko(path: string, search: URLSearchParams): ApiRoute {
  const r = CG_ROUTES.find((x) => x.re.test(path));
  if (!r) return notFound;
  const q = checkQuery(search, r.params, r.required);
  if (q === null) return bad();
  return {
    ok: true,
    provider: 'coingecko',
    method: 'GET',
    cacheSeconds: r.cache,
    staleSeconds: r.stale,
    maxBody: 0,
    // Sans clé : « non configuré ». L'API publique, appelée depuis les IP partagées de
    // Cloudflare, est vite bridée ; chaque appareil l'appelle alors lui-même (son propre débit).
    upstream: (k) => (k.coingecko ? { url: `${CG}${path}${q ? `?${q}` : ''}`, headers: { accept: 'application/json', 'x-cg-demo-api-key': k.coingecko } } : null),
  };
}

/* ── LI.FI (devis de swap / bridge, liste de tokens) ─────────────────────── */
const LIFI = 'https://li.quest/v1';
const LIFI_PARAM = /^[A-Za-z0-9_.,:\-x]{1,200}$/;

function lifi(path: string, search: URLSearchParams): ApiRoute {
  let params: Record<string, RegExp>;
  let required: string[];
  let cache: number;
  let stale = 0;
  if (path === '/quote') {
    params = Object.fromEntries(['fromChain', 'toChain', 'fromToken', 'toToken', 'fromAmount', 'fromAddress', 'toAddress', 'slippage', 'fee', 'feeRecipient', 'integrator', 'order', 'allowBridges', 'denyBridges', 'allowExchanges', 'denyExchanges', 'referrer'].map((k) => [k, LIFI_PARAM]));
    required = ['fromChain', 'toChain', 'fromToken', 'toToken', 'fromAmount', 'fromAddress'];
    cache = 0; // un devis expire vite : jamais gardé
  } else if (path === '/tokens') {
    params = { chains: /^[A-Za-z0-9,]{1,200}$/, chainTypes: /^[A-Z,]{1,40}$/ };
    required = [];
    cache = 3_600;
    stale = 86_400; // listes de tokens : une copie d'hier vaut mieux qu'aucune
  } else if (path === '/status') {
    params = { txHash: /^(?:0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{43,90})$/, bridge: /^[a-z0-9-]{1,40}$/, fromChain: /^[A-Za-z0-9]{1,20}$/, toChain: /^[A-Za-z0-9]{1,20}$/ };
    required = ['txHash'];
    cache = 10;
  } else return notFound;
  const q = checkQuery(search, params, required);
  if (q === null) return bad();
  return {
    ok: true,
    provider: 'lifi',
    method: 'GET',
    cacheSeconds: cache,
    staleSeconds: stale,
    maxBody: 0,
    upstream: (k) => ({ url: `${LIFI}${path}${q ? `?${q}` : ''}`, headers: { accept: 'application/json', ...(k.lifi ? { 'x-lifi-api-key': k.lifi } : {}) } }),
  };
}

/* ── Relay.link (devis : la clé est exigée par l'API) ───────────────────── */
function relaylink(method: string, path: string): ApiRoute {
  if (path !== '/quote') return notFound;
  if (method !== 'POST') return { ok: false, status: 405, error: 'method not allowed' };
  return {
    ok: true,
    provider: 'relaylink',
    method: 'POST',
    cacheSeconds: 0,
    staleSeconds: 0,
    maxBody: 16 * 1024,
    upstream: (k) => (k.relaylink ? { url: 'https://api.relay.link/quote', headers: { 'content-type': 'application/json', authorization: `Bearer ${k.relaylink}` } } : null),
  };
}

/* ── Etherscan V2 (historique, repli) ────────────────────────────────────── */
function etherscan(path: string, search: URLSearchParams): ApiRoute {
  if (path !== '/v2/api') return notFound;
  const q = checkQuery(
    search,
    { chainid: NUM, module: /^account$/, action: /^(?:txlist|tokentx|txlistinternal|tokennfttx)$/, address: ADDR, startblock: NUM, endblock: NUM, page: /^\d{1,4}$/, offset: /^\d{1,4}$/, sort: /^(?:asc|desc)$/ },
    ['chainid', 'module', 'action', 'address'],
  );
  if (q === null) return bad();
  return {
    ok: true,
    provider: 'etherscan',
    method: 'GET',
    cacheSeconds: 15,
    staleSeconds: 3_600,
    maxBody: 0,
    upstream: (k) => (k.etherscan ? { url: `https://api.etherscan.io/v2/api?${q}&apikey=${encodeURIComponent(k.etherscan)}`, headers: { accept: 'application/json' } } : null),
  };
}

/* ── Helius REST (historique Solana, noms, simulation) ───────────────────── */
function helius(method: string, path: string, search: URLSearchParams): ApiRoute {
  const tx = path.match(/^\/v0\/addresses\/([1-9A-HJ-NP-Za-km-z]{32,44})\/(transactions|names)$/);
  if (tx && SOL.test(tx[1])) {
    if (method !== 'GET') return { ok: false, status: 405, error: 'method not allowed' };
    const q = checkQuery(search, tx[2] === 'transactions' ? { before: /^[1-9A-HJ-NP-Za-km-z]{43,90}$/, limit: /^\d{1,3}$/, type: /^[A-Z_]{1,40}$/ } : {});
    if (q === null) return bad();
    return {
      ok: true,
      provider: 'helius',
      method: 'GET',
      cacheSeconds: tx[2] === 'names' ? 3_600 : 10,
      staleSeconds: tx[2] === 'names' ? 86_400 : 3_600,
      maxBody: 0,
      upstream: (k) => (k.helius ? { url: `https://api.helius.xyz${path}?${q ? `${q}&` : ''}api-key=${encodeURIComponent(k.helius)}`, headers: { accept: 'application/json' } } : null),
    };
  }
  if (path === '/v0/transactions/simulate') {
    if (method !== 'POST') return { ok: false, status: 405, error: 'method not allowed' };
    return {
      ok: true,
      provider: 'helius',
      method: 'POST',
      cacheSeconds: 0,
      staleSeconds: 0,
      maxBody: 64 * 1024,
      upstream: (k) => (k.helius ? { url: `https://api.helius.xyz/v0/transactions/simulate?api-key=${encodeURIComponent(k.helius)}`, headers: { 'content-type': 'application/json' } } : null),
    };
  }
  return notFound;
}

/** Routage : `/cg/api/v3/…`, `/lifi/v1/…`, `/relaylink/…`, `/etherscan/…`, `/helius/…`. */
export function resolveApi(method: string, pathname: string, search: URLSearchParams): ApiRoute | null {
  const get = method === 'GET';
  if (pathname.startsWith('/cg/api/v3/')) return get ? coingecko(pathname.slice('/cg/api/v3'.length), search) : { ok: false, status: 405, error: 'method not allowed' };
  if (pathname.startsWith('/lifi/v1/')) return get ? lifi(pathname.slice('/lifi/v1'.length), search) : { ok: false, status: 405, error: 'method not allowed' };
  if (pathname.startsWith('/relaylink/')) return relaylink(method, pathname.slice('/relaylink'.length));
  if (pathname.startsWith('/etherscan/')) return get ? etherscan(pathname.slice('/etherscan'.length), search) : { ok: false, status: 405, error: 'method not allowed' };
  if (pathname.startsWith('/helius/')) return helius(method, pathname.slice('/helius'.length), search);
  return null;
}

/** Corps POST : du JSON valide, re-sérialisé (aucun octet de plus ne passe). */
export function sanitizeJsonBody(text: string, maxBody: number): string | null {
  if (!text || text.length > maxBody) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' ? JSON.stringify(v) : null;
  } catch {
    return null;
  }
}

/**
 * Etherscan répond 200 même en erreur (`status: "0"`, message dans `result`) :
 * rend ce message (quota, clé…) pour ne pas le garder en cache comme un succès.
 * « Aucune transaction » (`result: []`) n'est pas une erreur.
 */
export function etherscanError(text: string): string {
  try {
    const v = JSON.parse(text) as { status?: unknown; result?: unknown };
    return v && v.status === '0' && typeof v.result === 'string' ? v.result : '';
  } catch {
    return 'invalid json';
  }
}
