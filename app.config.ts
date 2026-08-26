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
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
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
      // Deep links : Nova gère aussi le schéma WalletConnect « wc: » et « ethereum: ».
      CFBundleURLTypes: [{ CFBundleURLSchemes: ['novawallet', 'wc', 'ethereum'] }],
    },
  },
  android: {
    softwareKeyboardLayoutMode: 'resize',
    package: 'com.nova.wallet',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      // Fond dégradé de marque (violet→bleu) plutôt qu'une couleur plate.
      backgroundImage: './assets/adaptive-bg.png',
      backgroundColor: '#0B0E14', // repli si l'image n'est pas prise en compte
    },
    // La protection anti-capture d'écran sur les écrans sensibles se branche
    // au niveau natif / via expo-screen-capture (cf. app/backup.tsx).
    permissions: [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.CAMERA',
    ],
    // Deep links système : « wc: » (WalletConnect) ouvre Nova (au prochain rebuild).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'wc' }, { scheme: 'ethereum' }],
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
          'Nova utilise la caméra pour scanner les QR codes : adresses de paiement et connexions WalletConnect.',
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
      projectId: '763060a0-07a9-4056-b50e-5b8d6f2a0e0c',
    },
  },
};

export default config;
