/**
 * Écran de garde : masque le contenu quand l'app quitte le premier plan, pour
 * que la vignette du sélecteur d'« apps récentes » ne montre ni soldes ni adresse.
 *
 * Deux couches, car un simple voile JS ne suffit PAS sur Android : la vignette
 * est capturée nativement AVANT que React ne peigne l'overlay.
 *   1. FLAG_SECURE (expo-screen-capture) activé UNIQUEMENT hors premier plan →
 *      la vignette « récents » est réellement masquée par le système.
 *   2. Voile lion + « Kalyx » (utile sur iOS et comme repli visuel).
 *
 * Choix volontaire : FLAG_SECURE est RETIRÉ dès que l'app est active, donc les
 * captures d'écran restent possibles pendant l'usage normal. Activable dans
 * Réglages (privacyGuard, activé par défaut).
 *
 * iOS : on ne bascule PAS prevent/allowScreenCaptureAsync à chaque passage
 * « inactive » — sur iOS, cette bascule provoquait un flash / écran noir
 * pendant la feuille Face ID (qui rend l'app « inactive »). À la place, la
 * protection native du sélecteur d'apps (flou posé par le système hors
 * premier plan) est activée UNE fois. Android inchangé.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, Text, View } from 'react-native';
import { KalyxLogo } from './KalyxLogo';
import { fonts, useTheme, fontSize } from './theme';
import { useSettings } from '../lib/settingsStore';

// Module natif : présent dans le build (déjà utilisé par app/backup.tsx).
// Import gardé pour ne jamais crasher si absent (avant un rebuild).
let ScreenCapture: typeof import('expo-screen-capture') | null = null;
try {
  ScreenCapture = require('expo-screen-capture');
} catch {
  ScreenCapture = null;
}

// Tag dédié (indépendant de celui de la sauvegarde de seed).
const TAG = 'nova-privacy-guard';

export function PrivacyScreen() {
  const { colors } = useTheme();
  const guard = useSettings((s) => s.privacyGuard);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      // Une seule activation : iOS floute lui-même la vignette hors premier plan.
      if (guard) ScreenCapture?.enableAppSwitcherProtectionAsync?.(0.9).catch(() => {});
      else ScreenCapture?.disableAppSwitcherProtectionAsync?.().catch(() => {});
    }
  }, [guard]);

  useEffect(() => {
    if (!guard) {
      // Garde désactivée : on s'assure que la capture est autorisée + pas de voile.
      if (Platform.OS !== 'ios') ScreenCapture?.allowScreenCaptureAsync?.(TAG).catch(() => {});
      setCovered(false);
      return;
    }

    const apply = (state: AppStateStatus) => {
      const active = state === 'active';
      // iOS : « inactive » survient aussi pendant Face ID, une alerte système ou
      // le centre de contrôle — le flou natif couvre déjà le sélecteur d'apps ;
      // le voile n'apparaît donc qu'en arrière-plan, sans bascule de capture.
      if (Platform.OS === 'ios') {
        setCovered(state === 'background');
        return;
      }
      setCovered(!active);
      // FLAG_SECURE seulement hors premier plan → vignette « récents » masquée,
      // captures d'écran autorisées pendant l'usage normal.
      if (active) ScreenCapture?.allowScreenCaptureAsync?.(TAG).catch(() => {});
      else ScreenCapture?.preventScreenCaptureAsync?.(TAG).catch(() => {});
    };

    apply(AppState.currentState);
    const sub = AppState.addEventListener('change', apply);
    return () => {
      sub.remove();
      // ne pas laisser FLAG_SECURE actif
      if (Platform.OS !== 'ios') ScreenCapture?.allowScreenCaptureAsync?.(TAG).catch(() => {});
    };
  }, [guard]);

  if (!guard || !covered) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]} pointerEvents="none">
      {/* `gradients.screen` rend une couleur unie (flat()) : une View suffit,
          et le §2.2 ne tolère aucun dégradé décoratif. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <KalyxLogo size={96} />
        <Text style={{ color: colors.text, fontSize: fontSize.h2, fontFamily: fonts.extrabold, letterSpacing: 1 }}>Kalyx</Text>
      </View>
    </View>
  );
}
