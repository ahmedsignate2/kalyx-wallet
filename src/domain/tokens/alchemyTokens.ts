/**
 * Détection des tokens ERC-20 détenus via l'Alchemy Token API (JSON-RPC).
 *
 * Lecture seule : on ne touche JAMAIS la seed ni la signature. On liste les
 * soldes de tokens d'une adresse, on récupère les métadonnées, on filtre le spam.
 * Nécessite une clé Alchemy (endpoint *.alchemy.com dans les RPC de la chaîne) ;
 * sinon on renvoie [] proprement.
 */
import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';

const TIMEOUT = 10_000;

export interface Erc20Token {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  logo?: string;
  raw: bigint;
}

export interface TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  logo?: string;
}

/** Parse alchemy_getTokenBalances → contrats avec solde non nul. */
export function parseTokenBalances(json: unknown): { contract: string; raw: bigint }[] {
  const list = (json as { result?: { tokenBalances?: { contractAddress?: string; tokenBalance?: string }[] } })
    ?.result?.tokenBalances;
  if (!Array.isArray(list)) return [];
  const out: { contract: string; raw: bigint }[] = [];
  for (const t of list) {
    if (!t || typeof t.contractAddress !== 'string') continue;
    let raw = 0n;
    try {
      raw = BigInt(t.tokenBalance || '0x0');
    } catch {
      raw = 0n;
    }
    if (raw > 0n) out.push({ contract: t.contractAddress, raw });
  }
  return out;
}

/** Parse alchemy_getTokenMetadata. */
export function parseTokenMetadata(json: unknown): TokenMeta | null {
  const r = (json as { result?: { name?: string; symbol?: string; decimals?: number; logo?: string } })?.result;
  if (!r) return null;
  return {
    name: r.name ?? '',
    symbol: r.symbol ?? '',
    decimals: typeof r.decimals === 'number' ? r.decimals : 0,
    logo: r.logo ?? undefined,
  };
}

/** Heuristique anti-spam (tokens d'arnaque : URLs, "claim", décimales absurdes…). */
export function isSpamToken(m: TokenMeta): boolean {
  if (!m.symbol || !m.name) return true;
  const s = `${m.symbol} ${m.name}`;
  if (/(https?:\/\/|www\.|\.com|\.io|\.xyz|\.org|\.app|claim|reward|airdrop|voucher|visit|t\.me|discord|\$\s?\d)/i.test(s)) {
    return true;
  }
  if (m.symbol.length > 12) return true;
  if (!Number.isFinite(m.decimals) || m.decimals < 0 || m.decimals > 36) return true;
  return false;
}

function alchemyUrlOf(chain: ChainConfig): string | undefined {
  return chain.rpcUrls.find((u) => u.includes('.alchemy.com'));
}

async function post(url: string, body: unknown): Promise<unknown> {
  const res = await withTimeout(
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    TIMEOUT,
    () => new Error('timeout'),
  );
  return res.json();
}

/** Liste les tokens ERC-20 détenus (non-spam) d'une adresse sur une chaîne. */
export async function getErc20Tokens(chain: ChainConfig, address: string): Promise<Erc20Token[]> {
  const url = alchemyUrlOf(chain);
  if (!url) return []; // pas de clé Alchemy -> feature indisponible, dégrade en vide
  try {
    const balJson = await post(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [address],
    });
    const balances = parseTokenBalances(balJson).slice(0, 40);
    if (balances.length === 0) return [];

    // Métadonnées en une requête JSON-RPC batch.
    const batch = balances.map((b, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'alchemy_getTokenMetadata',
      params: [b.contract],
    }));
    const metaJson = await post(url, batch);
    const metaById = new Map<number, TokenMeta | null>();
    if (Array.isArray(metaJson)) {
      for (const m of metaJson as { id: number }[]) metaById.set(m.id, parseTokenMetadata(m));
    }

    const tokens: Erc20Token[] = [];
    balances.forEach((b, i) => {
      const meta = metaById.get(i);
      if (!meta || isSpamToken(meta)) return;
      tokens.push({ contract: b.contract, name: meta.name, symbol: meta.symbol, decimals: meta.decimals, logo: meta.logo, raw: b.raw });
    });
    return tokens;
  } catch {
    return [];
  }
}
