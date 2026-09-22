/**
 * État réseau — source unique de vérité pour « hors-ligne ».
 *
 * L'information vivait dans l'état local d'`OfflineBanner` : personne d'autre
 * ne pouvait la lire, alors que l'Aura (docs/08 §3.2, ambiance Veille) et les
 * états vides (§11) en dépendent. Elle devient un store.
 *
 * `expo-network` est chargé paresseusement : le module natif peut manquer dans
 * un dev-client pas encore reconstruit, et une absence de module ne doit jamais
 * faire croire à l'utilisateur qu'il est hors ligne. En cas de doute, on
 * considère qu'il est CONNECTÉ — se tromper dans ce sens ne coûte qu'une erreur
 * réseau explicite, alors que l'inverse éteindrait l'app sans raison.
 */
import { create } from 'zustand';

const POLL_MS = 5000;

interface NetworkState {
  online: boolean;
  /** false tant qu'aucune mesure n'a abouti : évite de juger sur un défaut. */
  known: boolean;
  set: (online: boolean) => void;
}

export const useNetwork = create<NetworkState>((set, get) => ({
  online: true,
  known: false,
  set: (online) => {
    if (get().online === online && get().known) return;
    set({ online, known: true });
  },
}));

let stop: (() => void) | null = null;

/**
 * Démarre la surveillance. Idempotent : appelé une fois depuis le layout racine.
 */
export function startNetworkWatch(): () => void {
  if (stop) return stop;

  let Network: typeof import('expo-network') | null = null;
  try {
    Network = require('expo-network');
  } catch {
    // Module natif absent : on reste « connecté », sans surveillance.
    return () => {};
  }

  let alive = true;
  const read = async () => {
    try {
      const s = await Network!.getNetworkStateAsync();
      if (alive) useNetwork.getState().set(s.isConnected ?? true);
    } catch {
      // Mesure impossible : on ne change pas d'avis.
    }
  };

  void read();

  // Écouteur natif si la version d'expo-network l'expose, sinon sondage.
  let sub: { remove: () => void } | null = null;
  const add = (Network as unknown as { addNetworkStateListener?: (cb: (s: { isConnected?: boolean }) => void) => { remove: () => void } }).addNetworkStateListener;
  if (typeof add === 'function') {
    sub = add((s) => { if (alive) useNetwork.getState().set(s.isConnected ?? true); });
  }
  const timer = sub ? null : setInterval(read, POLL_MS);

  stop = () => {
    alive = false;
    sub?.remove();
    if (timer) clearInterval(timer);
    stop = null;
  };
  return stop;
}
