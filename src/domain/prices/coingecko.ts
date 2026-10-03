/**
 * Prix de marché via l'API CoinGecko (gratuite, sans clé requise).
 *
 * Deux usages :
 *  - `getPrices` : prix + variation 24h de monnaies précises (pour la valeur
 *    fiat du solde).
 *  - `getMarkets` : liste de marché (Top / Gagnants / Perdants) avec sparkline.
 *
 * Les parseurs sont purs (testés) ; le fetch réseau dégrade proprement (renvoie
 * un résultat vide en cas d'échec, ne bloque jamais l'UI).
 */
import { withTimeout } from '../chains/net';

const API = 'https://api.coingecko.com/api/v3';
const KEY =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_COINGECKO_KEY) || '';
const TIMEOUT = 10_000;

export interface CoinPrice {
  id: string;
  price: number;
  change24h: number;
}

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  sparkline: number[];
}

export type MarketOrder = 'top' | 'gainers' | 'losers';

export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  ath: number;
  atl: number;
  circulatingSupply: number;
  description: string;
  /** Contrats par plateforme CoinGecko (ex. { 'sei-v2': '0x…' }) — vide pour les natifs sans contrat. */
  platforms: Record<string, string>;
}

/** Périodes de graphique et jours CoinGecko correspondants. */
export const CHART_PERIODS = [
  { key: '24h', label: '24h', days: '1' },
  { key: '7j', label: '7j', days: '7' },
  { key: '30j', label: '30j', days: '30' },
  { key: '1an', label: '1an', days: '365' },
  { key: 'all', label: 'ALL', days: 'max' },
] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number]['key'];

// ---- Parseurs purs (testés) ----

export function parseSimplePrices(json: unknown, vs: string): Record<string, CoinPrice> {
  const out: Record<string, CoinPrice> = {};
  if (!json || typeof json !== 'object') return out;
  for (const [id, v] of Object.entries(json as Record<string, Record<string, number>>)) {
    if (v && typeof v[vs] === 'number') {
      out[id] = { id, price: v[vs], change24h: v[`${vs}_24h_change`] ?? 0 };
    }
  }
  return out;
}

export function parseMarkets(json: unknown): MarketCoin[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id,
      symbol: typeof c.symbol === 'string' ? c.symbol.toUpperCase() : '',
      name: c.name ?? c.id,
      image: c.image ?? '',
      price: Number(c.current_price) || 0,
      change24h: Number(c.price_change_percentage_24h) || 0,
      sparkline: Array.isArray(c.sparkline_in_7d?.price)
        ? c.sparkline_in_7d.price.map((n: unknown) => Number(n) || 0)
        : [],
    }));
}

export interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  rank: number | null;
}

export function parseSearchCoins(json: unknown): SearchCoin[] {
  const list = (json as { coins?: { id?: string; name?: string; symbol?: string; thumb?: string; large?: string; market_cap_rank?: number }[] })?.coins;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id!,
      name: c.name ?? c.id!,
      symbol: (c.symbol ?? '').toUpperCase(),
      // `large` (250 px) d'abord : `thumb` ne fait que 25 px, flou dès 36 px à l'écran.
      thumb: c.large ?? c.thumb ?? '',
      rank: typeof c.market_cap_rank === 'number' ? c.market_cap_rank : null,
    }));
}

/** Recherche de cryptos par nom/symbole (toutes, pas seulement le top). */
export async function searchCoins(query: string): Promise<SearchCoin[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await withTimeout(
      fetch(url(`/search?query=${encodeURIComponent(q)}`)),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseSearchCoins(await res.json()).slice(0, 25);
  } catch {
    return [];
  }
}

