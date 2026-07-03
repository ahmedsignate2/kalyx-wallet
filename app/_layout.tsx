import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { colors } from '../ui/theme';

export default function RootLayout() {
  const bootstrap = useWallet((s) => s.bootstrap);
  const loadSettings = useSettings((s) => s.load);

  useEffect(() => {
    bootstrap();
    loadSettings();
  }, [bootstrap, loadSettings]);

  return (
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
  );
}
