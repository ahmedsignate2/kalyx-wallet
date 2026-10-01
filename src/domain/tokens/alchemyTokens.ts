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
import { knownTokensFor } from './knownTokens';

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
  if (!res.ok) throw new Error(`Alchemy : HTTP ${res.status}`);
  return res.json();
}

/** Métadonnées d'un contrat ERC-20 (pour valider un token ajouté manuellement). */
export async function getTokenMetadata(chain: ChainConfig, contract: string): Promise<TokenMeta | null> {
  const url = alchemyUrlOf(chain);
  if (!url) return null;
  try {
    return parseTokenMetadata(
      await post(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [contract] }),
    );
  } catch {
    return null;
  }
}

/** Soldes de contrats précis (custom) : garde même les soldes nuls, pas de filtre spam. */
export async function getCustomTokens(
  chain: ChainConfig,
  address: string,
  contracts: string[],
): Promise<Erc20Token[]> {
  const url = alchemyUrlOf(chain);
  if (!url || contracts.length === 0) return [];
  try {
    const balJson = (await post(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [address, contracts],
    })) as { result?: { tokenBalances?: { contractAddress?: string; tokenBalance?: string }[] } };
    const balMap = new Map<string, bigint>();
    for (const b of balJson?.result?.tokenBalances ?? []) {
      if (!b?.contractAddress) continue;
      let raw = 0n;
      try {
        raw = BigInt(b.tokenBalance || '0x0');
      } catch {
        raw = 0n;
      }
      balMap.set(b.contractAddress.toLowerCase(), raw);
    }

    const batch = contracts.map((c, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'alchemy_getTokenMetadata',
      params: [c],
    }));
    const metaJson = await post(url, batch);
    const metaById = new Map<number, TokenMeta | null>();
    if (Array.isArray(metaJson)) for (const m of metaJson as { id: number }[]) metaById.set(m.id, parseTokenMetadata(m));

    const out: Erc20Token[] = [];
    contracts.forEach((c, i) => {
      const meta = metaById.get(i);
      if (!meta || !meta.symbol) return;
      out.push({ contract: c, name: meta.name, symbol: meta.symbol, decimals: meta.decimals, logo: meta.logo, raw: balMap.get(c.toLowerCase()) ?? 0n });
    });
    return out;
  } catch {
    return [];
  }
}

// Bornes de coût/qualité. Un compte noyé sous les airdrops spam peut avoir des
// centaines de contrats : on PAGINE (sinon les vrais tokens au-delà de la 1re page
// sont invisibles) mais on borne le nombre de pages, et on plafonne les tokens
// AFFICHÉS *après* le filtre anti-spam (sinon le spam consommerait le budget et
// masquerait des tokens légitimes — bug de l'ancien slice(0,40) avant filtrage).
const MAX_BALANCE_PAGES = 5; // ~500 contrats scannés au plus
const META_CHUNK = 100; // lots de métadonnées (batch JSON-RPC)
const MAX_TOKENS = 60; // tokens non-spam affichés au plus

/** pageKey de pagination d'une réponse alchemy_getTokenBalances (ou undefined). */
export function pageKeyOf(json: unknown): string | undefined {
  const k = (json as { result?: { pageKey?: string } })?.result?.pageKey;
  return typeof k === 'string' && k ? k : undefined;
}

/** Liste les tokens ERC-20 détenus (non-spam) d'une adresse sur une chaîne. */
/**
 * Réponse Alchemy exploitable, sinon exception. Un refus (HTTP 429, `error`
 * JSON-RPC) n'est PAS « aucun jeton » : confondre les deux faisait disparaître
 * les jetons de l'accueil au moindre refus, puis réapparaître au chargement
 * suivant.
 */
function assertOk(json: unknown, what: string): void {
  const items = Array.isArray(json) ? json : [json];
  if (items.length === 0 || items.some((j) => !j || typeof j !== 'object' || 'error' in (j as object))) {
    throw new Error(`Alchemy : ${what} refusé`);
  }
}

/** Jetons ERC-20 détenus ; ne lève jamais (vide en cas d'échec). Voir `getErc20TokensStrict`. */
export async function getErc20Tokens(chain: ChainConfig, address: string): Promise<Erc20Token[]> {
  return getErc20TokensStrict(chain, address).catch(() => []);
}

/**
 * Jetons ERC-20 détenus, en LEVANT si Alchemy n'a pas répondu proprement : le
 * portefeuille distingue ainsi « aucun jeton » de « lecture impossible », et
 * garde dans le second cas les jetons déjà connus.
 */
