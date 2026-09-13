/**
 * Sauvegarde portable des réseaux EVM personnalisés.
 *
 * Un réseau perso (RPC + chainId + symbole + explorateur) n'est PAS dérivable de
 * la seed : après une réinstallation, il faut le ressaisir. Ce module sérialise
 * les réseaux dans une enveloppe versionnée que l'utilisateur peut sauvegarder
 * (partage/fichier) puis réimporter — les fonds étaient toujours on-chain, il
 * suffit de redonner le RPC à Kalyx pour les revoir.
 *
 * Données NON sensibles (URLs publiques, pas de clé) : pas de chiffrement requis.
 * Logique pure et testable : la validation rejette tout ce qui n'est pas un
 * réseau EVM bien formé (chainId entier positif, RPC https).
 */
import type { ChainConfig } from './types';

export const NETWORKS_BACKUP_VERSION = 1;

interface NetworksBackup {
  v: number;
  app: 'kalyx' | 'nova';
  kind: 'networks';
  chains: ChainConfig[];
}

/** Reconstruit une ChainConfig EVM propre à partir d'une entrée non fiable. */
function sanitize(raw: unknown): ChainConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const evmChainId = typeof c.evmChainId === 'number' ? c.evmChainId : Number(c.evmChainId);
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  const nativeSymbol = typeof c.nativeSymbol === 'string' ? c.nativeSymbol.trim().toUpperCase() : '';
  const rpcUrls = Array.isArray(c.rpcUrls) ? c.rpcUrls.filter((u): u is string => typeof u === 'string') : [];
  const explorerUrl = typeof c.explorerUrl === 'string' && c.explorerUrl.trim() ? c.explorerUrl.trim() : undefined;

  if (!name || !nativeSymbol) return null;
  if (!Number.isInteger(evmChainId) || evmChainId <= 0) return null;
  const rpc = rpcUrls.map((u) => u.trim()).filter((u) => /^https:\/\//i.test(u));
  if (rpc.length === 0) return null;

  return {
    id: `custom-${evmChainId}`,
    name,
    family: 'evm',
    evmChainId,
    nativeSymbol,
    nativeDecimals: 18,
    rpcUrls: rpc,
    explorerUrl,
  };
}

/** Sérialise les réseaux perso en JSON (enveloppe versionnée). */
export function serializeNetworks(chains: ChainConfig[]): string {
  const backup: NetworksBackup = { v: NETWORKS_BACKUP_VERSION, app: 'kalyx', kind: 'networks', chains };
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse et valide une sauvegarde. Renvoie les réseaux valides (dédupliqués par
 * chainId) ; `error` renseigné si le format est inutilisable. Tolérant : ignore
 * silencieusement les entrées mal formées et ne garde que les réseaux EVM sains.
 */
export function parseNetworksBackup(text: string): { chains: ChainConfig[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { chains: [], error: 'Fichier illisible (JSON invalide).' };
  }
  // Accepte l'enveloppe {kind:'networks', chains} OU un simple tableau de réseaux.
  const rawChains = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as NetworksBackup).chains)
      ? (parsed as NetworksBackup).chains
      : null;
  if (!rawChains) return { chains: [], error: 'Sauvegarde de réseaux non reconnue.' };

  const seen = new Set<string>();
  const chains: ChainConfig[] = [];
  for (const raw of rawChains) {
    const c = sanitize(raw);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    chains.push(c);
  }
  if (chains.length === 0) return { chains: [], error: 'Aucun réseau valide dans la sauvegarde.' };
  return { chains };
}
