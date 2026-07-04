import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nova Wallet',
  slug: 'nova-wallet',
  scheme: 'novawallet',
  version: '0.0.1',
  orientation: 'portrait',
  // 'automatic' : requis pour que le thème « Système » suive l'OS (useColorScheme).
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B0E14',
  splash: {
    backgroundColor: '#0B0E14',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.nova.wallet',
    infoPlist: {
      // Ledger Nano X en Bluetooth (transport @ledgerhq BLE).
      NSBluetoothAlwaysUsageDescription:
        'Nova utilise le Bluetooth pour se connecter à un portefeuille matériel Ledger.',
    },
  },
  android: {
    package: 'com.nova.wallet',
    // La protection anti-capture d'écran sur les écrans sensibles se branche
    // au niveau natif / via expo-screen-capture (cf. app/backup.tsx).
    permissions: ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-local-authentication',
    // Ledger BLE (react-native-ble-plx) — actif au prochain rebuild EAS.
    ['react-native-ble-plx', { isBackgroundEnabled: false }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: '763060a0-07a9-4056-b50e-5b8d6f2a0e0c',
    },
  },
};

export default config;
