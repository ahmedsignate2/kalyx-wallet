/**
 * HEURE DE CHAÎNE, pour les délais de la liste blanche.
 *
 * L'heure de l'ordinateur se change en deux clics : un voleur qui l'avancerait
 * de 24 h rendrait son adresse « utilisable » sur-le-champ. On prend donc
 * l'horodatage du dernier bloc (Ethereum, Base, Arbitrum : le premier qui
 * répond), puis on l'avance avec une horloge MONOTONE (`performance.now`), que
 * l'heure du système ne touche pas.
 *
 * Inconnue (aucun réseau) → null : rien de différé ne devient actif.
 */
import { ARBITRUM, BASE, ETHEREUM } from '../../src/domain/chains/configs';
import { fetchRpc, type Rpc } from './discovery';

const REFRESH_MS = 10 * 60_000;

export function makeChainTime(rpc: Rpc = fetchRpc, mono: () => number = () => performance.now()) {
  let anchor: { chainMs: number; at: number } | null = null;

  async function fetchLatest(): Promise<number | null> {
    const urls = [ETHEREUM, BASE, ARBITRUM].map((c) => c.rpcUrls[0]).filter(Boolean);
    try {
      return await Promise.any(
        urls.map(async (url) => {
          const b = (await rpc(url, 'eth_getBlockByNumber', ['latest', false])) as { timestamp?: string } | null;
          const ts = b?.timestamp ? Number(BigInt(b.timestamp)) : NaN;
          if (!Number.isFinite(ts) || ts <= 0) throw new Error('bloc illisible');
          return ts * 1000;
        }),
      );
    } catch {
      return null;
    }
  }

  /** Heure de chaîne (ms), ou null si aucun réseau n'a répondu. */
  return async function now(): Promise<number | null> {
    if (!anchor || mono() - anchor.at > REFRESH_MS) {
      const chainMs = await fetchLatest();
      // Jamais en arrière : un nœud en retard ne rouvre pas un délai déjà écoulé.
      if (chainMs !== null) {
        const current = anchor ? anchor.chainMs + (mono() - anchor.at) : 0;
        anchor = { chainMs: Math.max(chainMs, current), at: mono() };
      }
    }
    return anchor ? Math.round(anchor.chainMs + (mono() - anchor.at)) : null;
  };
}

export type ChainNow = ReturnType<typeof makeChainTime>;
