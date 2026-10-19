/**
 * Partie PURE du tri anti-spam de l'historique : confiance d'un token et
 * réseaux dont on lit l'historique. Sans React ni stores : l'app
 * (lib/historySpam) et l'extension navigateur s'en servent toutes les deux.
 */
import { getAdapter } from '../src/domain/chains/registry';
import { knownTokensFor } from '../src/domain/tokens/knownTokens';
import { KNOWN_MINTS } from '../src/domain/tokens/splTokens';
import type { SpamCtx } from '../src/domain/tx/spam';

export function buildTrusted(verifiedIds: Set<string>): SpamCtx['trusted'] {
  const curated = new Map<string, Set<string>>();
  return (chain, contract) => {
    const c = contract.toLowerCase();
    if (verifiedIds.has(`${chain}:${c}`)) return true;
    let family: string;
    try {
      family = getAdapter(chain).config.family;
    } catch {
      return false;
    }
    // TON : l'historique n'admet déjà que les jettons de la liste blanche TonAPI.
    if (family === 'ton') return true;
    if (family === 'solana') return !!KNOWN_MINTS[contract];
    let set = curated.get(chain);
    if (!set) {
      set = new Set(knownTokensFor(getAdapter(chain).config.evmChainId).map((a) => a.toLowerCase()));
      curated.set(chain, set);
    }
    return set.has(c);
  };
}

/**
 * RÉSEAUX DONT ON LIT L'HISTORIQUE.
 *
 * Tous les réseaux du registre (soixante-six) étaient interrogés à chaque
 * ouverture de l'accueil et de l'Activité, y compris ceux où l'utilisateur n'a
 * jamais rien eu : des dizaines d'appels pour des listes vides, des quotas
 * brûlés et un écran lent. On lit les réseaux principaux, ceux où il détient
 * quelque chose, et ceux dont on a déjà un historique.
 */
export const CORE_HISTORY_CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche', 'solana', 'bitcoin', 'ton']);

export function pickHistoryChains<C extends { id: string }>(all: C[], holdingChains: Set<string>, cachedChains: Set<string>): C[] {
  return all.filter((c) => CORE_HISTORY_CHAINS.has(c.id) || holdingChains.has(c.id) || cachedChains.has(c.id));
}
