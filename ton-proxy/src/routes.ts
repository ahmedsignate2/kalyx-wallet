/**
 * Routes autorisées vers TonAPI — la LISTE BLANCHE du proxy.
 *
 * Le Worker détient la clé TonAPI : s'il relayait n'importe quel chemin, il
 * deviendrait un accès gratuit à TonAPI pour qui connaît son URL, sur le quota
 * de Kalyx. On ne laisse donc passer que ce dont l'app a besoin, chaque route
 * relevée en interrogeant TonAPI le 27/09, et seulement ses paramètres connus.
 *
 * Fonctions pures, testées sans Cloudflare (`routes.test.ts`).
 */
export type Network = 'mainnet' | 'testnet';

export const UPSTREAM: Record<Network, string> = {
  mainnet: 'https://tonapi.io',
  testnet: 'https://testnet.tonapi.io',
};

/**
 * Repli de DIFFUSION seulement. TonAPI et TON Center n'ont pas le même format
 * de réponse : pour une lecture, le Worker ne pourrait pas traduire l'un en
 * l'autre sans risquer de tromper l'app. Pour une diffusion, les deux prennent
 * le même BOC signé — relayer ailleurs est sans ambiguïté.
 */
export const BROADCAST_FALLBACK: Record<Network, string> = {
  mainnet: 'https://toncenter.com/api/v2/sendBoc',
  testnet: 'https://testnet.toncenter.com/api/v2/sendBoc',
};

// Adresse conviviale (48 caractères base64url) ou brute (workchain:64 hex).
const ADDR = '(?:[A-Za-z0-9_-]{48}|-?\\d{1,3}:[0-9a-fA-F]{64})';
// Hachage : 64 hexadécimaux ou base64url de 43/44 caractères.
const HASH = '(?:[0-9a-fA-F]{64}|[A-Za-z0-9_=-]{43,44})';

interface Route {
  method: 'GET' | 'POST';
  pattern: RegExp;
  /** Paramètres de requête autorisés, avec leur contrôle. */
  query?: Record<string, RegExp>;
  /** Durée de cache (s) ; absent = pas de cache. */
  cacheSeconds?: number;
  /** Diffusion d'un message : repli sur TON Center si TonAPI sature. */
  broadcast?: boolean;
}

const LIMIT = /^(?:[1-9]|[1-9]\d|100)$/;
const OFFSET = /^\d{1,5}$/;
const BOOL = /^(?:true|false)$/;
// Nom TON DNS : « kalyx.ton », « sous.domaine.ton », « nom.t.me » — minuscules, chiffres, tirets.
const DOMAIN = '(?:[a-z0-9-]{1,63}\\.){1,4}(?:ton|t\\.me)';
const LT = /^\d{1,24}$/;
const CODES = /^[a-zA-Z0-9,]{1,64}$/;

/*
 * DURÉES DE CACHE, choisies route par route :
 * - cours, métadonnées de jeton : communs à tous → 60 s / 300 s ;
 * - état, jetons, historique d'une adresse : 10 s — neutralise le
 *   « tirer pour rafraîchir » répété sans montrer de données vieilles ;
 * - seqno : JAMAIS. Un seqno vieux de 10 s ferait signer un second envoi
 *   rapproché avec un compteur périmé : le réseau le refuserait ;
 * - suivi d'une transaction : jamais — un « pas encore trouvée » mis en cache
 *   retarderait la confirmation affichée ;
 * - émulation, diffusion : jamais, par nature.
 */
export const ROUTES: Route[] = [
  { method: 'GET', pattern: new RegExp(`^/v2/accounts/${ADDR}$`), cacheSeconds: 10 },
  { method: 'GET', pattern: new RegExp(`^/v2/accounts/${ADDR}/events$`), query: { limit: LIMIT, before_lt: LT }, cacheSeconds: 10 },
  { method: 'GET', pattern: new RegExp(`^/v2/accounts/${ADDR}/jettons$`), query: { currencies: CODES }, cacheSeconds: 10 },
  { method: 'GET', pattern: new RegExp(`^/v2/wallet/${ADDR}/seqno$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/blockchain/messages/${HASH}/transaction$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/events/${HASH}$`) },
  { method: 'GET', pattern: new RegExp(`^/v2/jettons/${ADDR}$`), cacheSeconds: 300 },
  // NFT d'une adresse (domaines .ton compris) : 60 s, ils changent rarement.
  { method: 'GET', pattern: new RegExp(`^/v2/accounts/${ADDR}/nfts$`), query: { limit: LIMIT, offset: OFFSET, indirect_ownership: BOOL }, cacheSeconds: 60 },
  // Résolution d'un nom .ton : 60 s. Assez court pour suivre un changement de propriétaire.
  { method: 'GET', pattern: new RegExp(`^/v2/dns/${DOMAIN}/resolve$`), cacheSeconds: 60 },
  { method: 'GET', pattern: /^\/v2\/rates$/, query: { tokens: CODES, currencies: CODES }, cacheSeconds: 60 },
  { method: 'POST', pattern: /^\/v2\/wallet\/emulate$/ },
  { method: 'POST', pattern: /^\/v2\/blockchain\/message$/, broadcast: true },
];

export type Resolved =
  | { ok: true; network: Network; upstreamPath: string; route: Route }
  | { ok: false; status: 400 | 404 | 405; error: string };

/**
 * `/<réseau>/v2/…?…` → chemin TonAPI filtré, ou refus.
 * Les paramètres inconnus sont REFUSÉS, pas ignorés : un paramètre ignoré
 * silencieusement masquerait une erreur de l'app.
 */
export function resolve(method: string, pathname: string, search: URLSearchParams): Resolved {
  const m = pathname.match(/^\/(mainnet|testnet)(\/v2\/.*)$/);
  if (!m) return { ok: false, status: 404, error: 'unknown route' };
  const network = m[1] as Network;
  const path = m[2];
  const route = ROUTES.find((r) => r.pattern.test(path));
  if (!route) return { ok: false, status: 404, error: 'route not allowed' };
  if (route.method !== method) return { ok: false, status: 405, error: 'method not allowed' };
  const out = new URLSearchParams();
  for (const [k, v] of search) {
    const check = route.query?.[k];
    if (!check || !check.test(v)) return { ok: false, status: 400, error: `parameter not allowed: ${k}` };
    out.set(k, v);
  }
  const qs = out.toString();
  return { ok: true, network, upstreamPath: qs ? `${path}?${qs}` : path, route };
}

/** Taille maximale d'un corps POST : un message TON signé tient en quelques Ko. */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Corps POST : `{ boc }` et RIEN d'autre, re-sérialisé — aucun champ inconnu
 * n'est relayé. Base64 (standard ou url), taille bornée.
 */
export function sanitizeBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, error: 'body too large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid json' };
  }
  const boc = (parsed as { boc?: unknown })?.boc;
  if (typeof boc !== 'string' || !/^[A-Za-z0-9+/_=-]{8,}$/.test(boc)) return { ok: false, error: 'invalid boc' };
  return { ok: true, body: JSON.stringify({ boc }) };
}
