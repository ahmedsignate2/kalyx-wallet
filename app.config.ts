import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nova Wallet',
  slug: 'nova-wallet',
  scheme: 'novawallet',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0E14',
  splash: {
    backgroundColor: '#0B0E14',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.nova.wallet',
  },
  android: {
    package: 'com.nova.wallet',
    // La protection anti-capture d'écran sur les écrans sensibles se branche
    // au niveau natif / via expo-screen-capture (cf. app/backup.tsx).
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-local-authentication'],
  experiments: { typedRoutes: true },
};

export default config;
