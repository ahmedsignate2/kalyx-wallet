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
    return parseMarkets(await res.json());
  } catch {
    return [];
  }
}
