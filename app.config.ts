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

/**
 * Version par profil de build : `EAS_BUILD_PROFILE` est fourni par EAS
 * pendant `eas build` (et par le workflow GitHub Actions, cf.
 * .github/workflows/eas-build-release.yml) — jamais présent en dehors d'un
 * build, donc `expo start` en local reste en 0.1.0 par défaut.
 * `production` et `production-apk` (Galaxy Store) → 1.0.0 ; le reste
 * (development, preview) → 0.1.0, réservé aux testeurs.
 */
const BUILD_PROFILE = process.env.EAS_BUILD_PROFILE ?? '';
const APP_VERSION = BUILD_PROFILE.startsWith('production') ? '1.0.0' : '0.1.0';

const config: ExpoConfig = {
  name: 'Kalyx Wallet',
  slug: 'kalyx-wallet',
  owner: 'amss86',
  scheme: schemes,
  version: APP_VERSION,
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
  /*
   * Mises à jour à distance (OTA) — permet de pousser du JS sans rebuild.
   *
   * `fallbackToCacheTimeout: 0` : l'app démarre IMMÉDIATEMENT sur le bundle
   * qu'elle a déjà, et cherche la mise à jour en arrière-plan. Bloquer le
   * lancement sur un appel réseau contredirait la doctrine (« rien ne bloque »)
   * et rendrait l'app inutilisable hors ligne.
   */
  updates: {
    url: 'https://u.expo.dev/47cb06bd-ee7d-442d-b000-05abb945b599',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  /*
   * EMPREINTE, et surtout PAS `appVersion`.
   *
   * Une OTA ne doit jamais atterrir sur un binaire incompatible : si le JS
   * appelle un module natif absent de l'APK installé, l'app plante au lancement
   * et l'utilisateur n'a plus que la réinstallation pour s'en sortir. La
   * politique `fingerprint` hache le projet natif, donc une mise à jour n'est
   * proposée qu'aux binaires réellement capables de l'exécuter.
   *
   * `appVersion` serait un piège ici en plus : APP_VERSION vaut '0.1.0' en
   * preview et '1.0.0' en production (voir plus haut), et `autoIncrement` est
   * actif sur production — chaque changement de version orphelinerait les
   * installations existantes.
   */
  runtimeVersion: { policy: 'fingerprint' },
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
      /*
       * Lève le plafond de 60 fps d'iOS sur les écrans ProMotion : sans ce
       * drapeau, une app React Native reste bridée à 60 quel que soit l'écran.
       * Il n'a d'effet qu'au build — et il change l'empreinte, donc il ne
       * s'ajoute QU'au moment où l'on reconstruit, jamais entre deux OTA.
       */
      CADisableMinimumFrameDuration: true,
      /*
       * Deep links. Kalyx se déclare pour WalletConnect (`wc:`) et pour les
       * trois formats d'URI de paiement : `ethereum:` (EIP-681),
       * `bitcoin:` (BIP-21) et `solana:` (Solana Pay).
       *
       * Les trois ensemble, c'est ce que les autres ne font pas : MetaMask
       * prend `ethereum:`, Phantom prend `solana:`, aucun ne prend les trois.
       * Le routage correspondant vit dans `lib/paymentIntent`.
       */
      CFBundleURLTypes: [
        { CFBundleURLSchemes: [...schemes, 'wc', 'ethereum', 'bitcoin', 'solana'] },
      ],
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
    // au niveau natif / via expo-screen-capture (cf. app/backup.tsx), sans
    // permission manifeste.
    // Pas de bloc `permissions` ici : CAMERA (expo-camera) et BLUETOOTH_SCAN/
    // CONNECT (react-native-ble-plx, cf. plugins) sont déjà déclarées — avec
    // leur rationale/flags corrects — par leurs plugins respectifs. Les
    // redéclarer ici doublonnait BLUETOOTH_SCAN SANS `neverForLocation`,
    // risquant d'annuler ce flag dans le manifeste fusionné.
    // Deep links système : WalletConnect et les trois URI de paiement (cf. iOS).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [
          ...schemes.map((scheme) => ({ scheme })),
          { scheme: 'wc' },
          { scheme: 'ethereum' },
          { scheme: 'bitcoin' },
          { scheme: 'solana' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // App Links (Universal Links) : vérifiés via
      // https://kalyxwallet.com/.well-known/assetlinks.json (empreinte SHA-256 du keystore).
      //
      // `/pay` en plus de `/wc` : une demande de paiement doit rester cliquable
      // partout et mener quelque part même sans Kalyx installé — un `bitcoin:`
      // collé dans une conversation ne fait ni l'un ni l'autre. Côté iOS,
      // `applinks:kalyxwallet.com` couvre déjà tous les chemins.
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'kalyxwallet.com', pathPrefix: '/wc' },
          { scheme: 'https', host: 'kalyxwallet.com', pathPrefix: '/pay' },
        ],
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
    // Bloque tout trafic HTTP en clair au niveau OS (déjà le comportement par
    // défaut depuis Android 9/API 28, rendu explicite ici) : tous les RPC et
    // API (marché, backend) doivent être en https:// ou wss://.
    ['expo-build-properties', { android: { usesCleartextTraffic: false } }],
    // Icône de notification Android : silhouette blanche (le mark Kalyx, cf.
    // ui/KalyxLogo.tsx) sur fond transparent — Android ignore les couleurs
    // et ne garde que le canal alpha pour la barre de statut ; sans ça,
    // l'icône par défaut (le logo en couleur) s'affichait en carré blanc plein.
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#DDB565' }],
    // Scanner QR (adresses + WalletConnect) — actif au prochain rebuild EAS.
    [
      'expo-camera',
      {
        cameraPermission:
          'Kalyx utilise la caméra pour scanner les QR codes : adresses de paiement et connexions WalletConnect.',
      },
    ],
    // Ledger BLE (react-native-ble-plx) — actif au prochain rebuild EAS.
    // `neverForLocation: true` : le scan Bluetooth sert UNIQUEMENT à trouver un
    // Ledger, jamais à géolocaliser. Sans ce flag, le plugin ajoute
    // ACCESS_FINE/COARSE_LOCATION (sans plafond de SDK) — contraire à la
    // politique « zéro télémétrie » de Kalyx et signalé par les revues stores
    // (Google Play en particulier) comme une permission de localisation
    // injustifiée. Avec le flag, la permission est limitée à Android ≤ 11 et
    // BLUETOOTH_SCAN porte `usesPermissionFlags="neverForLocation"`.
    ['react-native-ble-plx', { isBackgroundEnabled: false, neverForLocation: true }],
    // Durcissement Android : voir plugins/withAndroidNoBackup.js.
    './plugins/withAndroidNoBackup.js',
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