/** Nettoie une description HTML CoinGecko sans perdre la source complète. */
function cleanDescription(html: string): string {
  const text = (html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function parseCoinDetail(json: unknown, vs: string, lang = 'en'): CoinDetail | null {
  const c = json as {
    id?: string;
    symbol?: string;
    name?: string;
    image?: { large?: string; small?: string };
    market_data?: {
      current_price?: Record<string, number>;
      price_change_percentage_24h?: number;
      price_change_percentage_24h_in_currency?: Record<string, number>;
      market_cap?: Record<string, number>;
      total_volume?: Record<string, number>;
      ath?: Record<string, number>;
      atl?: Record<string, number>;
      circulating_supply?: number;
    };
    description?: Record<string, string>;
    platforms?: Record<string, string>;
  };
  if (!c || typeof c.id !== 'string') return null;
  const platforms: Record<string, string> = {};
  for (const [platform, contract] of Object.entries(c.platforms ?? {})) {
    if (platform && typeof contract === 'string' && contract.trim()) platforms[platform] = contract.trim();
  }
  return {
    id: c.id,
    symbol: (c.symbol ?? '').toUpperCase(),
    name: c.name ?? c.id,
    image: c.image?.large ?? c.image?.small ?? '',
    price: c.market_data?.current_price?.[vs] ?? 0,
    // Variation DANS LA DEVISE demandée (celle à plat est en USD : en EUR, elle contredisait la courbe).
    change24h: c.market_data?.price_change_percentage_24h_in_currency?.[vs] ?? c.market_data?.price_change_percentage_24h ?? 0,
    marketCap: c.market_data?.market_cap?.[vs] ?? 0,
    volume24h: c.market_data?.total_volume?.[vs] ?? 0,
    ath: c.market_data?.ath?.[vs] ?? 0,
    atl: c.market_data?.atl?.[vs] ?? 0,
    circulatingSupply: c.market_data?.circulating_supply ?? 0,
    description: cleanDescription(c.description?.[lang] || c.description?.en || ''),
    platforms,
  };
}

/** Extrait la série de prix d'une réponse market_chart ([[ts, price], …]). */
export function parseMarketChart(json: unknown): number[] {
  const prices = (json as { prices?: [number, number][] })?.prices;
  if (!Array.isArray(prices)) return [];
  return prices.map((p) => Number(p?.[1]) || 0);
}

/** Point horodaté d'un graphique (scrub interactif : prix + date sous le doigt). */
export interface ChartPoint {
  /** Timestamp (millisecondes). */
  t: number;
  /** Prix dans la devise demandée. */
  v: number;
}

export function parseMarketChartPoints(json: unknown): ChartPoint[] {
  const prices = (json as { prices?: [number, number][] })?.prices;
  if (!Array.isArray(prices)) return [];
  return prices
    .map((p) => ({ t: Number(p?.[0]) || 0, v: Number(p?.[1]) || 0 }))
    .filter((p) => p.t > 0);
}

/** Tri des marchés selon l'onglet (Top / Gagnants / Perdants). */
export function sortMarkets(coins: MarketCoin[], order: MarketOrder): MarketCoin[] {
  if (order === 'gainers') return [...coins].sort((a, b) => b.change24h - a.change24h);
  if (order === 'losers') return [...coins].sort((a, b) => a.change24h - b.change24h);
  return coins; // 'top' = déjà par market cap
}

// ---- Cache mémoire (TTL) ----
//
// Sans clé, CoinGecko limite le débit par IP (~429 « Rate Limit »), et sur un
// réseau mobile l'IP est partagée par des milliers d'abonnés de l'opérateur :
// le quota est souvent déjà saturé avant même le premier appel de l'app. Un
// cache mémoire à courte durée de vie évite de refaire un appel réseau à
// chaque ouverture d'écran/re-render pour la MÊME donnée, et en cas de 429
// on sert la dernière valeur connue (même expirée) plutôt qu'un écran vide.
const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { value: unknown; ts: number }>();

/**
 * DURÉE DE VIE SELON LA DONNÉE. Un prix bouge à la seconde ; un graphique
 * d'un an, lui, ne change pas d'un point visible en une heure. Tout garder
 * 45 s faisait refaire des appels inutiles, et sur une IP mobile partagée
 * chaque appel évité est un 429 évité.
 */
export function cacheTtlFor(key: string): number {
  if (key.startsWith('markets:')) return 120_000;
  if (key.startsWith('chart:')) {
    const days = key.split(':')[3];
    if (days === '1') return 120_000;
    if (days === '7') return 10 * 60_000;
    if (days === '30') return 30 * 60_000;
    return 2 * 3_600_000;
  }
  return CACHE_TTL_MS;
}

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.ts < cacheTtlFor(key) ? (hit.value as T) : undefined;
}
function cacheGetStale<T>(key: string, maxAgeMs = Infinity): T | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.ts <= maxAgeMs ? (hit.value as T) : undefined;
}
function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { value, ts: Date.now() });
  schedulePersist();
}

/*
 * CACHE PERSISTANT. La mémoire se vidait à chaque redémarrage : l'app
 * rouvrait sur des marchés et des graphiques vides tant que CoinGecko ne
 * répondait pas — et quand il renvoyait 429 ou expirait, ils restaient vides.
 * Les dernières valeurs sont désormais écrites sur l'appareil (données
 * publiques uniquement : prix, marchés, courbes) et relues au démarrage ;
 * elles servent de repli « périmé mais réel » et évitent l'écran vide.
 */
export interface PriceCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
const STORE_KEY = 'kalyx.priceCache.v1';
/** Entrées gardées sur disque : les plus récentes d'abord. */
const MAX_PERSISTED = 80;
let storage: PriceCacheStorage | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (!storage || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const entries = [...cache.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, MAX_PERSISTED);
    void storage?.setItem(STORE_KEY, JSON.stringify(entries)).catch(() => {});
  }, 1_500);
}

