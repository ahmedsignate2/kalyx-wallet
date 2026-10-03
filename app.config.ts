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
 * pendant `eas build` (et par le workflow EAS, cf.
 * .eas/workflows/release-production.yml) — jamais présent en dehors d'un
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
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.kalyx.wallet',
    // Universal Link WalletConnect : https://kalyxwallet.com/wc?uri=… (fichier
    // apple-app-site-association servi par le site, cf. web/public/.well-known).
    associatedDomains: ['applinks:kalyxwallet.com'],
    infoPlist: {
      /*
       * Lève le plafond de 60 fps d'iOS sur les écrans ProMotion : sans ce
       * drapeau, une app React Native reste bridée à 60 quel que soit l'écran.
       * Il n'a d'effet qu'au build.
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
        // `ton` : factures TON Pay (ton://transfer/…) ; `tc` : lien TON Connect unifié, obligatoire (spec deeplinks).
        { CFBundleURLSchemes: [...schemes, 'wc', 'ethereum', 'bitcoin', 'solana', 'ton', 'tc'] },
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
    // Pas de bloc `permissions` ici : CAMERA est déclarée par le plugin
    // expo-camera, avec sa justification. Aucune permission Bluetooth.
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
          { scheme: 'ton' },
          { scheme: 'tc' },
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
          // TON Connect : lien universel déclaré dans la liste officielle des wallets TON.
          { scheme: 'https', host: 'kalyxwallet.com', pathPrefix: '/ton-connect' },
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
    /*
      Choix d'une image pour y lire un QR — actif au prochain rebuild EAS.

      `photosPermission` porte la RAISON, et c'est ce qu'Android et iOS montrent
      à l'utilisateur au moment de la demande : « accès aux photos » sans motif
      est refusé, à juste titre.

      Pas d'accès en écriture, pas de caméra via ce plugin, et aucune permission
      Android 13+ au-delà de READ_MEDIA_IMAGES : on lit UNE image que
      l'utilisateur désigne lui-même.
    */
    [
      'expo-image-picker',
      {
        photosPermission:
          'Kalyx accède à une photo que tu choisis pour y lire un QR code de paiement. Aucune autre image n’est lue.',
      },
    ],
    // Plus de plugin Bluetooth : la prise en charge Ledger n'a jamais été écrite, et
    // le module ne faisait que demander BLUETOOTH_SCAN/CONNECT (et, sous Android ≤ 11,
    // la localisation) pour rien — permissions que les revues des stores reprochent.
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
