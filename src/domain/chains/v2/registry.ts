/**
 * Registre des adapters v2.
 *
 * Vit À CÔTÉ du registre v1, et se construit à partir de la MÊME liste de
 * configurations (`listChains`, qui inclut les réseaux personnalisés). Deux
 * listes séparées auraient divergé : un réseau ajouté par l'utilisateur
 * n'apparaîtrait que d'un côté, et il aurait fallu se souvenir de l'inscrire
 * deux fois.
 *
 * Construction PARESSEUSE et mise en cache : instancier les quatre-vingts
 * chaînes du catalogue au chargement du module coûterait pour rien, alors
 * qu'une session n'en utilise qu'une poignée.
 */
import { listChains } from '../registry';
import type { ChainConfig } from '../types';
import { EvmAdapterV2 } from './EvmAdapterV2';
import { BitcoinAdapterV2 } from './BitcoinAdapterV2';
import { SolanaAdapterV2 } from './SolanaAdapterV2';
import type { ChainAdapterV2 } from './types';

const cache = new Map<string, ChainAdapterV2>();

/** Fabrique l'adapter v2 correspondant à la famille de la config. */
function create(config: ChainConfig): ChainAdapterV2 {
  switch (config.family) {
    case 'evm':
      return new EvmAdapterV2(config);
    case 'bitcoin':
      return new BitcoinAdapterV2(config);
    case 'solana':
      return new SolanaAdapterV2(config);
    default:
      throw new Error(`Famille de chaîne non supportée en v2 : ${config.family}`);
  }
}

/** Adapter v2 d'une chaîne, ou `null` si elle n'est pas connue. */
export function findAdapterV2(chainId: string): ChainAdapterV2 | null {
  const hit = cache.get(chainId);
  if (hit) return hit;
  const config = listChains().find((c) => c.id === chainId);
  if (!config) return null;
  const adapter = create(config);
  cache.set(chainId, adapter);
  return adapter;
}

/** Adapter v2 d'une chaîne. Lève si la chaîne est inconnue. */
export function getAdapterV2(chainId: string): ChainAdapterV2 {
  const adapter = findAdapterV2(chainId);
  if (!adapter) throw new Error(`Chaîne inconnue : ${chainId}`);
  return adapter;
}

/**
 * Oublie l'adapter mis en cache pour cette chaîne.
 *
 * À appeler quand un réseau personnalisé est retiré OU modifié : sans cela, un
 * adapter construit sur l'ancienne configuration continuerait de parler à
 * l'ancien RPC, et l'utilisateur verrait son changement rester sans effet.
 */
export function forgetAdapterV2(chainId: string): void {
  cache.delete(chainId);
}

/** Vide le cache. Pour les tests, et pour un changement massif de réseaux. */
export function resetAdaptersV2(): void {
  cache.clear();
}
