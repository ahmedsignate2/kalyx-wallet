/**
 * Mises à jour à distance (OTA).
 *
 * POURQUOI CE FICHIER EXISTE. Par défaut, `expo-updates` avec
 * `checkAutomatically: 'ON_LOAD'` télécharge la mise à jour pendant le
 * lancement, mais ne l'applique qu'au lancement SUIVANT. On pousse donc une
 * OTA, on ouvre l'app, on ne voit rien, et on croit que ça ne marche pas. Il
 * faut demander explicitement le rechargement.
 *
 * Deux comportements, parce que le bon moment n'est pas le même :
 *
 *  - AU LANCEMENT : on recharge tout de suite. L'utilisateur n'a encore rien
 *    fait, il ne perd rien, et il voit la version à jour immédiatement.
 *  - AU RETOUR AU PREMIER PLAN : on ne recharge PAS. Arracher l'écran sous les
 *    doigts de quelqu'un au milieu d'un envoi serait inacceptable ; la mise à
 *    jour est simplement préparée et s'appliquera d'elle-même à la prochaine
 *    ouverture.
 *
 * Tout est silencieux en cas d'échec : une mise à jour indisponible n'est pas
 * une erreur que l'utilisateur doit gérer, et l'app fonctionne très bien sur le
 * bundle qu'elle a déjà.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type UpdatesModule = typeof import('expo-updates');

/**
 * Chargement paresseux : le module natif peut manquer (Expo Go, dev-client pas
 * reconstruit), et son absence ne doit jamais empêcher l'app de démarrer.
 */
function getUpdates(): UpdatesModule | null {
  try {
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
}

/**
 * Vrai uniquement dans un build qui embarque le module natif. Faux sous Metro
 * et dans Expo Go, où c'est le bundler qui sert le JS.
 */
export function otaEnabled(): boolean {
  return !!getUpdates()?.isEnabled;
}

/**
 * Cherche une mise à jour et la télécharge. Retourne `true` si un nouveau
 * bundle est prêt à être appliqué.
 */
export async function fetchUpdate(): Promise<boolean> {
  const U = getUpdates();
  if (!U?.isEnabled) return false;
  try {
    const check = await U.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await U.fetchUpdateAsync();
    return fetched.isNew;
  } catch {
    // Hors ligne, serveur injoignable, build non publié : rien à signaler.
    return false;
  }
}

/**
 * À monter UNE fois, au niveau du layout racine.
 *
 * `onReady` est appelé quand une mise à jour a été préparée alors que l'app
 * était déjà ouverte : l'écran peut le dire discrètement, sans rien interrompre.
 */
export function useOta(onReady?: () => void) {
  /** Garde anti-boucle : on ne recharge qu'une fois par session, quoi qu'il arrive. */
  const reloaded = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const U = getUpdates();
    if (!U?.isEnabled) return;

    let alive = true;

    // Au lancement : on applique tout de suite, rien n'est perdu.
    void (async () => {
      const ready = await fetchUpdate();
      if (!alive || !ready || reloaded.current) return;
      reloaded.current = true;
      try {
        await U.reloadAsync();
      } catch {
        // Rechargement refusé : la mise à jour s'appliquera à la prochaine ouverture.
      }
    })();

    // Au retour au premier plan : on prépare, on n'impose pas.
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void (async () => {
        const ready = await fetchUpdate();
        if (alive && ready) onReadyRef.current?.();
      })();
    };
    const sub = AppState.addEventListener('change', onChange);

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}
