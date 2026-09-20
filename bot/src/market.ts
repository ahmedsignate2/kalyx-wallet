/** Prix (CoinGecko → DefiLlama/Binance, cache KV 60 s) et gas (PublicNode, cache 60 s). */
import { fetchJson, type Env } from './env';

const CG = 'https://api.coingecko.com/api/v3';

/** Symboles courants → id CoinGecko ; sinon on tente l'entrée telle quelle comme id. */
const SYMBOLS: Record<string, string> = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin', matic: 'matic-network', pol: 'matic-network',
  arb: 'arbitrum', op: 'optimism', avax: 'avalanche-2', usdc: 'usd-coin', usdt: 'tether', link: 'chainlink',
  doge: 'dogecoin', ada: 'cardano', xrp: 'ripple', ton: 'the-open-network', dot: 'polkadot', ltc: 'litecoin',
  uni: 'uniswap', aave: 'aave', pepe: 'pepe', wif: 'dogwifcoin', bonk: 'bonk', jup: 'jupiter-exchange-solana',
};

export interface CoinPrice { id: string; symbol: string; name: string; price: number; change24h: number; marketCap: number }

export function resolveCoinId(q: string): string {
  const k = q.trim().toLowerCase().replace(/^\$/, '');
  return SYMBOLS[k] ?? k;
}

/** Prix : CoinGecko d'abord (24 h + capitalisation), sinon DefiLlama (prix, sans clé,
 *  très tolérant) + Binance pour la variation 24 h. Depuis les IP Cloudflare,
 *  CoinGecko gratuit répond souvent 429/403 : le repli est la voie normale. */
export async function getPrice(env: Env, id: string, fiat = 'usd'): Promise<CoinPrice | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(id)) return null;
  const key = `price:${id}:${fiat}`;
  const cached = await env.CACHE.get(key);
  if (cached) return JSON.parse(cached) as CoinPrice;
  let out: CoinPrice | null = null;
  try {
    type Row = { id: string; symbol: string; name: string; current_price: number; price_change_percentage_24h: number | null; market_cap: number };
    const rows = await fetchJson<Row[]>(`${CG}/coins/markets?vs_currency=${fiat}&ids=${encodeURIComponent(id)}&price_change_percentage=24h`, undefined, 5000);
    const r = rows[0];
    if (r) out = { id: r.id, symbol: r.symbol.toUpperCase(), name: r.name, price: r.current_price, change24h: r.price_change_percentage_24h ?? 0, marketCap: r.market_cap ?? 0 };
  } catch {
    /* repli ci-dessous */
  }
  if (!out) {
    const llama = await llamaPrices([id]).catch(() => ({} as Record<string, { price: number; symbol: string }>));
    const l = llama[id];
    if (!l) return null;
    let change24h = 0;
    try {
      const b = await fetchJson<{ priceChangePercent: string }>(`https://api.binance.com/api/v3/ticker/24hr?symbol=${l.symbol.toUpperCase()}USDT`, undefined, 4000);
      change24h = Number(b.priceChangePercent) || 0;
    } catch {
      /* pas de paire Binance : variation inconnue */
    }
    out = { id, symbol: l.symbol.toUpperCase(), name: l.symbol.toUpperCase(), price: fiat === 'usd' ? l.price : l.price, change24h, marketCap: 0 };
  }
  await env.CACHE.put(key, JSON.stringify(out), { expirationTtl: 60 });
  return out;
}

async function llamaPrices(ids: string[]): Promise<Record<string, { price: number; symbol: string }>> {
  type Resp = { coins: Record<string, { price: number; symbol: string }> };
  const data = await fetchJson<Resp>(`https://coins.llama.fi/prices/current/${ids.map((i) => `coingecko:${i}`).join(',')}`, undefined, 6000);
  const out: Record<string, { price: number; symbol: string }> = {};
  for (const [k, v] of Object.entries(data.coins ?? {})) out[k.replace(/^coingecko:/, '')] = { price: v.price, symbol: v.symbol };
  return out;
}

/** Plusieurs ids d'un coup (cron des alertes, gas) — CoinGecko puis DefiLlama. */
export async function getPrices(env: Env, ids: string[], fiat = 'usd'): Promise<Record<string, number>> {
  if (!ids.length) return {};
  try {
    type Resp = Record<string, Record<string, number>>;
    const data = await fetchJson<Resp>(`${CG}/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=${fiat}`, undefined, 5000);
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(data)) if (typeof v?.[fiat] === 'number') out[id] = v[fiat];
    if (Object.keys(out).length) return out;
  } catch {
    /* repli */
  }
  const llama = await llamaPrices(ids);
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(llama)) out[id] = v.price; // DefiLlama = USD
  return out;
}

export function fmtFiat(v: number, fiat = 'usd', lang = 'en'): string {
  try {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: fiat.toUpperCase(), maximumFractionDigits: v < 1 ? 6 : 2 }).format(v);
  } catch {
    return `${v} ${fiat.toUpperCase()}`;
  }
}
export function fmtCompact(v: number, lang = 'en'): string {
  try {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'USD' }).format(v);
  } catch {
    return String(v);
  }
}

/* ------------------------------------------------------------------ Gas */

// PublicNode partout : les RPC « officiels » (mainnet.base.org, polygon-rpc.com)
// refusent les requêtes depuis les IP Cloudflare.
const EVM_RPCS: { name: string; url: string; coin: string }[] = [
  { name: 'Ethereum', url: 'https://ethereum-rpc.publicnode.com', coin: 'ethereum' },
  { name: 'Base', url: 'https://base-rpc.publicnode.com', coin: 'ethereum' },
  { name: 'Arbitrum', url: 'https://arbitrum-one-rpc.publicnode.com', coin: 'ethereum' },
  { name: 'Polygon', url: 'https://polygon-bor-rpc.publicnode.com', coin: 'matic-network' },
  { name: 'BNB Chain', url: 'https://bsc-rpc.publicnode.com', coin: 'binancecoin' },
];
const TRANSFER_GAS = 21_000;

export interface GasRow { name: string; gwei: number | null; usdTransfer: number | null }

export async function getGas(env: Env): Promise<{ evm: GasRow[]; solanaPriority: number | null }> {
  const cached = await env.CACHE.get('gas');
  if (cached) return JSON.parse(cached);
  const prices = await getPrices(env, ['ethereum', 'matic-network', 'binancecoin']).catch(() => ({} as Record<string, number>));
  const evm = await Promise.all(EVM_RPCS.map(async (c): Promise<GasRow> => {
    try {
      const r = await fetchJson<{ result?: string }>(c.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }) }, 5000);
      const wei = r.result ? Number(BigInt(r.result)) : NaN;
      if (!Number.isFinite(wei)) return { name: c.name, gwei: null, usdTransfer: null };
      const gwei = wei / 1e9;
      const price = prices[c.coin];
      const usd = price ? (wei * TRANSFER_GAS / 1e18) * price : null;
      return { name: c.name, gwei, usdTransfer: usd };
    } catch {
      return { name: c.name, gwei: null, usdTransfer: null };
    }
  }));
  let solanaPriority: number | null = null;
  try {
    const r = await fetchJson<{ result?: { prioritizationFee: number }[] }>('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [[]] }) }, 5000);
    const fees = (r.result ?? []).map((x) => x.prioritizationFee).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (fees.length) solanaPriority = fees[Math.floor(fees.length * 0.75)];
  } catch {
    solanaPriority = null;
  }
  const out = { evm, solanaPriority };
  await env.CACHE.put('gas', JSON.stringify(out), { expirationTtl: 60 });
  return out;
}
