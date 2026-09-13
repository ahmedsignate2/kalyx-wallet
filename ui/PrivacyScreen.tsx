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
 */
import React, { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KalyxLogo } from './KalyxLogo';
import { fonts, useTheme } from './theme';
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
  const { colors, gradients } = useTheme();
  const guard = useSettings((s) => s.privacyGuard);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!guard) {
      // Garde désactivée : on s'assure que la capture est autorisée + pas de voile.
      ScreenCapture?.allowScreenCaptureAsync?.(TAG).catch(() => {});
      setCovered(false);
      return;
    }

    const apply = (state: AppStateStatus) => {
      const active = state === 'active';
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
      ScreenCapture?.allowScreenCaptureAsync?.(TAG).catch(() => {}); // ne pas laisser FLAG_SECURE actif
    };
  }, [guard]);

  if (!guard || !covered) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]} pointerEvents="none">
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <KalyxLogo size={96} />
        <Text style={{ color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, letterSpacing: 1 }}>Kalyx</Text>
      </View>
    </View>
  );
}
