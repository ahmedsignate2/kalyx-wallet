/**
 * Biométrie Telegram Mini App (empreinte/Face ID via l'OS, médiée par
 * Telegram). Cette API n'existe QUE dans Telegram : en navigateur classique,
 * `available` reste false et le SDK n'est même pas chargé (voir platform.ts).
 *
 * ⚠️ Purement une couche de CONFIDENTIALITÉ (masquer/révéler l'affichage du
 * solde). Aucune clé, aucune signature n'est jamais impliquée ici — ça reste
 * le rôle exclusif du téléphone Kalyx (WalletConnect).
 */
import { useEffect, useRef, useState } from 'react';
import { loadTelegramWebApp, type TelegramBiometricManager } from './platform';

export function useTelegramBiometric() {
  const [available, setAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'finger' | 'face' | 'unknown'>('unknown');
  const [unlocked, setUnlocked] = useState(false);
  const bmRef = useRef<TelegramBiometricManager | null>(null);

  useEffect(() => {
    let alive = true;
    loadTelegramWebApp().then((app) => {
      if (!alive || !app?.BiometricManager) return;
      const bm = app.BiometricManager;
      bmRef.current = bm;
      try {
        bm.init(() => {
          if (!alive) return;
          setAvailable(bm.isBiometricAvailable);
          setBiometricType(bm.biometricType);
          if (bm.isBiometricAvailable && !bm.isAccessRequested) {
            bm.requestAccess({ reason: 'Kalyx' }, () => {});
          }
        });
      } catch {
        /* client sans BiometricManager */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const unlock = (reason: string) => {
    const bm = bmRef.current;
    if (!bm || !bm.isBiometricAvailable) {
      setUnlocked(true); // hors Telegram / pas de biométrie : pas de verrou à faire respecter
      return;
    }
    bm.authenticate({ reason }, (success) => setUnlocked(!!success));
  };

  return { available, biometricType, unlocked, unlock, lock: () => setUnlocked(false) };
}
