import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { useContacts } from '../lib/contactsStore';
import { useNotifCenter } from '../lib/notificationCenter';
import { useCustomChains } from '../lib/customChainsStore';
import { useWalletConnect } from '../lib/walletconnect';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { RootErrorBoundary, ErrorScreen } from '../ui/ErrorBoundary';
import { WalletConnectHost } from '../ui/WalletConnectHost';
import { ToastHost } from '../ui/ToastHost';
import { AutoLock } from '../ui/AutoLock';
import { PrivacyScreen } from '../ui/PrivacyScreen';
import { DeepLinks } from '../ui/DeepLinks';
import { Splash } from '../ui/Splash';
import { useTheme } from '../ui/theme';

console.log('[Nova] _layout.tsx chargé');

/** ErrorBoundary d'Expo Router (capture les erreurs des routes). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('[Nova] Expo Router ErrorBoundary :', error?.message, error?.stack);
  return <ErrorScreen error={error} onRetry={retry} />;
}

export default function RootLayout() {
  const { mode, colors } = useTheme();
  // Splash animé (lion + vibration) au lancement.
  const [showSplash, setShowSplash] = useState(true);
  // Typo custom du design system (Inter). On attend le chargement avant de
  // rendre, sinon RN plante sur une fontFamily inconnue.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const bootstrap = useWallet((s) => s.bootstrap);
  const loadSettings = useSettings((s) => s.load);
  const loadCustomTokens = useCustomTokens((s) => s.load);
  const loadContacts = useContacts((s) => s.load);
  const loadNotifs = useNotifCenter((s) => s.load);
  const loadCustomChains = useCustomChains((s) => s.load);
  const initWalletConnect = useWalletConnect((s) => s.init);

  useEffect(() => {
    console.log('[Nova] _layout: démarrage bootstrap');
    (async () => {
      try {
        await bootstrap();
        console.log('[Nova] bootstrap OK');
      } catch (e) {
        console.error('[Nova] bootstrap a échoué :', e);
      }
      try {
        await loadSettings();
        await loadCustomTokens();
        await loadContacts();
        await loadNotifs();
        await loadCustomChains();
        console.log('[Nova] loadSettings OK');
      } catch (e) {
        console.error('[Nova] loadSettings a échoué :', e);
      }
      try {
        await initWalletConnect();
      } catch (e) {
        console.error('[Nova] WalletConnect init a échoué :', e);
      }
    })();
  }, [bootstrap, loadSettings, loadCustomTokens, loadContacts, loadNotifs, loadCustomChains, initWalletConnect]);

  if (!fontsLoaded) return null;

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        {/* Icônes de statut claires sur thème sombre, et inversement. */}
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bgDeep },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bgDeep },
            headerTitle: '',
            animation: 'slide_from_right',
            animationDuration: 220,
          }}
        />
        <WalletConnectHost />
        <ToastHost />
        <AutoLock />
        <PrivacyScreen />
        <DeepLinks />
        {showSplash ? <Splash onFinish={() => setShowSplash(false)} /> : null}
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
