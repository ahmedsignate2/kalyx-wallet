/**
 * Registre des adapters de chaînes.
 *
 * Point d'entrée unique pour obtenir l'adapter d'un réseau. Le reste du wallet
 * ne connaît que l'interface `ChainAdapter`, jamais l'implémentation concrète —
 * c'est ce qui rend l'ajout d'une chaîne indolore.
 */
import type { ChainAdapter, ChainConfig } from './types';
import { EvmChainAdapter } from './EvmChainAdapter';
import { BitcoinChainAdapter } from './BitcoinChainAdapter';
import { SolanaChainAdapter } from './SolanaChainAdapter';
import { ALL_CHAINS } from './configs';

/** Fabrique l'adapter correspondant à la famille de la config. */
function createAdapter(config: ChainConfig): ChainAdapter {
  switch (config.family) {
    case 'evm':
      return new EvmChainAdapter(config);
    case 'bitcoin':
      return new BitcoinChainAdapter(config);
    case 'solana':
      return new SolanaChainAdapter(config);
    default:
      throw new Error(`Famille de chaîne non supportée: ${config.family}`);
  }
}

// Adapters instanciés une fois, indexés par id de config.
const adapters = new Map<string, ChainAdapter>(
  ALL_CHAINS.map((c) => [c.id, createAdapter(c)]),
);

// Chaînes personnalisées ajoutées à l'exécution (mode développeur, RPC custom).
const customChains: ChainConfig[] = [];

/** Enregistre une chaîne personnalisée (EVM). Idempotent par id. */
export function registerChain(config: ChainConfig): void {
  if (adapters.has(config.id)) return;
  adapters.set(config.id, createAdapter(config));
  customChains.push(config);
}

/** Retire une chaîne personnalisée. */
export function unregisterChain(id: string): void {
  adapters.delete(id);
  const i = customChains.findIndex((c) => c.id === id);
  if (i >= 0) customChains.splice(i, 1);
}

export function getAdapter(chainId: string): ChainAdapter {
  const adapter = adapters.get(chainId);
  if (!adapter) {
    throw new Error(`Chaîne inconnue: ${chainId}`);
  }
  return adapter;
}

export function listChains(opts?: { includeTestnets?: boolean }): ChainConfig[] {
  const includeTestnets = opts?.includeTestnets ?? true;
  return [...ALL_CHAINS, ...customChains].filter((c) => includeTestnets || !c.testnet);
}

export function hasChain(chainId: string): boolean {
  return adapters.has(chainId);
}
