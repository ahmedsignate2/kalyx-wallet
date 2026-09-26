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
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
  disableClosingConfirmation?: () => void;
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

/**
 * Prépare la mini-app : plein écran, couleurs alignées sur le fond, pas de
 * fermeture par glissement vertical (sinon scroller la liste fermait l'app).
 *
 * DEUX EFFETS, PAS UN. Tout dépendait de `bg`, donc un changement de thème
 * rappelait `ready()` — qui annonce à Telegram que l'interface est prête, une
 * chose qui n'arrive qu'une fois — et `expand()`. L'ouverture se fait une fois ;
 * seules les couleurs suivent le thème.
 */
export function useTelegramSetup(bg: string) {
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  useEffect(() => {
    let alive = true;
    loadTelegramWebApp().then((a) => {
      if (!alive || !a) return;
      try {
        a.ready();
        a.expand();
        a.disableVerticalSwipes?.();
      } catch {
        /* version de client trop ancienne pour certaines méthodes */
      }
      setApp(a);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!app) return;
    try {
      app.setHeaderColor?.(bg);
      app.setBackgroundColor?.(bg);
      app.setBottomBarColor?.(bg);
    } catch {
      /* méthode absente sur les clients anciens */
    }
  }, [app, bg]);
  return app;
}

/**
 * Demande confirmation avant fermeture, seulement pendant `active`.
 *
 * `disableVerticalSwipes` empêche de fermer la mini-app en faisant défiler, mais
 * pas la croix ni le geste système. Fermer au milieu d'un envoi laisse
 * l'utilisateur sans savoir si la transaction est partie. On l'active donc pendant
 * les parcours de signature, et on la coupe après : la garder en permanence
 * ferait apparaître une alerte à chaque sortie, y compris depuis l'accueil.
 */
export function useTelegramClosingConfirmation(app: TelegramWebApp | null, active: boolean) {
  useEffect(() => {
    if (!app?.enableClosingConfirmation || !active) return;
    try {
      app.enableClosingConfirmation();
    } catch {
      return;
    }
    return () => { try { app.disableClosingConfirmation?.(); } catch { /* ignore */ } };
  }, [app, active]);
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

/**
 * Vrai après `timeoutMs` sans interaction (souris, clavier, toucher, scroll).
 *
 * UN SEUL MINUTEUR, RÉARMÉ — au lieu d'un sondage toutes les cinq secondes qui
 * ne s'arrêtait jamais. Le masquage du solde l'utilise avec deux minutes : sur un
 * téléphone, dans la mini-app Telegram, c'était douze réveils par minute pendant
 * toute la session pour vérifier une soustraction. Un `setTimeout` réarmé à chaque
 * geste fait exactement le même travail avec zéro réveil pendant l'inactivité.
 *
 * `idle` vit aussi dans une ref : il était dans les dépendances de l'effet, donc
 * chaque bascule désinscrivait puis réinscrivait les six écouteurs.
 *
 * `visibilitychange` a quitté la liste des gestes. Il la remettait à zéro, donc
 * passer en arrière-plan REPOUSSAIT le masquage automatique du solde — l'inverse
 * de ce qu'on veut d'un minuteur de confidentialité. Le retour au premier plan est
 * de toute façon suivi d'un geste réel, et `useTabHidden` masque immédiatement.
 */
export function useIdle(timeoutMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  useEffect(() => {
    const w = win();
    if (!enabled || !w?.addEventListener) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { idleRef.current = true; setIdle(true); }, timeoutMs);
    };
    const bump = () => {
      if (idleRef.current) { idleRef.current = false; setIdle(false); }
      arm();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    events.forEach((e) => w.addEventListener?.(e, bump, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => w.removeEventListener?.(e, bump));
      if (timer) clearTimeout(timer);
    };
  }, [timeoutMs, enabled]);
  return idle;
}

/** Passe à true à chaque fois que l'onglet part en arrière-plan (puis false au retour). */
export function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const doc = (globalThis as { document?: { hidden?: boolean; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void } }).document;
    if (!doc?.addEventListener) return;
    const on = () => setHidden(!!doc.hidden);
    doc.addEventListener('visibilitychange', on);
    return () => doc.removeEventListener?.('visibilitychange', on);
  }, []);
  return hidden;
}