export async function getErc20TokensStrict(chain: ChainConfig, address: string): Promise<Erc20Token[]> {
  const url = alchemyUrlOf(chain);
  if (!url) return []; // pas de clé Alchemy -> feature indisponible, dégrade en vide
  {
    // 1. Soldes non nuls, paginés (borné). Type 'erc20' explicite sur chaque page.
    const enumerated: { contract: string; raw: bigint }[] = [];
    let pageKey: string | undefined;
    for (let page = 0; page < MAX_BALANCE_PAGES; page++) {
      const params: unknown[] = pageKey ? [address, 'erc20', { pageKey }] : [address, 'erc20'];
      const balJson = await post(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params });
      assertOk(balJson, 'soldes');
      enumerated.push(...parseTokenBalances(balJson));
      pageKey = pageKeyOf(balJson);
      if (!pageKey) break;
    }

    // 1b. Tokens « connus » (USDC/USDT/DAI/WETH…) interrogés EXPLICITEMENT : l'énumération
    // 'erc20' les rate parfois (ex. USDC sur Base). Garantit qu'ils apparaissent si détenus.
    const have = new Set(enumerated.map((b) => b.contract.toLowerCase()));
    const knownMissing = knownTokensFor(chain.evmChainId).filter((c) => !have.has(c.toLowerCase()));
    let known: { contract: string; raw: bigint }[] = [];
    if (knownMissing.length) {
      const kJson = await post(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, knownMissing] });
      assertOk(kJson, 'soldes connus');
      known = parseTokenBalances(kJson); // ne garde que les soldes non nuls
    }

    // Tokens connus en tête (jamais évincés par le plafond), puis l'énumération.
    const balances = [...known, ...enumerated];
    if (balances.length === 0) return [];

    // 2. Métadonnées par lots, spam filtré, plafond appliqué APRÈS filtrage.
    const tokens: Erc20Token[] = [];
    for (let i = 0; i < balances.length && tokens.length < MAX_TOKENS; i += META_CHUNK) {
      const chunk = balances.slice(i, i + META_CHUNK);
      const batch = chunk.map((b, j) => ({
        jsonrpc: '2.0',
        id: j,
        method: 'alchemy_getTokenMetadata',
        params: [b.contract],
      }));
      const metaJson = await post(url, batch);
      assertOk(metaJson, 'métadonnées');
      const metaById = new Map<number, TokenMeta | null>();
      if (Array.isArray(metaJson)) {
        for (const m of metaJson as { id: number }[]) metaById.set(m.id, parseTokenMetadata(m));
      }
      for (let j = 0; j < chunk.length && tokens.length < MAX_TOKENS; j++) {
        const meta = metaById.get(j);
        if (!meta || isSpamToken(meta)) continue;
        const b = chunk[j];
        tokens.push({ contract: b.contract, name: meta.name, symbol: meta.symbol, decimals: meta.decimals, logo: meta.logo, raw: b.raw });
      }
    }
    return tokens;
  }
}

/**
 * L'adresse détient-elle AU MOINS UN jeton ERC-20 (solde non nul) ? Pour la
 * recherche des comptes : un compte qui n'a fait que RECEVOIR des jetons (nonce
 * 0, aucun natif) n'est pas vide. Une requête Alchemy si une clé existe, sinon
 * `balanceOf` sur les jetons connus (USDC, USDT, DAI, WETH…). Lève si la
 * lecture échoue : « inconnu », jamais « non ».
 */
export async function hasAnyErc20Balance(
  chain: ChainConfig,
  address: string,
  balanceOfStrict: (token: string, owner: string) => Promise<bigint>,
): Promise<boolean> {
  const url = alchemyUrlOf(chain);
  const known = knownTokensFor(chain.evmChainId);
  if (url) {
    try {
      const json = await post(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, 'erc20'] });
      assertOk(json, 'soldes');
      if (parseTokenBalances(json).length > 0) return true;
      // L'énumération rate parfois les jetons connus (USDC sur Base) : une requête de plus, explicite.
      if (!known.length) return false;
      const k = await post(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, known] });
      assertOk(k, 'soldes connus');
      return parseTokenBalances(k).length > 0;
    } catch {
      /* Alchemy muet : repli sur balanceOf, ci-dessous */
    }
  }
  // Ni Alchemy ni liste de jetons connus pour ce réseau : on ne SAIT pas (jamais « non »).
  if (!known.length) throw new Error('Jetons de ce réseau illisibles');
  const balances = await Promise.all(known.map((t) => balanceOfStrict(t, address)));
  return balances.some((b) => b > 0n);
}
