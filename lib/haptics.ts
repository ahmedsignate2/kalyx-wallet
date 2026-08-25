/**
 * Nova — Wrapper haptique unifié.
 *
 * Encapsule `expo-haptics` avec :
 * 1. Un import dynamique (ne crashe pas si le module natif est absent).
 * 2. Le respect d'un futur réglage "désactiver les retours haptiques".
 * 3. Le respect de `AccessibilityInfo.isReduceMotionEnabled` du système.
 *
 * Utilisation :
 *   import { haptic } from '../lib/haptics';
 *   haptic.selection();   // touche PIN
 *   haptic.light();       // sélection token, pull-to-refresh
 *   haptic.medium();      // confirmation d'action
 *   haptic.success();     // transaction confirmée
 *   haptic.error();       // PIN faux
 *   haptic.warning();     // site à risque
 */
import { AccessibilityInfo, Platform } from 'react-native';

// ─── État interne ────────────────────────────────────────────────────────────

let Haptics: typeof import('expo-haptics') | null = null;
let loaded = false;
let reduceMotion = false;

// Écoute le réglage d'accessibilité du système.
AccessibilityInfo.isReduceMotionEnabled?.()
  ?.then((v: boolean) => { reduceMotion = v; })
  ?.catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
  reduceMotion = v;
});

/** Charge expo-haptics en lazy (jamais bloquant). */
async function load(): Promise<typeof import('expo-haptics') | null> {
  if (loaded) return Haptics;
  loaded = true;
  if (Platform.OS === 'web') return null;
  try {
    Haptics = await import('expo-haptics');
  } catch {
    Haptics = null;
  }
  return Haptics;
}

// Pré-charge au boot (fire-and-forget).
void load();

// ─── API publique ────────────────────────────────────────────────────────────

function noop() { /* no-op quand haptique indisponible ou désactivé */ }

async function run(fn: (h: typeof import('expo-haptics')) => Promise<void>) {
  if (reduceMotion) return;
  const h = Haptics ?? await load();
  if (!h) return;
  try { await fn(h); } catch { /* silencieux */ }
}

export const haptic = {
  /** Touche du pavé PIN — feedback le plus léger possible. */
  selection: () => void run((h) => h.selectionAsync()),

  /** Sélection d'un token/réseau, relâchement du pull-to-refresh. */
  light: () => void run((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),

  /** Confirmation d'action (swap validé, envoi lancé). */
  medium: () => void run((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium)),

  /** Heavy impact — pour les moments rares (geste de swap inversion). */
  heavy: () => void run((h) => h.impactAsync(h.ImpactFeedbackStyle.Heavy)),

  /** Transaction confirmée — triptyque succès. */
  success: () => void run((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),

  /** PIN faux, erreur de transaction. */
  error: () => void run((h) => h.notificationAsync(h.NotificationFeedbackType.Error)),

  /** Site classé à risque (browser dApp). */
  warning: () => void run((h) => h.notificationAsync(h.NotificationFeedbackType.Warning)),
} as const;
