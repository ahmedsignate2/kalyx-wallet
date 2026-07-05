/**
 * Verrouillage automatique : quand l'app revient au premier plan après être
 * restée en arrière-plan plus longtemps que le délai configuré, on reverrouille
 * (retour à l'écran PIN/biométrie).
 *
 * On ne réagit qu'à l'état « background » (pas « inactive ») pour éviter les
 * faux verrouillages sur les overlays système (prompt biométrie, sélecteur
 * d'apps, centre de notifications).
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';

export function AutoLock() {
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;

      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since == null) return;

      const { autoLockMinutes } = useSettings.getState();
      if (autoLockMinutes < 0) return; // « Jamais »
      const elapsed = Date.now() - since;
      const threshold = autoLockMinutes * 60_000; // 0 = immédiat

      const w = useWallet.getState();
      if (w.hasWallet && w.isUnlocked && elapsed >= threshold) {
        w.lock();
        router.replace('/unlock');
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
