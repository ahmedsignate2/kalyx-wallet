/**
 * RELAIS RPC (Alchemy, Helius) — la LISTE BLANCHE et les règles de cache.
 *
 * Les clés Alchemy et Helius restent dans le Worker (secrets). Comme pour
 * TonAPI, ce n'est pas un proxy ouvert : seuls les réseaux et les méthodes dont
 * l'app et l'extension ont besoin passent, chaque requête est re-sérialisée,
 * les lots sont bornés.
 *
 * ÉCONOMIE DU QUOTA, à deux étages :
 *  - le Worker (100 000 requêtes / jour en gratuit) : les tokens ERC-20 de
 *    TOUS les réseaux arrivent en UNE requête (`/v1/erc20`), et les clients
 *    gardent leur propre cache ;
 *  - le fournisseur : réponses mises en cache à la périphérie (métadonnées un
 *    jour, soldes 30 s), et un quota épuisé est MÉMORISÉ quelques minutes —
 *    le Worker répond alors tout de suite « quota » sans rappeler le fournisseur,
 *    et les clients passent à leurs replis gratuits (nœuds publics).
 *
 * Fonctions pures, testées sans Cloudflare (`rpc.test.ts`).
 */
import { KNOWN_ERC20_BY_CHAIN } from '../../src/domain/tokens/knownTokens.ts';

/** Réseaux Alchemy servis, et leur identifiant EVM (mêmes réseaux que src/domain/chains/configs.ts). */
export const ALCHEMY_SLUGS: Record<string, number> = {
  'eth-mainnet': 1,
  'bnb-mainnet': 56,
  'polygon-mainnet': 137,
  'base-mainnet': 8453,
  'arb-mainnet': 42161,
  'opt-mainnet': 10,
  'avax-mainnet': 43114,
  'linea-mainnet': 59144,
  'scroll-mainnet': 534352,
  'blast-mainnet': 81457,
  'zksync-mainnet': 324,
  'gnosis-mainnet': 100,
  'mantle-mainnet': 5000,
  'celo-mainnet': 42220,
  'eth-sepolia': 11155111,
  'base-sepolia': 84532,
};

/** Méthodes EVM autorisées. Pas de `eth_getLogs` (coûteux), pas de méthode d'écriture hors diffusion. */
const EVM_METHODS = new Set([
  'alchemy_getTokenBalances',
  'alchemy_getTokenMetadata',
  'alchemy_getAssetTransfers',
  'alchemy_simulateAssetChanges',
  'eth_call',
  'eth_getBalance',
  'eth_blockNumber',
  'eth_chainId',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getCode',
  'eth_getBlockByNumber',
  'eth_sendRawTransaction',
]);

/** Méthodes Solana autorisées (Helius). */
const SOLANA_METHODS = new Set([
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getSignaturesForAddress',
  'getTransaction',
  'getSignatureStatuses',
  'getLatestBlockhash',
  'getFeeForMessage',
  'getMinimumBalanceForRentExemption',
  'getRecentPrioritizationFees',
  'getSlot',
  'getBlockHeight',
  'simulateTransaction',
  'sendTransaction',
  'getAssetsByOwner',
  'getAsset',
]);

const WRITES = new Set(['eth_sendRawTransaction', 'sendTransaction']);

export const MAX_RPC_BYTES = 32 * 1024;
export const MAX_BATCH = 25;

/** Durée de cache (s) d'une méthode, quand sa réponse est la même pour tous et ne périme pas vite. */
const CACHE_SECONDS: Record<string, number> = {
  alchemy_getTokenMetadata: 86_400,
  eth_chainId: 86_400,
  getAsset: 3_600,
};

export type Provider = 'alchemy' | 'helius';

export type RpcRoute = { ok: true; provider: Provider; slug: string } | { ok: false; status: number; error: string };

