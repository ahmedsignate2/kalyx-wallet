import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Kalyx Wallet',
  slug: 'kalyx-wallet',
  owner: 'amss86',
  scheme: 'kalyx',
  version: '0.0.1',
  orientation: 'portrait',
  // 'automatic' : requis pour que le thème « Système » suive l'OS (useColorScheme).
  userInterfaceStyle: 'automatic',
  backgroundColor: '#06070D',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    backgroundColor: '#06070D',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.kalyx.wallet',
    infoPlist: {
      // Ledger Nano X en Bluetooth (transport @ledgerhq BLE).
      NSBluetoothAlwaysUsageDescription:
        'Kalyx utilise le Bluetooth pour se connecter à un portefeuille matériel Ledger.',
      // Deep links : Kalyx gère aussi le schéma WalletConnect « wc: » et « ethereum: ».
      CFBundleURLTypes: [{ CFBundleURLSchemes: ['kalyx', 'wc', 'ethereum'] }],
    },
  },
  android: {
    softwareKeyboardLayoutMode: 'resize',
    package: 'com.kalyx.wallet',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      // Fond dégradé de marque (violet→bleu) plutôt qu'une couleur plate.
      backgroundImage: './assets/adaptive-bg.png',
      backgroundColor: '#06070D', // repli si l'image n'est pas prise en compte
    },
    // La protection anti-capture d'écran sur les écrans sensibles se branche
    // au niveau natif / via expo-screen-capture (cf. app/backup.tsx).
    permissions: [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.CAMERA',
    ],
    // Deep links système : « wc: » (WalletConnect) ouvre Kalyx (au prochain rebuild).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'kalyx' }, { scheme: 'wc' }, { scheme: 'ethereum' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    "expo-status-bar",
    "expo-font",
    'expo-router',
    'expo-secure-store',
    'expo-local-authentication',
    // Scanner QR (adresses + WalletConnect) — actif au prochain rebuild EAS.
    [
      'expo-camera',
      {
        cameraPermission:
          'Kalyx utilise la caméra pour scanner les QR codes : adresses de paiement et connexions WalletConnect.',
      },
    ],
    // Ledger BLE (react-native-ble-plx) — actif au prochain rebuild EAS.
    ['react-native-ble-plx', { isBackgroundEnabled: false }],
  ],
  // Cible Web (react-native-web via Metro). `output: 'single'` = SPA client
  // (le wallet est 100 % client : aucun rendu serveur, aucune clé côté serveur).
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: '47cb06bd-ee7d-442d-b000-05abb945b599',
    },
  },
};

export default config;
