/**
 * Registre des réseaux de l'EXTENSION : même interface que celui du cœur
 * (src/domain/chains/registry) : EVM, Solana, Bitcoin et TON. Substitué au
 * registre du cœur au moment du build (voir scripts/registryPlugin.ts) : le
 * cœur reste inchangé.
 *
 * `listChains` rend tous les réseaux connus, comme dans l'app ; `getAdapter`
 * lève sur un réseau non servi, exactement comme sur un réseau inconnu — les
 * appelants du cœur savent déjà s'en passer.
 */
import type { ChainAdapter, ChainConfig } from '../../src/domain/chains/types';
import { EvmChainAdapter } from '../../src/domain/chains/EvmChainAdapter';
import { SolanaChainAdapter } from '../../src/domain/chains/SolanaChainAdapter';
import { BitcoinChainAdapter } from '../../src/domain/chains/BitcoinChainAdapter';
import { TonChainAdapter } from '../../src/domain/chains/TonChainAdapter';
import { ALL_CHAINS } from '../../src/domain/chains/configs';
import { isRelayUrl } from '../../src/domain/net/relay';

function createAdapter(config: ChainConfig): ChainAdapter | null {
  if (config.family === 'evm') return new EvmChainAdapter(config);
  if (config.family === 'solana') return new SolanaChainAdapter(config);
  if (config.family === 'bitcoin') return new BitcoinChainAdapter(config);
  if (config.family === 'ton') return new TonChainAdapter(config);
  return null;
}

/**
 * Réseaux masqués dans l'extension : aucun serveur qui réponde, et aucun
 * repli possible par le relais (Degen : son seul RPC public est en panne,
 * Alchemy ne le sert pas). Les interroger ne donnait qu'un « réseau muet ».
 */
const HIDDEN = new Set(['degen']);
/**
 * Solana : le relais Kalyx (Helius, clé côté serveur, cache partagé) passe EN
 * PREMIER dans l'extension, les nœuds publics en secours. Les nœuds publics
 * refusent ou limitent souvent les navigateurs : essayés d'abord (12 s chacun),
 * ils faisaient abandonner le chargement avant d'atteindre le relais —
 * « Solana sans réponse », historique illisible. Le service worker oublie en
 * plus, à chaque mise en veille, quels serveurs étaient en panne.
 */
const relayFirst = (c: ChainConfig): ChainConfig =>
  c.family === 'solana' && c.rpcUrls.some(isRelayUrl) ? { ...c, rpcUrls: [...c.rpcUrls.filter(isRelayUrl), ...c.rpcUrls.filter((u) => !isRelayUrl(u))] } : c;
const CHAINS = ALL_CHAINS.filter((c) => !HIDDEN.has(c.id)).map(relayFirst);

const adapters = new Map<string, ChainAdapter>();
for (const c of CHAINS) {
  const a = createAdapter(c);
  if (a) adapters.set(c.id, a);
}
const customChains: ChainConfig[] = [];

export function registerChain(config: ChainConfig): void {
  if (adapters.has(config.id)) return;
  const a = createAdapter(config);
  if (!a) return;
  adapters.set(config.id, a);
  customChains.push(config);
}

export function unregisterChain(id: string): void {
  adapters.delete(id);
  const i = customChains.findIndex((c) => c.id === id);
  if (i >= 0) customChains.splice(i, 1);
}

export function getAdapter(chainId: string): ChainAdapter {
  const adapter = adapters.get(chainId);
  if (!adapter) throw new Error(`Chaîne inconnue: ${chainId}`);
  return adapter;
}

export function listChains(opts?: { includeTestnets?: boolean }): ChainConfig[] {
  const includeTestnets = opts?.includeTestnets ?? true;
  return [...CHAINS, ...customChains].filter((c) => includeTestnets || !c.testnet);
}

export function hasChain(chainId: string): boolean {
  return adapters.has(chainId);
}

export function nativeOfChain(chainId: string): { symbol: string; decimals: number } | undefined {
  const c = adapters.get(chainId)?.config;
  return c ? { symbol: c.nativeSymbol, decimals: c.nativeDecimals } : undefined;
}

export function chainNameOf(chainId: string): string | undefined {
  return adapters.get(chainId)?.config.name;
}

export function chainMetaOf(chainId: string): { name: string; nativeSymbol: string; nativeDecimals: number; explorerUrl?: string } | undefined {
  const c = adapters.get(chainId)?.config;
  return c ? { name: c.name, nativeSymbol: c.nativeSymbol, nativeDecimals: c.nativeDecimals, explorerUrl: c.explorerUrl } : undefined;
}
