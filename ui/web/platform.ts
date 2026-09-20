/**
 * Où tourne le tableau de bord ?
 *  - 'telegram' : mini-app Telegram (web.telegram.org, clients mobiles/desktop).
 *    On charge alors le SDK officiel et on s'adapte (plein écran, couleurs
 *    d'en-tête, bouton Retour natif, pas de fermeture par glissement).
 *  - 'web'      : navigateur classique. Aucun script tiers n'est chargé (le
 *    SDK Telegram n'est PAS injecté), la session est coupée après inactivité.
 *
 * Détection SANS script externe : Telegram lance la mini-app avec des
 * paramètres `tgWebApp*` dans le hash/la query, et expose des ponts natifs
 * (`TelegramWebviewProxy` sur mobile, `external.notify` sur desktop).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type WebPlatform = 'telegram' | 'web';

type AnyWindow = Record<string, unknown> & {
  location?: { hash?: string; search?: string };
  parent?: unknown;
  Telegram?: { WebApp?: TelegramWebApp };
  addEventListener?: (t: string, cb: () => void, o?: unknown) => void;
  removeEventListener?: (t: string, cb: () => void, o?: unknown) => void;
};

function win(): AnyWindow | null {
  const w = (globalThis as unknown as { window?: AnyWindow }).window;
  return w ?? null;
}

export function detectTelegram(): boolean {
  const w = win();
  if (!w) return false;
  try {
    const params = `${w.location?.hash ?? ''}${w.location?.search ?? ''}`;
    if (/tgWebApp(Data|Platform|Version|StartParam)=/.test(params)) return true;
    if (w.TelegramWebviewProxy) return true;
    const ext = w.external as { notify?: unknown } | undefined;
    if (ext && typeof ext.notify === 'function') return true;
    if (w.Telegram?.WebApp?.initData) return true;
  } catch {
    /* accès bloqué : navigateur classique */
  }
  return false;
}

let cached: WebPlatform | null = null;
export function getWebPlatform(): WebPlatform {
  if (cached) return cached;
  cached = detectTelegram() ? 'telegram' : 'web';
  return cached;
}

export function useWebPlatform(): WebPlatform {
  return useMemo(getWebPlatform, []);
}

/* ------------------------------------------------------------ SDK Telegram */

export interface TelegramBiometricManager {
  isInited: boolean;
  isBiometricAvailable: boolean;
  biometricType: 'finger' | 'face' | 'unknown';
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init: (cb?: () => void) => void;
  requestAccess: (params: { reason?: string }, cb?: (granted: boolean) => void) => void;
  authenticate: (params: { reason?: string }, cb?: (success: boolean, token?: string) => void) => void;
}
export interface TelegramBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}
export interface TelegramHaptic {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged: () => void;
}
export interface TelegramWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  BiometricManager: TelegramBiometricManager;
  BackButton?: TelegramBackButton;
  HapticFeedback?: TelegramHaptic;
}

const SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js?63';
let loading: Promise<TelegramWebApp | null> | null = null;

/** Charge le SDK UNIQUEMENT dans Telegram ; résout `null` partout ailleurs. */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const w = win();
    const doc = (globalThis as { document?: { createElement: (t: string) => Record<string, unknown>; head: { appendChild: (e: unknown) => void } } }).document;
    if (!w || !doc || getWebPlatform() !== 'telegram') return resolve(null);
    if (w.Telegram?.WebApp) return resolve(w.Telegram.WebApp);
    const script = doc.createElement('script') as { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null };
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(w.Telegram?.WebApp ?? null);
    script.onerror = () => resolve(null);
    doc.head.appendChild(script);
  });
  return loading;
}

/** Prépare la mini-app : plein écran, couleurs alignées sur le fond, pas de
 *  fermeture par glissement vertical (sinon scroller la liste fermait l'app). */
export function useTelegramSetup(bg: string) {
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  useEffect(() => {
    let alive = true;
    loadTelegramWebApp().then((a) => {
      if (!alive || !a) return;
      try {
        a.ready();
        a.expand();
        a.setHeaderColor?.(bg);
        a.setBackgroundColor?.(bg);
        a.setBottomBarColor?.(bg);
        a.disableVerticalSwipes?.();
      } catch {
        /* version de client trop ancienne pour certaines méthodes */
      }
      setApp(a);
    });
    return () => { alive = false; };
  }, [bg]);
  return app;
}

export const TelegramAppContext = createContext<TelegramWebApp | null>(null);
export function useTelegramApp(): TelegramWebApp | null {
  return useContext(TelegramAppContext);
}

/** Bouton Retour natif de Telegram : visible quand `visible`, appelle `onBack`. */
export function useTelegramBackButton(app: TelegramWebApp | null, visible: boolean, onBack: () => void) {
  useEffect(() => {
    const bb = app?.BackButton;
    if (!bb) return;
    if (!visible) { bb.hide(); return; }
    bb.show();
    bb.onClick(onBack);
    return () => { bb.offClick(onBack); bb.hide(); };
  }, [app, visible, onBack]);
}

/** Retour haptique via Telegram quand disponible (no-op ailleurs). */
export function tgHaptic(app: TelegramWebApp | null, kind: 'light' | 'success' | 'error' | 'selection') {
  const h = app?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'selection') h.selectionChanged();
    else if (kind === 'light') h.impactOccurred('light');
    else h.notificationOccurred(kind);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------- Inactivité (web) */

/** Vrai après `timeoutMs` sans interaction (souris, clavier, toucher, scroll). */
export function useIdle(timeoutMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = win();
    if (!enabled || !w?.addEventListener) return;
    let last = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const bump = () => { last = Date.now(); if (idle) setIdle(false); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'visibilitychange'];
    events.forEach((e) => w.addEventListener?.(e, bump, { passive: true }));
    timer = setInterval(() => { if (Date.now() - last > timeoutMs) setIdle(true); }, 5_000);
    return () => {
      events.forEach((e) => w.removeEventListener?.(e, bump));
      if (timer) clearInterval(timer);
    };
  }, [timeoutMs, enabled, idle]);
  return idle;
}
