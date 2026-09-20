/**
 * Intégration Telegram Mini App — détecte si le dashboard tourne DANS
 * Telegram (chargement du script officiel telegram-web-app.js) et expose son
 * BiometricManager : empreinte/Face ID via l'OS, médié par Telegram. Cette
 * API n'existe QUE dans ce contexte — un simple onglet de navigateur
 * (kalyxwallet.com ouvert dans Chrome) n'y a jamais accès, contrairement à
 * une extension de navigateur (MetaMask/Phantom) qui, elle, a son propre
 * coffre chiffré local à déverrouiller.
 *
 * ⚠️ Purement une couche de CONFIDENTIALITÉ (masquer/révéler l'affichage du
 * solde). Aucune clé, aucune signature n'est jamais impliquée ici — ça reste
 * le rôle exclusif du téléphone Kalyx (WalletConnect). Un échec ou une
 * absence de biométrie ne bloque jamais l'usage du dashboard, juste l'auto-
 * masquage du solde.
 */
import { useEffect, useRef, useState } from 'react';

interface TelegramBiometricManager {
  isInited: boolean;
  isBiometricAvailable: boolean;
  biometricType: 'finger' | 'face' | 'unknown';
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init: (cb?: () => void) => void;
  requestAccess: (params: { reason?: string }, cb?: (granted: boolean) => void) => void;
  authenticate: (params: { reason?: string }, cb?: (success: boolean, token?: string) => void) => void;
}
interface TelegramWebApp {
  ready: () => void;
  BiometricManager: TelegramBiometricManager;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js?63';

function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return resolve(null);
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const onReady = () => resolve(window.Telegram?.WebApp ?? null);
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/** `available` : biométrie Telegram utilisable ici (false en navigateur classique). */
export function useTelegramBiometric() {
  const [available, setAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'finger' | 'face' | 'unknown'>('unknown');
  const [unlocked, setUnlocked] = useState(false);
  const bmRef = useRef<TelegramBiometricManager | null>(null);

  useEffect(() => {
    let alive = true;
    loadTelegramWebApp().then((app) => {
      if (!alive || !app) return;
      try {
        app.ready();
      } catch {
        /* ignore */
      }
      const bm = app.BiometricManager;
      bmRef.current = bm;
      bm.init(() => {
        if (!alive) return;
        setAvailable(bm.isBiometricAvailable);
        setBiometricType(bm.biometricType);
        if (bm.isBiometricAvailable && !bm.isAccessRequested) {
          bm.requestAccess({ reason: 'Protéger l’affichage de ton solde Kalyx' }, () => {});
        }
      });
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
