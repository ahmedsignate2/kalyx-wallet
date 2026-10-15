/**
 * Verrouillage automatique : quand l'app revient au premier plan après être
 * restée en arrière-plan plus longtemps que le délai configuré, on reverrouille
 * (retour à l'écran PIN/biométrie).
 *
 * On ne réagit qu'à l'état « background » (pas « inactive ») pour éviter les
 * faux verrouillages sur les overlays système (prompt biométrie, sélecteur
 * d'apps, centre de notifications).
 *
 * La règle (heure reculée, écrans qui affichent un secret) vit dans
 * lib/autoLockPolicy.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { monoNow, shouldAutoLock, LOCK_IMMEDIATELY_ON } from '../lib/autoLockPolicy';

export function AutoLock() {
  const backgroundedAt = useRef<{ wall: number; mono: number; pathname: string } | null>(null);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundedAt.current = { wall: Date.now(), mono: monoNow(), pathname: pathRef.current };
        return;
      }
      if (state !== 'active') return;

      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since == null) return;

      const lockNow = shouldAutoLock({
        autoLockMinutes: useSettings.getState().autoLockMinutes,
        wallElapsedMs: Date.now() - since.wall,
        monoElapsedMs: monoNow() - since.mono,
        pathname: since.pathname,
      });

      const w = useWallet.getState();
      if (w.hasWallet && w.isUnlocked && lockNow) {
        w.lock();
        /*
         * L'ÉCRAN DE CODE SE POSE PAR-DESSUS, il ne remplace plus l'écran
         * courant. Remplacer démontait les onglets — le navigateur perdait sa
         * page, et le déverrouillage ramenait à l'accueil au milieu de ce qu'on
         * faisait. Au déverrouillage, on retrouve l'écran tel quel.
         * Exception : un écran qui AFFICHAIT un secret n'est jamais rendu.
         */
        if (LOCK_IMMEDIATELY_ON.has(since.pathname)) router.replace('/unlock');
        else router.push({ pathname: '/unlock', params: { resume: '1' } });
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