/** `/rpc/alchemy/<réseau>` ou `/rpc/helius`. */
export function resolveRpc(method: string, pathname: string): RpcRoute {
  if (method !== 'POST') return { ok: false, status: 405, error: 'method not allowed' };
  if (pathname === '/rpc/helius') return { ok: true, provider: 'helius', slug: 'solana-mainnet' };
  const m = pathname.match(/^\/rpc\/alchemy\/([a-z0-9-]{3,32})$/);
  if (m && m[1] in ALCHEMY_SLUGS) return { ok: true, provider: 'alchemy', slug: m[1] };
  return { ok: false, status: 404, error: 'not found' };
}

interface RpcCall {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown;
}

export type SanitizedRpc = { ok: true; body: string; methods: string[]; write: boolean; cacheSeconds: number } | { ok: false; error: string };

/**
 * Corps JSON-RPC : un appel ou un lot (≤ 25), méthodes de la liste blanche
 * seulement, re-sérialisé (aucun champ en plus ne passe).
 */
export function sanitizeRpc(provider: Provider, text: string): SanitizedRpc {
  if (text.length > MAX_RPC_BYTES) return { ok: false, error: 'body too large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid json' };
  }
  const batch = Array.isArray(parsed);
  const list = batch ? (parsed as unknown[]) : [parsed];
  if (!list.length || list.length > MAX_BATCH) return { ok: false, error: 'bad batch size' };
  const allowed = provider === 'alchemy' ? EVM_METHODS : SOLANA_METHODS;
  const out: RpcCall[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'invalid call' };
    const { id, method, params } = c as Record<string, unknown>;
    if (typeof method !== 'string' || !allowed.has(method)) return { ok: false, error: 'method not allowed' };
    if (!(id === null || typeof id === 'number' || (typeof id === 'string' && id.length <= 64))) return { ok: false, error: 'invalid id' };
    if (params !== undefined && !Array.isArray(params) && (typeof params !== 'object' || params === null)) return { ok: false, error: 'invalid params' };
    out.push({ jsonrpc: '2.0', id: id as RpcCall['id'], method, ...(params !== undefined ? { params } : {}) });
  }
  const methods = out.map((c) => c.method);
  const write = methods.some((m) => WRITES.has(m));
  // Un lot n'est mis en cache que si TOUTES ses méthodes le permettent (et pour la plus courte durée).
  const ttl = methods.map((m) => CACHE_SECONDS[m] ?? 0);
  const cacheSeconds = write ? 0 : Math.min(...ttl);
  return { ok: true, body: JSON.stringify(batch ? out : out[0]), methods, write, cacheSeconds };
}

/** URL amont, clé comprise (jamais renvoyée au client). */
export function upstreamUrl(provider: Provider, slug: string, keys: { alchemy?: string; helius?: string }): string | null {
  if (provider === 'alchemy') return keys.alchemy ? `https://${slug}.g.alchemy.com/v2/${keys.alchemy}` : null;
  return keys.helius ? `https://mainnet.helius-rpc.com/?api-key=${keys.helius}` : null;
}

/**
 * Réponse amont qui signale un QUOTA (et non une erreur de la requête) :
 * HTTP 429, ou un message « capacity / limit exceeded ». Rend la durée de
 * pause à mémoriser : courte pour un débit (429 ponctuel), longue pour une
 * capacité mensuelle épuisée.
 */
export function quotaPause(status: number, text: string): number {
  if (/capacity|monthly|compute units|credits? (?:exceeded|exhausted)|plan limit/i.test(text)) return 3_600;
  if (status === 429 || /rate.?limit|too many requests/i.test(text)) return 60;
  return 0;
}

/** Adresse EVM. */
export const isEvmAddress = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

export type Erc20Request = { ok: true; address: string; slugs: string[] } | { ok: false; error: string };