/** Branche le stockage et recharge ce qui y était ; la mémoire plus fraîche gagne. */
export async function attachPriceCacheStorage(s: PriceCacheStorage): Promise<void> {
  storage = s;
  try {
    const raw = await s.getItem(STORE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, { value: unknown; ts: number }][];
    if (!Array.isArray(entries)) return;
    for (const [k, v] of entries) {
      if (typeof k !== 'string' || !v || typeof v.ts !== 'number') continue;
      const mem = cache.get(k);
      if (!mem || mem.ts < v.ts) cache.set(k, v);
    }
  } catch {
    // Cache illisible : on repart de zéro, ce n'est qu'un cache.
  }
}

/** Même requête déjà en vol : on attend la même réponse au lieu d'en lancer une autre. */
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * L'API publique (et la clé « demo ») refusent l'historique au-delà de 365
 * jours : « Tout » (max) répondait 401 et laissait le graphique vide. On
 * demande donc un an, ce qui est le maximum réellement servi.
 */
export function effectiveDays(days: string): string {
  return days === 'max' ? '365' : days;
}

// ---- Fetch réseau (dégrade en vide) ----

function url(path: string): string {
  return `${API}${path}${path.includes('?') ? '&' : '?'}${KEY ? `x_cg_demo_api_key=${KEY}` : ''}`;
}

/** En-tête recommandé par CoinGecko pour une clé Demo (en plus du paramètre d'URL, gardé pour compat). */
function headers(): Record<string, string> {
  return KEY ? { 'x-cg-demo-api-key': KEY } : {};
}

/**
 * Prix au comptant. En cas d'échec, le dernier prix connu sert de repli —
 * pour l'AFFICHAGE. `maxStaleMs` borne ce repli pour ce qui DÉCIDE (alertes) :
 * un prix d'il y a une semaine relu du disque déclenchait une alerte à tort.
 */
export async function getPrices(ids: string[], vs = 'eur', opts?: { maxStaleMs?: number }): Promise<Record<string, CoinPrice>> {
  if (ids.length === 0) return {};
  const key = `prices:${vs}:${[...ids].sort().join(',')}`;
  const cached = cacheGet<Record<string, CoinPrice>>(key);
  if (cached) return cached;
  const maxStale = opts?.maxStaleMs ?? Infinity;
  // Une seule requête par clé à la fois (portefeuille, alertes, tableau de bord demandent souvent la même).
  return once(`${key}|${maxStale}`, () => fetchPrices(ids, vs, key, maxStale));
}

