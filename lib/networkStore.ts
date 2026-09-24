/**
 * État réseau — source unique de vérité pour « hors ligne ».
 *
 * `expo-network` est chargé paresseusement : le module natif peut manquer dans
 * un dev-client pas encore reconstruit, et une absence de module ne doit jamais
 * faire croire à l'utilisateur qu'il est hors ligne. En cas de doute, on
 * considère qu'il est CONNECTÉ — se tromper dans ce sens ne coûte qu'une erreur
 * réseau explicite, alors que l'inverse éteint l'app sans raison.
 *
 * TROIS BUGS CORRIGÉS, tous responsables du bandeau qui restait collé :
 *
 * 1. Quand `addNetworkStateListener` existait, le sondage était DÉSACTIVÉ : tout
 *    reposait sur cet écouteur. S'il ne se redéclenchait pas, rien ne venait
 *    jamais contredire un « hors ligne ». Le sondage est désormais TOUJOURS
 *    actif — un appel toutes les 5 s est négligeable, et c'est le filet qui
 *    garantit qu'on remonte.
 * 2. Rien ne relisait l'état au RETOUR AU PREMIER PLAN. Or c'est précisément le
 *    moment où l'information est périmée : l'OS coupe le réseau aux
 *    applications en arrière-plan. On quittait l'app, le bandeau apparaissait,
 *    on revenait, et il restait.
 * 3. Un seul « false » passager suffisait à afficher le bandeau. Il faut
 *    maintenant que l'état soit CONFIRMÉ par une seconde mesure : passer hors
 *    ligne est une mauvaise nouvelle, on ne l'annonce pas sur un doute. Le
 *    retour en ligne, lui, est immédiat — personne n'a envie d'attendre pour
 *    apprendre que ça remarche.
 */
import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';

const POLL_MS = 5000;
/** Délai de confirmation avant d'annoncer une perte de réseau. */
const CONFIRM_OFFLINE_MS = 1500;

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

export function startNetworkWatch(): () => void {
  if (stop) return stop;

  let Network: typeof import('expo-network') | null = null;
  try {
    Network = require('expo-network');
  } catch {
    return () => {};
  }

  let alive = true;
  /** Minuteur de confirmation d'une perte de réseau. */
  let pending: ReturnType<typeof setTimeout> | null = null;

  const clearPending = () => {
    if (pending) { clearTimeout(pending); pending = null; }
  };

  /** Applique une mesure : en ligne tout de suite, hors ligne après confirmation. */
  const apply = (online: boolean) => {
    if (!alive) return;
    if (online) {
      clearPending();
      useNetwork.getState().set(true);
      return;
    }
    if (pending) return; // confirmation déjà en cours
    pending = setTimeout(() => {
      pending = null;
      void (async () => {
        try {
          const again = await Network!.getNetworkStateAsync();
          if (alive && (again.isConnected ?? true) === false) useNetwork.getState().set(false);
        } catch {
          // Deuxième mesure impossible : on ne déclare pas hors ligne sur un doute.
        }
      })();
    }, CONFIRM_OFFLINE_MS);
  };

  const read = async () => {
    try {
      const s = await Network!.getNetworkStateAsync();
      apply(s.isConnected ?? true);
    } catch {
      // Mesure impossible : on ne change pas d'avis.
    }
  };

  void read();

  // Écouteur natif EN PLUS du sondage, jamais à sa place.
  let sub: { remove: () => void } | null = null;
  const add = (Network as unknown as { addNetworkStateListener?: (cb: (s: { isConnected?: boolean }) => void) => { remove: () => void } }).addNetworkStateListener;
  if (typeof add === 'function') {
    sub = add((s) => apply(s.isConnected ?? true));
  }
  const timer = setInterval(read, POLL_MS);

  // Retour au premier plan : l'information est périmée par construction.
  const onAppState = (state: AppStateStatus) => {
    if (state !== 'active') return;
    clearPending();
    void read();
  };
  const appSub = AppState.addEventListener('change', onAppState);

  stop = () => {
    alive = false;
    clearPending();
    sub?.remove();
    appSub.remove();
    clearInterval(timer);
    stop = null;
  };
  return stop;
}
