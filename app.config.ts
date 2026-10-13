import type { ExpoConfig } from 'expo/config';

/**
 * Sauvegarde Google Drive (lib/googleDrive.ts) : Google redirige vers le schéma
 * « ID client inversé » du client OAuth. Un client Google de type Android ne
 * sert QUE sur Android ; iOS exige son propre client (type iOS, lié au bundle
 * com.kalyx.wallet) → EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. Chaque schéma n'est
 * déclaré que si l'ID correspondant est fourni au build (cf. .env.example).
 */
const GOOGLE_SUFFIX = '.apps.googleusercontent.com';
const reversedScheme = (id: string): string | null =>
  id.endsWith(GOOGLE_SUFFIX) ? `com.googleusercontent.apps.${id.slice(0, -GOOGLE_SUFFIX.length)}` : null;
/** Client OAuth Android de Kalyx (public, comme l'iOS ci-dessous). Même valeur que ANDROID_CLIENT_ID_DEFAULT dans lib/googleDrive.ts. */
const GOOGLE_ANDROID_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim() || '800218617528-bhm4gfbcggo3bvisgnebf4djj7d8r9jg.apps.googleusercontent.com';
const googleScheme = reversedScheme(GOOGLE_ANDROID_CLIENT_ID);
/**
 * Client OAuth iOS de Kalyx (Google Cloud, projet 800218617528). Un ID client
 * n'est PAS un secret (il voyage en clair dans l'URL d'autorisation) : il est
 * écrit ici pour que tout build iOS ait la sauvegarde Drive sans dépendre d'une
 * variable d'environnement oubliée. La variable reste prioritaire. Même valeur
 * que IOS_CLIENT_ID_DEFAULT dans lib/googleDrive.ts.
 */
const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim() || '800218617528-g10f1ko6ssrtb3e3kt6tgsfog90rjkog.apps.googleusercontent.com';
const googleIosScheme = reversedScheme(GOOGLE_IOS_CLIENT_ID);
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

/*
 * Textes d'autorisation iOS (Info.plist). Texte de BASE en anglais : c'est
 * celui que voit un appareil dont la langue n'a pas de traduction. Les
 * traductions des 15 langues de l'app (dont le français, au tutoiement) sont
 * dans `locales/ios/<langue>.json`, section `ios`, déclarées plus bas sous
 * `locales` : Expo les écrit en `<langue>.lproj/InfoPlist.strings` au prebuild.
 * Toute modification d'un texte ici se reporte dans les 15 fichiers.
 * (Pas de guillemet droit dans ces fichiers : Expo ne les échappe pas.)
 */
/** Motif Face ID montré par iOS à la première demande. */
const FACE_ID_TEXT = 'Kalyx uses Face ID to unlock your wallet and confirm your sensitive operations.';
const CAMERA_TEXT = 'Kalyx uses the camera to scan QR codes: payment addresses and WalletConnect connections.';
const PHOTOS_TEXT = 'Kalyx opens a photo you choose to read a payment QR code from it. No other image is read.';
/*
 * Micro : Kalyx n'enregistre JAMAIS de son et ne demande jamais cette
 * autorisation. Mais expo-camera, expo-image-picker et expo-audio embarquent du
 * code natif lié au micro (AVAudioSession / AVCaptureDevice audio) : sans
 * NSMicrophoneUsageDescription, App Store Connect rejette le binaire
 * (ITMS-90683). `microphonePermission: false` SUPPRIMAIT la clé — d'où un texte
 * honnête plutôt qu'une absence.
 */
const MICROPHONE_TEXT = 'Kalyx never records audio; this permission is never requested.';