async function fetchPrices(ids: string[], vs: string, key: string, maxStale: number): Promise<Record<string, CoinPrice>> {
  try {
    const res = await withTimeout(
      fetch(url(`/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}&include_24hr_change=true`), { headers: headers() }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    const json = await res.json();
    if (!res.ok) console.warn('[coingecko] getPrices HTTP', res.status, json);
    const parsed = parseSimplePrices(json, vs);
    if (Object.keys(parsed).length > 0) cacheSet(key, parsed);
    return Object.keys(parsed).length > 0 ? parsed : cacheGetStale(key, maxStale) ?? {};
  } catch (e) {
    console.warn('[coingecko] getPrices failed', e);
    return cacheGetStale(key, maxStale) ?? {};
  }
}

export async function getCoinDetail(id: string, vs = 'eur', lang = 'en'): Promise<CoinDetail | null> {
  const key = `detail:${id}:${vs}:${lang}`;
  const cached = cacheGet<CoinDetail>(key);
  if (cached) return cached;
  try {
    const res = await withTimeout(
      fetch(
        url(
          `/coins/${id}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
        ),
        { headers: headers() },
      ),
      TIMEOUT,
      () => new Error('timeout'),
    );
    const json = await res.json();
    if (!res.ok) {
      // Retiré du bundle de prod par babel-plugin-transform-remove-console — diagnostic dev uniquement.
      console.warn('[coingecko] getCoinDetail HTTP', res.status, id, json);
    }
    const parsed = parseCoinDetail(json, vs, lang);
    if (parsed) cacheSet(key, parsed);
    return parsed ?? cacheGetStale<CoinDetail>(key) ?? null;
  } catch (e) {
    console.warn('[coingecko] getCoinDetail failed', id, e);
    return cacheGetStale<CoinDetail>(key) ?? null;
  }
}

export async function getMarketChart(id: string, vs = 'eur', days = '7'): Promise<number[]> {
  try {
    const res = await withTimeout(
      fetch(url(`/coins/${id}/market_chart?vs_currency=${vs}&days=${effectiveDays(days)}`), { headers: headers() }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseMarketChart(await res.json());
  } catch {
    return [];
  }
}

/** Comme getMarketChart mais avec les timestamps (graphique scrubable). */
export async function getMarketChartPoints(id: string, vs = 'eur', days = '7'): Promise<ChartPoint[]> {
  const d = effectiveDays(days);
  const key = `chart:${id}:${vs}:${d}`;
  const cached = cacheGet<ChartPoint[]>(key);
  if (cached) return cached;
  return once(key, async () => {
    try {
      const res = await withTimeout(
        fetch(url(`/coins/${id}/market_chart?vs_currency=${vs}&days=${d}`), { headers: headers() }),
        TIMEOUT,
        () => new Error('timeout'),
      );
      const json = await res.json();
      if (!res.ok) console.warn('[coingecko] getMarketChartPoints HTTP', res.status, id, json);
      const parsed = parseMarketChartPoints(json);
      if (parsed.length > 0) cacheSet(key, parsed);
      return parsed.length > 0 ? parsed : cacheGetStale<ChartPoint[]>(key) ?? [];
    } catch (e) {
      console.warn('[coingecko] getMarketChartPoints failed', id, e);
      return cacheGetStale<ChartPoint[]>(key) ?? [];
    }
  });
}

/** Prix de tokens ERC-20 par contrat : { contractLowercase: price }. */
export function parseTokenPrices(json: unknown, vs: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!json || typeof json !== 'object') return out;
  for (const [addr, v] of Object.entries(json as Record<string, Record<string, number>>)) {
    if (v && typeof v[vs] === 'number') out[addr.toLowerCase()] = v[vs];
  }
  return out;
}

export async function getTokenPrices(
  platform: string,
  contracts: string[],
  vs = 'eur',
): Promise<Record<string, number>> {
  if (contracts.length === 0) return {};
  const key = `tokenPrices:${platform}:${vs}:${[...contracts].map((c) => c.toLowerCase()).sort().join(',')}`;
  const cached = cacheGet<Record<string, number>>(key);
  if (cached) return cached;
  try {
    const res = await withTimeout(
      fetch(url(`/simple/token_price/${platform}?contract_addresses=${contracts.join(',')}&vs_currencies=${vs}`), {
        headers: headers(),
      }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    const parsed = parseTokenPrices(await res.json(), vs);
    if (Object.keys(parsed).length > 0) cacheSet(key, parsed);
    return Object.keys(parsed).length > 0 ? parsed : cacheGetStale(key) ?? {};
  } catch {
    return cacheGetStale(key) ?? {};
  }
}

export async function getMarkets(vs = 'eur', perPage = 20): Promise<MarketCoin[]> {
  const key = `markets:${vs}:${perPage}`;
  const cached = cacheGet<MarketCoin[]>(key);
  if (cached) return cached;
  return once(key, async () => {
    try {
      const res = await withTimeout(
        fetch(
          url(
            `/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=true&price_change_percentage=24h`,
          ),
          { headers: headers() },
        ),
        TIMEOUT,
        () => new Error('timeout'),
      );
      const json = await res.json();
      if (!res.ok) console.warn('[coingecko] getMarkets HTTP', res.status, json);
      const parsed = parseMarkets(json);
      if (parsed.length > 0) cacheSet(key, parsed);
      return parsed.length > 0 ? parsed : cacheGetStale<MarketCoin[]>(key) ?? [];
    } catch (e) {
      console.warn('[coingecko] getMarkets failed', e);
      return cacheGetStale<MarketCoin[]>(key) ?? [];
    }
  });
}

/**
 * Marché de coins PRÉCIS (les favoris) : un favori hors du top affiché doit
 * apparaître quand même. Même format et même cache que `getMarkets`.
 */
export async function getMarketsByIds(vs: string, ids: string[]): Promise<MarketCoin[]> {
  const list = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!list.length) return [];
  const key = `markets:${vs}:ids:${list.slice().sort().join(',')}`;
  const cached = cacheGet<MarketCoin[]>(key);
  if (cached) return cached;
  return once(key, async () => {
    try {
      const res = await withTimeout(
        fetch(
          url(
            `/coins/markets?vs_currency=${vs}&ids=${encodeURIComponent(list.join(','))}&order=market_cap_desc&per_page=${list.length}&page=1&sparkline=true&price_change_percentage=24h`,
          ),
          { headers: headers() },
        ),
        TIMEOUT,
        () => new Error('timeout'),
      );
      const parsed = parseMarkets(await res.json());
      if (parsed.length > 0) cacheSet(key, parsed);
      return parsed.length > 0 ? parsed : cacheGetStale<MarketCoin[]>(key) ?? [];
    } catch (e) {
      console.warn('[coingecko] getMarketsByIds failed', e);
      return cacheGetStale<MarketCoin[]>(key) ?? [];
    }
  });
}
