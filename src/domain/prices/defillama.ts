/**
 * Prix de jetons par DefiLlama (`coins.llama.fi`) : TOUS les jetons de tous les
 * réseaux en UNE requête, sans clé.
 *
 * Pourquoi : le portefeuille demandait le prix des jetons à CoinGecko réseau par
 * réseau — 14 appels à chaque chargement. Mesuré le 27/09 : sur une rafale de 14,
 * CoinGecko en refuse 9 (HTTP 429). Les jetons restaient sans prix, donc à 0 —
 * rangés dans « petits soldes » — et le chargement traînait. DefiLlama a servi
 * la même rafale sans un refus, en 0,6 s pour tout le lot.
 *
 * Prix en DOLLARS seulement : la conversion dans la devise de l'utilisateur se
 * fait avec le cours de l'USDT, déjà demandé à CoinGecko avec les pièces
 * natives.
 *
 * `confidence` : DefiLlama cote aussi des jetons illiquides d'après un pool de
 * DEX — c'est ainsi qu'un jeton d'arnaque obtiendrait un « prix ». Sous
 * MIN_CONFIDENCE, le prix est ignoré : un prix sert aussi de preuve qu'un jeton
 * est réel (`verified`).
 */

/** Réseau Kalyx → nom de réseau DefiLlama, vérifié le 27/09 avec un jeton réel de chacun. */
export const LLAMA_CHAIN: Readonly<Record<string, string>> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  avalanche: 'avax',
  base: 'base',
  blast: 'blast',
  bnb: 'bsc',
  celo: 'celo',
  gnosis: 'xdai',
  linea: 'linea',
  mantle: 'mantle',
  optimism: 'optimism',
  polygon: 'polygon',
  scroll: 'scroll',
  zksync: 'era',
  solana: 'solana',
};

export const MIN_CONFIDENCE = 0.9;
/** Jetons par requête : l'URL reste loin des limites des serveurs. */
const CHUNK = 60;
const TIMEOUT_MS = 8_000;

export interface TokenRef {
  /** Réseau Kalyx, ou `coingecko` pour une pièce désignée par son identifiant CoinGecko. */
  chainId: string;
  /** Contrat ERC-20, mint Solana, ou identifiant CoinGecko (« ethereum »). */
  address: string;
}

/** Clé du résultat : `${chainId}:${adresse}` (EVM en minuscules, Solana tel quel). */
export function llamaKey(chainId: string, address: string): string {
  return `${chainId}:${chainId === 'solana' ? address : address.toLowerCase()}`;
}

/**
 * Taux 1 USD → devise, par Frankfurter (taux de la BCE, sans clé), pour
 * convertir les prix DefiLlama quand CoinGecko ne répond pas. Gardé 6 h en
 * mémoire ; le dernier taux connu sert si le service est muet.
 */
const FX_TTL_MS = 6 * 3600_000;
const fxCache = new Map<string, { at: number; rate: number }>();

export async function getUsdFxRate(fiat: string, fetchFn: FetchLike = (u, i) => fetch(u, i)): Promise<number> {
  const cur = fiat.toUpperCase();
  if (cur === 'USD') return 1;
  if (!/^[A-Z]{3}$/.test(cur)) return 0;
  const hit = fxCache.get(cur);
  if (hit && Date.now() - hit.at < FX_TTL_MS) return hit.rate;
  try {
    const res = await fetchFn(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${cur}`);
    const rate = res.ok ? Number(((await res.json()) as { rates?: Record<string, unknown> })?.rates?.[cur]) : NaN;
    if (Number.isFinite(rate) && rate > 0) {
      fxCache.set(cur, { at: Date.now(), rate });
      return rate;
    }
  } catch {
    /* dernier taux connu ci-dessous */
  }
  return hit?.rate ?? 0;
}

function coinId(t: TokenRef): string | null {
  // DefiLlama cote aussi par identifiant CoinGecko : c'est ainsi qu'on price les pièces natives.
  if (t.chainId === 'coingecko') return /^[a-z0-9-]+$/.test(t.address) ? `coingecko:${t.address}` : null;
  const chain = LLAMA_CHAIN[t.chainId];
  return chain ? `${chain}:${t.chainId === 'solana' ? t.address : t.address.toLowerCase()}` : null;
}

/** Réponse `/prices/current/…` → prix USD par `coinId`, confiance filtrée. */
export function parseLlamaPrices(json: unknown): Record<string, number> {
  const coins = (json as { coins?: Record<string, { price?: unknown; confidence?: unknown }> } | null)?.coins;
  const out: Record<string, number> = {};
  if (!coins || typeof coins !== 'object') return out;
  for (const [id, c] of Object.entries(coins)) {
    const price = Number(c?.price);
    const confidence = c?.confidence == null ? 1 : Number(c.confidence);
    if (Number.isFinite(price) && price > 0 && confidence >= MIN_CONFIDENCE) out[id] = price;
  }
  return out;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Prix USD des jetons, clés `llamaKey`. Un lot en échec n'annule pas les autres ;
 * un jeton sans prix fiable est simplement absent.
 */
export async function getLlamaTokenPricesUsd(tokens: TokenRef[], fetchFn: FetchLike = (u, i) => fetch(u, i)): Promise<Record<string, number>> {
  const ids = new Map<string, string>();
  for (const t of tokens) {
    const id = coinId(t);
    if (id) ids.set(id, llamaKey(t.chainId, t.address));
  }
  const all = [...ids.keys()];
  const out: Record<string, number> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += CHUNK) chunks.push(all.slice(i, i + CHUNK));
  await Promise.all(
    chunks.map(async (chunk) => {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), TIMEOUT_MS);
      try {
        const res = await fetchFn(`https://coins.llama.fi/prices/current/${chunk.join(',')}`, ctrl ? { signal: ctrl.signal } : undefined);
        if (!res.ok) return;
        for (const [id, price] of Object.entries(parseLlamaPrices(await res.json()))) {
          const key = ids.get(id);
          if (key) out[key] = price;
        }
      } catch {
        /* lot perdu : ces jetons restent sans prix */
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return out;
}
