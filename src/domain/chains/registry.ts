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
  /*
   * Le registre v2 met ses adapters en cache : sans cet oubli, un adapter
   * construit sur la configuration retirée continuerait de répondre, et de
   * parler à un RPC que l'utilisateur vient de supprimer. Import différé pour
   * ne pas créer de cycle entre les deux registres.
   */
  void import('./v2/registry').then((m) => m.forgetAdapterV2(id)).catch(() => {});
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

/**
 * Symbole et décimales natifs d'une chaîne, ou `undefined` si elle est inconnue.
 *
 * Destiné à l'affichage d'une liste qui MÊLE LES RÉSEAUX : chaque ligne doit
 * être formatée avec les décimales de SA chaîne, jamais celles du réseau
 * affiché. `getAdapter` lève sur une chaîne inconnue, ce qui est juste pour un
 * envoi mais pas ici : un historique en cache peut citer un réseau
 * personnalisé que l'utilisateur vient de retirer, et cette ligne doit se
 * dégrader, pas faire tomber l'écran.
 */
export function nativeOfChain(chainId: string): { symbol: string; decimals: number } | undefined {
  const c = adapters.get(chainId)?.config;
  return c ? { symbol: c.nativeSymbol, decimals: c.nativeDecimals } : undefined;
}

/** Nom lisible d'une chaîne, ou `undefined` si elle est inconnue. */
export function chainNameOf(chainId: string): string | undefined {
  return adapters.get(chainId)?.config.name;
}

/**
 * Nom, unité native et explorateur d'une chaîne, ou `undefined` si inconnue.
 *
 * Pour un export ou une liste qui couvre plusieurs réseaux : sans cela, chaque
 * ligne héritait du réseau affiché et le fichier annonçait le mauvais réseau,
 * le mauvais symbole et un lien d'explorateur qui ne menait nulle part.
 */
export function chainMetaOf(
  chainId: string,
): { name: string; nativeSymbol: string; nativeDecimals: number; explorerUrl?: string } | undefined {
  const c = adapters.get(chainId)?.config;
  return c
    ? { name: c.name, nativeSymbol: c.nativeSymbol, nativeDecimals: c.nativeDecimals, explorerUrl: c.explorerUrl }
    : undefined;
}