/** Fichiers de traduction des textes iOS ci-dessus (une entrée par langue de l'app). */
const IOS_LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'ja', 'ko'] as const;

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
  /*
   * Traductions des textes d'autorisation iOS (cf. FACE_ID_TEXT…). Le chinois
   * de l'app est le chinois SIMPLIFIÉ : dossier `zh-Hans.lproj`, celui qu'iOS
   * cherche pour un appareil en chinois simplifié.
   */
  locales: {
    ...Object.fromEntries(IOS_LOCALES.map((lang) => [lang, `./locales/ios/${lang}.json`])),
    'zh-Hans': './locales/ios/zh.json',
  },
  splash: {
    image: './assets/splash.png',
    backgroundColor: '#06070D',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.star5788.gorilla9158",
    // Universal Link WalletConnect : https://kalyxwallet.com/wc?uri=… (fichier
    // apple-app-site-association servi par le site, cf. web/public/.well-known).
    associatedDomains: ['applinks:kalyxwallet.com'],
    infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      /*
       * Lève le plafond de 60 fps d'iOS sur les écrans ProMotion : sans ce
       * drapeau, une app React Native reste bridée à 60 quel que soit l'écran.
       * Il n'a d'effet qu'au build.
       */
      CADisableMinimumFrameDuration: true,
      /*
       * Recommandé par Expo avec `locales` : laisse iOS et ses frameworks
       * localiser l'app dans la langue de l'appareil, y compris les textes
       * d'autorisation traduits.
       */
      CFBundleAllowMixedLocalizations: true,
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
        {
          CFBundleURLSchemes: [
            ...schemes,
            // Retour OAuth Google du client iOS (absent tant que l'ID iOS n'est pas fourni).
            ...(googleIosScheme ? [googleIosScheme] : []),
            'wc',
            'ethereum',
            'bitcoin',
            'solana',
            'ton',
            'tc',
          ],
        },
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
    //
    // RECORD_AUDIO BLOQUÉE (tools:node="remove") : Kalyx n'enregistre jamais de
    // son. Ce blocage était un effet de bord de `microphonePermission: false`
    // dans expo-image-picker ; ce champ porte désormais un texte iOS (cf.
    // MICROPHONE_TEXT), qui fait AJOUTER RECORD_AUDIO par le plugin : le
    // blocage est donc déclaré ici, explicitement, et l'emporte.
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
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
    /*
     * Textes iOS (NSFaceIDUsageDescription) : sans option, iOS affichait le
     * texte anglais par défaut d'Expo. Les deux plugins écrivent la MÊME clé ;
     * le texte est identique pour qu'aucun ordre d'application ne l'emporte.
     */
    ['expo-secure-store', { faceIDPermission: FACE_ID_TEXT }],
    ['expo-local-authentication', { faceIDPermission: FACE_ID_TEXT }],
    'expo-localization',
    // Calcul natif de scrypt / PBKDF2 (lib/nativeKdf) : le plugin relève la cible iOS au minimum du module si besoin.
    'react-native-quick-crypto',
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
        cameraPermission: CAMERA_TEXT,
        // Le scanner ne filme pas. iOS : texte honnête (cf. MICROPHONE_TEXT),
        // l'autorisation n'est jamais demandée. Android : pas de RECORD_AUDIO.
        microphonePermission: MICROPHONE_TEXT,
        recordAudioAndroid: false,
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
        photosPermission: PHOTOS_TEXT,
        // Aucune vidéo, donc jamais de micro. iOS : texte honnête (cf.
        // MICROPHONE_TEXT). Android : RECORD_AUDIO reste bloquée, par
        // `android.blockedPermissions` (ce plugin l'ajouterait sinon).
        microphonePermission: MICROPHONE_TEXT,
      },
    ],
    /*
      expo-audio : seulement des sons d'état courts, app au premier plan
      (lib/sound.ts). Son plugin n'était pas déclaré, ce qui n'empêchait pas son
      code natif d'enregistrement d'être lié (cf. MICROPHONE_TEXT).
      - `enableBackgroundPlayback: false` : sinon le plugin ajoute
        UIBackgroundModes `audio` (iOS — refusé en revue sans lecture en
        arrière-plan réelle) et un service de premier plan FOREGROUND_SERVICE /
        MEDIA_PLAYBACK (Android). Valeur par défaut : true.
      - `enableBackgroundRecording: false` : jamais d'enregistrement.
      - `recordAudioAndroid: false` : pas de RECORD_AUDIO (par défaut : true).
    */
    [
      'expo-audio',
      {
        microphonePermission: MICROPHONE_TEXT,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
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