/** `/v1/erc20` : `{ address, chains: [réseaux Alchemy] }`. */
export function parseErc20Request(text: string): Erc20Request {
  if (text.length > 4096) return { ok: false, error: 'body too large' };
  let b: unknown;
  try {
    b = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid json' };
  }
  const { address, chains } = (b ?? {}) as { address?: unknown; chains?: unknown };
  if (!isEvmAddress(address)) return { ok: false, error: 'invalid address' };
  if (!Array.isArray(chains) || !chains.length || chains.length > 16) return { ok: false, error: 'invalid chains' };
  const slugs = [...new Set(chains)].filter((c): c is string => typeof c === 'string' && c in ALCHEMY_SLUGS);
  if (slugs.length !== new Set(chains).size) return { ok: false, error: 'unknown chain' };
  return { ok: true, address: address.toLowerCase(), slugs: slugs.sort() };
}

/** Le lot de soldes d'un réseau : énumération ERC-20 et tokens connus, en UNE requête amont. */
export function balancesBatch(slug: string, address: string): string {
  const known = KNOWN_ERC20_BY_CHAIN[ALCHEMY_SLUGS[slug]] ?? [];
  const calls: RpcCall[] = [{ jsonrpc: '2.0', id: 0, method: 'alchemy_getTokenBalances', params: [address, 'erc20'] }];
  if (known.length) calls.push({ jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, known] });
  return JSON.stringify(calls);
}

/** Contrats à solde non nul d'une réponse de lot (tokens connus d'abord, sans doublon, plafonnés). */
export function nonZeroContracts(reply: unknown, max = 60): { contract: string; raw: string }[] {
  const res = Array.isArray(reply) ? [...reply].sort((a, b) => Number((b as { id?: number })?.id ?? 0) - Number((a as { id?: number })?.id ?? 0)) : [];
  const seen = new Set<string>();
  const out: { contract: string; raw: string }[] = [];
  for (const r of res) {
    const list = (r as { result?: { tokenBalances?: { contractAddress?: unknown; tokenBalance?: unknown }[] } })?.result?.tokenBalances;
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      if (typeof t.contractAddress !== 'string' || typeof t.tokenBalance !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(t.tokenBalance)) continue;
      const raw = BigInt(t.tokenBalance);
      const c = t.contractAddress.toLowerCase();
      if (raw === 0n || seen.has(c)) continue;
      seen.add(c);
      out.push({ contract: c, raw: raw.toString() });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Le lot de métadonnées des contrats trouvés. */
export function metadataBatch(contracts: string[]): string {
  return JSON.stringify(contracts.map((c, i) => ({ jsonrpc: '2.0', id: i, method: 'alchemy_getTokenMetadata', params: [c] })));
}

export interface RelayToken {
  contract: string;
  raw: string;
  name: string;
  symbol: string;
  decimals: number;
  logo?: string;
}

/** Assemble soldes et métadonnées ; un token sans métadonnées lisibles est écarté (jamais deviné). */
export function joinTokens(balances: { contract: string; raw: string }[], metaReply: unknown): RelayToken[] {
  const byId = new Map<number, Record<string, unknown>>();
  if (Array.isArray(metaReply)) for (const r of metaReply) if (r && typeof (r as { id?: unknown }).id === 'number') byId.set((r as { id: number }).id, ((r as { result?: Record<string, unknown> }).result ?? {}) as Record<string, unknown>);
  const out: RelayToken[] = [];
  balances.forEach((b, i) => {
    const m = byId.get(i);
    if (!m) return;
    const decimals = typeof m.decimals === 'number' ? m.decimals : NaN;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return;
    const symbol = typeof m.symbol === 'string' ? m.symbol.slice(0, 32) : '';
    if (!symbol) return;
    const name = typeof m.name === 'string' ? m.name.slice(0, 64) : symbol;
    const logo = typeof m.logo === 'string' && /^https:\/\//.test(m.logo) ? m.logo.slice(0, 300) : undefined;
    out.push({ contract: b.contract, raw: b.raw, name, symbol, decimals, ...(logo ? { logo } : {}) });
  });
  return out;
}

/** Origine d'une extension autorisée (`chrome-extension://<id>`) ; `*` pendant la bêta (identifiants non fixés). */
export function extensionAllowed(origin: string, allowed: string | undefined): boolean {
  const m = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
  if (!m) return false;
  const ids = (allowed ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes('*') || ids.includes(m[1]);
}
