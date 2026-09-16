import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { OfflineBanner } from '../ui/OfflineBanner';
import { FloatingAiAssistant } from '../components/ai/FloatingAiAssistant';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWallet } from '../lib/walletStore';
import { useAiStore } from '../lib/aiStore';
import { useSettings } from '../lib/settingsStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { useContacts } from '../lib/contactsStore';
import { useNotifCenter } from '../lib/notificationCenter';
import { useCustomChains } from '../lib/customChainsStore';
import { useWalletConnect } from '../lib/walletconnect';
import { useFonts } from 'expo-font';
import { RootErrorBoundary, ErrorScreen } from '../ui/ErrorBoundary';
import { WalletConnectHost } from '../ui/WalletConnectHost';
import { WebDashboard } from '../ui/web/WebDashboard';
import { ToastHost } from '../ui/ToastHost';
import { AutoLock } from '../ui/AutoLock';
import { PrivacyScreen } from '../ui/PrivacyScreen';
import { CopilotSheet } from '../ui/CopilotSheet';
import { useDriveFlow } from '../lib/googleDrive';
import { PriceAlertWatcher } from '../ui/PriceAlertWatcher';
import { UpdateChecker } from '../ui/UpdateChecker';
import { usePriceAlerts } from '../lib/priceAlertsStore';
import { useRecentRecipients } from '../lib/recentRecipientsStore';
import { useTokenPrefs } from '../lib/tokenPrefsStore';
import { DeepLinks } from '../ui/DeepLinks';
import { Splash } from '../ui/Splash';
import { useTheme } from '../ui/theme';

console.log('[Kalyx] _layout.tsx chargé');

/** ErrorBoundary d'Expo Router (capture les erreurs des routes). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('[Kalyx] Expo Router ErrorBoundary :', error?.message, error?.stack);
  return <ErrorScreen error={error} onRetry={retry} />;
}

export default function RootLayout() {
  const { mode, colors } = useTheme();
  // Splash animé (~1,6 s) au lancement.
  const [showSplash, setShowSplash] = useState(true);
  // Typo du design system (General Sans). On attend le chargement avant de
  // rendre, sinon RN plante sur une fontFamily inconnue.
  const [fontsLoaded] = useFonts({
    // General Sans (Fontshare, ITF Free Font License) — une seule famille (§2.5).
    'GeneralSans-Regular': require('../assets/fonts/GeneralSans-Regular.ttf'),
    'GeneralSans-Medium': require('../assets/fonts/GeneralSans-Medium.ttf'),
    'GeneralSans-Semibold': require('../assets/fonts/GeneralSans-Semibold.ttf'),
    'GeneralSans-Bold': require('../assets/fonts/GeneralSans-Bold.ttf'),
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
  const loadAiState = useAiStore((s) => s.loadInitialState);
  const loadDriveFlow = useDriveFlow((s) => s.load);

  // Web : fond de page sombre garanti (au cas où +html.tsx ne serait pas honoré)
  // + on empêche la bande blanche autour de la colonne centrée.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // document n'est pas typé sans la lib DOM (tsconfig ciblé mobile) : accès gardé.
    const doc = (globalThis as any).document;
    if (!doc) return;
    doc.documentElement.style.backgroundColor = colors.bgDeep;
    doc.body.style.backgroundColor = colors.bgDeep;
    // Empêche la traduction auto du navigateur (Google Traduction réécrit les
    // nœuds texte et casse React : « Failed to execute removeChild »).
    const el = doc.documentElement as unknown as { setAttribute: (k: string, v: string) => void; lang: string };
    el.lang = 'fr';
    el.setAttribute('translate', 'no');
    // Le CSS de +html.tsx est ignoré par l'export web (`output: 'single'`) : on
    // l'injecte donc au runtime. Objectifs : (1) plus AUCUN débordement/scroll
    // horizontal ni tremblement sur mobile ; (2) un repli de police universel
    // pour que TOUT glyphe (accents, ponctuation) s'affiche même hors Inter.
    const d2 = doc as unknown as {
      getElementById: (id: string) => unknown;
      createElement: (t: string) => { id: string; textContent: string };
      head: { appendChild: (n: unknown) => void };
    };
    if (!d2.getElementById('kalyx-web-css')) {
      const style = d2.createElement('style');
      style.id = 'kalyx-web-css';
      style.textContent = `
        html, body { overflow-x: hidden; max-width: 100%; }
        #root { overflow-x: hidden; max-width: 100vw; }
        * { -webkit-tap-highlight-color: transparent; }
        body, button, input, textarea {
          font-family: 'General Sans', GeneralSans-Regular, -apple-system, BlinkMacSystemFont,
            "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans",
            "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
        }
        img { max-width: 100%; }
      `;
      d2.head.appendChild(style);
    }
  }, [colors.bgDeep]);

  useEffect(() => {
    // Sur web (tableau de bord WalletConnect), pas de coffre local ni de wallet-side :
    // on ne bootstrap pas les stores du wallet mobile.
    if (Platform.OS === 'web') return;
    console.log('[Kalyx] _layout: démarrage bootstrap');
    (async () => {
      try {
        await bootstrap();
        console.log('[Kalyx] bootstrap OK');
      } catch (e) {
        console.error('[Kalyx] bootstrap a échoué :', e);
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
        await loadAiState();
        await loadDriveFlow();
        console.log('[Kalyx] loadSettings OK');
      } catch (e) {
        console.error('[Kalyx] loadSettings a échoué :', e);
      }
      try {
        await initWalletConnect();
      } catch (e) {
        console.error('[Kalyx] WalletConnect init a échoué :', e);
      }
    })();
  }, [bootstrap, loadSettings, loadCustomTokens, loadContacts, loadNotifs, loadCustomChains, loadPriceAlerts, loadRecents, loadTokenPrefs, initWalletConnect, loadAiState]);

  if (!fontsLoaded) return null;

  // WEB = tableau de bord desktop (le téléphone est le coffre-fort, le web est
  // une fenêtre WalletConnect en lecture seule). MOBILE = l'app wallet complète.
  if (Platform.OS === 'web') {
    return (
      <RootErrorBoundary>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <WebDashboard />
          <ToastHost />
    </SafeAreaProvider>
      </RootErrorBoundary>
    );
  }

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        {/* Icônes de statut claires sur thème sombre, et inversement. */}
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={{ flex: 1 }}>
          <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false, // chaque écran dessine son en-tête (ui/kit/ScreenHeader)
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
        <CopilotSheet />
        <PriceAlertWatcher />
        <UpdateChecker />
        <DeepLinks />
        <FloatingAiAssistant />
        {showSplash ? <Splash onFinish={() => setShowSplash(false)} /> : null}
        </View>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
