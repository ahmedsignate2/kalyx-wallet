import type { ExpoConfig } from 'expo/config';

/**
 * Sauvegarde Google Drive (lib/googleDrive.ts) : Google redirige vers le schéma
 * « ID client inversé » du client OAuth Android/iOS. Déclaré seulement si
 * EXPO_PUBLIC_GOOGLE_CLIENT_ID est fourni au build (cf. .env.example).
 */
const GOOGLE_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
const GOOGLE_SUFFIX = '.apps.googleusercontent.com';
const googleScheme = GOOGLE_CLIENT_ID.endsWith(GOOGLE_SUFFIX)
  ? `com.googleusercontent.apps.${GOOGLE_CLIENT_ID.slice(0, -GOOGLE_SUFFIX.length)}`
  : null;
const schemes = ['kalyx', ...(googleScheme ? [googleScheme] : [])];

const config: ExpoConfig = {
  name: 'Kalyx Wallet',
  slug: 'kalyx-wallet',
  owner: 'amss86',
  scheme: schemes,
  version: '0.1.0',
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
    // Universal Link WalletConnect : https://kalyxwallet.com/wc?uri=… (fichier
    // apple-app-site-association servi par le site, cf. web/public/.well-known).
    associatedDomains: ['applinks:kalyxwallet.com'],
    infoPlist: {
      // Ledger Nano X en Bluetooth (transport @ledgerhq BLE).
      NSBluetoothAlwaysUsageDescription:
        'Kalyx utilise le Bluetooth pour se connecter à un portefeuille matériel Ledger.',
      // Deep links : Kalyx gère aussi le schéma WalletConnect « wc: » et « ethereum: ».
      CFBundleURLTypes: [{ CFBundleURLSchemes: [...schemes, 'wc', 'ethereum'] }],
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
        data: [...schemes.map((scheme) => ({ scheme })), { scheme: 'wc' }, { scheme: 'ethereum' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // App Link WalletConnect (Universal Link) : vérifié via
      // https://kalyxwallet.com/.well-known/assetlinks.json (empreinte SHA-256 du keystore).
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'kalyxwallet.com', pathPrefix: '/wc' }],
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
    'expo-localization',
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
