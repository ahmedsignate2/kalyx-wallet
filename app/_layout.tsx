import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
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
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { RootErrorBoundary, ErrorScreen } from '../ui/ErrorBoundary';
import { WalletConnectHost } from '../ui/WalletConnectHost';
import { ToastHost } from '../ui/ToastHost';
import { AutoLock } from '../ui/AutoLock';
import { PrivacyScreen } from '../ui/PrivacyScreen';
import { PriceAlertWatcher } from '../ui/PriceAlertWatcher';
import { usePriceAlerts } from '../lib/priceAlertsStore';
import { useRecentRecipients } from '../lib/recentRecipientsStore';
import { useTokenPrefs } from '../lib/tokenPrefsStore';
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
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });
  const bootstrap = useWallet((s) => s.bootstrap);
  const loadSettings = useSettings((s) => s.load);
  const loadCustomTokens = useCustomTokens((s) => s.load);
  const loadContacts = useContacts((s) => s.load);
  const loadNotifs = useNotifCenter((s) => s.load);
  const loadCustomChains = useCustomChains((s) => s.load);
  const loadPriceAlerts = usePriceAlerts((s) => s.load);
  const loadRecents = useRecentRecipients((s) => s.load);
  const loadTokenPrefs = useTokenPrefs((s) => s.load);
  const initWalletConnect = useWalletConnect((s) => s.init);

  // Web : fond de page sombre garanti (au cas où +html.tsx ne serait pas honoré)
  // + on empêche la bande blanche autour de la colonne centrée.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // document n'est pas typé sans la lib DOM (tsconfig ciblé mobile) : accès gardé.
    const doc = (globalThis as { document?: { documentElement: { style: Record<string, string> }; body: { style: Record<string, string> } } }).document;
    if (!doc) return;
    doc.documentElement.style.backgroundColor = colors.bgDeep;
    doc.body.style.backgroundColor = colors.bgDeep;
  }, [colors.bgDeep]);

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
        await loadPriceAlerts();
        await loadRecents();
        await loadTokenPrefs();
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
  }, [bootstrap, loadSettings, loadCustomTokens, loadContacts, loadNotifs, loadCustomChains, loadPriceAlerts, loadRecents, loadTokenPrefs, initWalletConnect]);

  if (!fontsLoaded) return null;

  // Sur web, l'app mobile est centrée dans une colonne (façon popup d'extension)
  // au lieu d'être collée à gauche avec une bande vide. Sur mobile : plein écran.
  const isWeb = Platform.OS === 'web';
  const frameStyle = isWeb
    ? {
        flex: 1,
        width: '100%' as const,
        maxWidth: 460,
        alignSelf: 'center' as const,
        backgroundColor: colors.bgDeep,
        // Léger liseré + ombre pour détacher la colonne du fond sur grand écran.
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.glassBorder,
      }
    : { flex: 1 };

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        {/* Icônes de statut claires sur thème sombre, et inversement. */}
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={frameStyle}>
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
        <PriceAlertWatcher />
        <DeepLinks />
        {showSplash ? <Splash onFinish={() => setShowSplash(false)} /> : null}
        </View>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
