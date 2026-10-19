/**
 * REPLI GRATUIT des tokens ERC-20 : les tokens PRINCIPAUX de chaque réseau
 * (knownTokens : USDC, USDT, DAI, WETH…) lus directement sur le contrat
 * (`balanceOf`, `decimals`, `symbol`) par les nœuds publics — sans indexeur,
 * sans clé, sans relais.
 *
 * Utilisé quand Alchemy n'est pas joignable (pas de clé, relais en pause sur
 * quota). La liste est alors RÉDUITE aux tokens principaux, jamais inventée :
 * un solde qui ne peut pas être lu fait échouer le réseau, il n'est pas mis à 0.
 */
import { Interface } from 'ethers';
import { getAdapter } from '../chains/registry';
import type { EvmChainAdapter } from '../chains/EvmChainAdapter';
import type { ChainConfig } from '../chains/types';
import { knownTokensFor } from './knownTokens';
import type { Erc20Token } from './alchemyTokens';

const META = new Interface(['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)']);

/** Métadonnées lues sur le contrat, gardées pour la session (elles ne changent pas). */
const metaCache = new Map<string, { symbol: string; name: string; decimals: number }>();

function decodeString(fn: 'symbol' | 'name', hex: string): string {
  try {
    return String(META.decodeFunctionResult(fn, hex)[0]);
  } catch {
    // Anciens contrats (MKR…) : bytes32 au lieu d'une chaîne.
    const raw = hex.replace(/^0x/, '').slice(0, 64).replace(/(00)+$/, '');
    return raw ? new TextDecoder().decode(Uint8Array.from(raw.match(/../g)!.map((x) => Number.parseInt(x, 16)))) : '';
  }
}

const clean = (s: string, max: number) => s.replace(/[^\p{L}\p{N} .$_-]/gu, '').trim().slice(0, max);

async function readMeta(a: EvmChainAdapter, chainId: string, token: string) {
  const k = `${chainId}:${token.toLowerCase()}`;
  const hit = metaCache.get(k);
  if (hit) return hit;
  const [d, s, n] = await Promise.all([
    a.callContract(token, META.encodeFunctionData('decimals')),
    a.callContract(token, META.encodeFunctionData('symbol')),
    a.callContract(token, META.encodeFunctionData('name')).catch(() => '0x'),
  ]);
  const decimals = Number(BigInt(d));
  const symbol = clean(decodeString('symbol', s), 12);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !symbol) throw new Error('métadonnées illisibles');
  const meta = { symbol, name: clean(decodeString('name', n), 48) || symbol, decimals };
  metaCache.set(k, meta);
  return meta;
}

/** Tokens principaux détenus sur un réseau EVM, lus sur les nœuds publics. */
export async function getKnownErc20Tokens(chain: ChainConfig, address: string): Promise<Erc20Token[]> {
  const known = knownTokensFor(chain.evmChainId);
  if (!known.length) return [];
  const a = getAdapter(chain.id) as EvmChainAdapter;
  // Strict : une réponse illisible fait échouer le réseau (jamais un faux 0).
  const balances = await Promise.all(known.map(async (contract) => ({ contract, raw: await a.getTokenBalanceStrict(contract, address) })));
  const held = balances.filter((b) => b.raw > 0n);
  return Promise.all(held.map(async (b) => ({ contract: b.contract, raw: b.raw, ...(await readMeta(a, chain.id, b.contract)) })));
}
