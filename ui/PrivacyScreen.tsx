/**
 * Écran de garde : quand l'app n'est plus au premier plan (arrière-plan ou
 * transition), on recouvre le contenu d'un voile (lion + « Nova »). Ainsi la
 * vignette du sélecteur d'apps récentes ne montre ni les soldes ni l'adresse.
 *
 * Activable dans Réglages (privacyGuard, activé par défaut). Ne bloque PAS les
 * captures d'écran (celles-ci se font app active) — c'est volontaire.
 */
import React, { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NovaLogo } from './NovaLogo';
import { fonts, useTheme } from './theme';
import { useSettings } from '../lib/settingsStore';

export function PrivacyScreen() {
  const { colors, gradients } = useTheme();
  const guard = useSettings((s) => s.privacyGuard);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // Couvre dès que l'app quitte l'état actif (inactive = transition/snapshot).
      setCovered(state !== 'active');
    });
    return () => sub.remove();
  }, []);

  if (!guard || !covered) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]} pointerEvents="none">
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <NovaLogo size={96} />
        <Text style={{ color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, letterSpacing: 1 }}>Nova</Text>
      </View>
    </View>
  );
}
