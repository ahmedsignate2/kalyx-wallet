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
      thumb: c.thumb ?? c.large ?? '',
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
    change24h: c.market_data?.price_change_percentage_24h ?? 0,
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

// ---- Fetch réseau (dégrade en vide) ----

function url(path: string): string {
  return `${API}${path}${path.includes('?') ? '&' : '?'}${KEY ? `x_cg_demo_api_key=${KEY}` : ''}`;
}

export async function getPrices(ids: string[], vs = 'eur'): Promise<Record<string, CoinPrice>> {
  if (ids.length === 0) return {};
  try {
    const res = await withTimeout(
      fetch(url(`/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}&include_24hr_change=true`)),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseSimplePrices(await res.json(), vs);
  } catch {
    return {};
  }
}

export async function getCoinDetail(id: string, vs = 'eur', lang = 'en'): Promise<CoinDetail | null> {
  try {
    const res = await withTimeout(
      fetch(
        url(
          `/coins/${id}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
        ),
      ),
      TIMEOUT,
      () => new Error('timeout'),
    );
    const json = await res.json();
    if (!res.ok) {
      // Retiré du bundle de prod par babel-plugin-transform-remove-console — diagnostic dev uniquement.
      console.warn('[coingecko] getCoinDetail HTTP', res.status, id, json);
    }
    return parseCoinDetail(json, vs, lang);
  } catch (e) {
    console.warn('[coingecko] getCoinDetail failed', id, e);
    return null;
  }
}

export async function getMarketChart(id: string, vs = 'eur', days = '7'): Promise<number[]> {
  try {
    const res = await withTimeout(
      fetch(url(`/coins/${id}/market_chart?vs_currency=${vs}&days=${days}`)),
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
  try {
    const res = await withTimeout(
      fetch(url(`/coins/${id}/market_chart?vs_currency=${vs}&days=${days}`)),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseMarketChartPoints(await res.json());
  } catch {
    return [];
  }
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
  try {
    const res = await withTimeout(
      fetch(url(`/simple/token_price/${platform}?contract_addresses=${contracts.join(',')}&vs_currencies=${vs}`)),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseTokenPrices(await res.json(), vs);
  } catch {
    return {};
  }
}

export async function getMarkets(vs = 'eur', perPage = 20): Promise<MarketCoin[]> {
  try {
    const res = await withTimeout(
      fetch(
        url(
          `/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=true&price_change_percentage=24h`,
        ),
      ),
      TIMEOUT,
      () => new Error('timeout'),
    );
    const json = await res.json();
    if (!res.ok) console.warn('[coingecko] getMarkets HTTP', res.status, json);
    return parseMarkets(json);
  } catch (e) {
    console.warn('[coingecko] getMarkets failed', e);
    return [];
  }
}
