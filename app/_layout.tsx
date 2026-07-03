import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { RootErrorBoundary, ErrorScreen } from '../ui/ErrorBoundary';
import { colors } from '../ui/theme';

console.log('[Nova] _layout.tsx chargé');

/** ErrorBoundary d'Expo Router (capture les erreurs des routes). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('[Nova] Expo Router ErrorBoundary :', error?.message, error?.stack);
  return <ErrorScreen error={error} onRetry={retry} />;
}

export default function RootLayout() {
  const bootstrap = useWallet((s) => s.bootstrap);
  const loadSettings = useSettings((s) => s.load);
  const loadCustomTokens = useCustomTokens((s) => s.load);

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
        console.log('[Nova] loadSettings OK');
      } catch (e) {
        console.error('[Nova] loadSettings a échoué :', e);
      }
    })();
  }, [bootstrap, loadSettings, loadCustomTokens]);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bgDeep },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bgDeep },
            headerTitle: '',
          }}
        />
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
