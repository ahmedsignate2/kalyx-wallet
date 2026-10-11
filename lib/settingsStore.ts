/**
 * Préférences utilisateur (non sensibles) : nom de profil, langue, devise fiat,
 * état du déverrouillage biométrique. Persistées localement.
 */
import { create } from 'zustand';
import { useCallback } from 'react';
import { setNumberLocale, getAdapter, hasChain, type ActivityTranslate, type ExplainT } from '../src';
import { saveSettings, loadSettings } from './secureStore';
import { translate, type Lang, type Key, detectInitialLanguage, resolveLanguage, applyRTL, isRtl, USER_LANGUAGE_KEY } from './i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDecoySession, onDecoyChange } from './sessionMode';

export const FIATS = [
  { code: 'eur', symbol: '€', name: 'Euro' },
  { code: 'usd', symbol: '$', name: 'US Dollar' },
  { code: 'gbp', symbol: '£', name: 'British Pound' },
  { code: 'chf', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'jpy', symbol: '¥', name: 'Japanese Yen' },
  { code: 'cad', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'aud', symbol: 'A$', name: 'Australian Dollar' },
] as const;

export type UiMode = 'beginner' | 'expert';
/** Apparence : suivre l'OS, ou forcer sombre/clair. */
export type ThemePref = 'system' | 'dark' | 'light';

interface SettingsState {
  loaded: boolean;
  profileName: string;
  language: Lang;
  fiat: string;
  biometricEnabled: boolean;
  uiMode: UiMode;
  themePref: ThemePref;
  /** Cryptos épinglées (ids CoinGecko) — onglet Favoris de l'accueil. */
  favorites: string[];
  /**
   * Longueur du PIN (6–12), pour afficher le bon nombre de ronds au
   * déverrouillage. 0 = inconnue (anciens wallets) → affichage progressif.
   * NB : n'expose QUE la longueur, jamais le PIN ; le coffre reste chiffré.
   */
  pinLength: number;
  /** Catégories de notifications activées. */
  notifTx: boolean;
  notifPrice: boolean;
  /** Modules / fonctions (écran Extensions). */
  securityScan: boolean; // analyse GoPlus avant signature
  showTestnets: boolean; // réseaux de test dans le sélecteur
  /** Verrouillage auto (minutes en arrière-plan) : 0 = immédiat, -1 = jamais. */
  autoLockMinutes: number;
  /** Écran de garde : masque le contenu dans le sélecteur d'apps récentes. */
  privacyGuard: boolean;
  /** Sons de l'application (triptyque succès, etc) */
  soundEnabled: boolean;
  /**
   * Outils de l'assistant IA (mesures en lecture seule). DÉSACTIVÉ par défaut,
   * et volontairement : l'app accepte n'importe quel modèle, y compris des 8B
   * ou un endpoint personnalisé. Qui l'active l'assume ; personne n'y est
   * poussé, et l'assistant fonctionne sans.
   */
  aiToolsEnabled: boolean;
  hapticsEnabled: boolean;
  /** ISO de la dernière sauvegarde chiffrée réussie (fichier ou Drive), null sinon. */
  encryptedBackupAt: string | null;
  /** ISO de la dernière sauvegarde Google Drive réussie, null sinon. */
  driveBackupAt: string | null;
  /**
   * Empreinte de ce que contient la dernière sauvegarde chiffrée (lib/backupDigest.ts) :
   * sans elle, la date seule disait « sauvegardé » même après un nouveau portefeuille.
   * `null` avec une date = sauvegarde antérieure à cette version, ou de contenu inconnu.
   */
  backupDigest: string | null;
  /** Phrase de récupération vérifiée (3 mots) — critère du centre de sécurité. */
  backupVerified: boolean;

  load: () => Promise<void>;
  setProfileName: (name: string) => void;
  setLanguage: (lang: Lang) => void;
  setFiat: (fiat: string) => void;
  setBiometricEnabled: (on: boolean) => void;
  setUiMode: (mode: UiMode) => void;
  setThemePref: (pref: ThemePref) => void;
  toggleFavorite: (coinId: string) => void;
  setPinLength: (n: number) => void;
  setNotifPref: (key: 'notifTx' | 'notifPrice', on: boolean) => void;
  setFlag: (key: 'securityScan' | 'showTestnets', on: boolean) => void;
  setAutoLockMinutes: (min: number) => void;
  setPrivacyGuard: (on: boolean) => void;
  setSoundEnabled: (on: boolean) => void;
  setAiToolsEnabled: (on: boolean) => void;
  setHapticsEnabled: (on: boolean) => void;
  /** `digest` : empreinte du contenu sauvegardé ; absent, prise auprès de walletStore. */
  markEncryptedBackup: (kind?: 'file' | 'drive', digest?: string | null) => void;
  /** Date constatée sur Drive (vérification en ligne) : écrase la mémoire locale. */
  setDriveBackupAt: (iso: string) => void;
  setBackupVerified: (on: boolean) => void;
}

type Persisted = Pick<
  SettingsState,
  | 'profileName' | 'language' | 'fiat' | 'biometricEnabled' | 'uiMode' | 'themePref' | 'favorites' | 'pinLength' | 'notifTx' | 'notifPrice' | 'securityScan' | 'showTestnets' | 'autoLockMinutes' | 'privacyGuard' | 'soundEnabled' | 'aiToolsEnabled' | 'hapticsEnabled' | 'backupVerified' | 'encryptedBackupAt' | 'driveBackupAt' | 'backupDigest'
>;

/*
 * Changements faits AVANT la fin de `load()` (ex. unlock.tsx → setPinLength).
 * Écrire à ce moment-là enregistrait `{ ...get() }`, c'est-à-dire les valeurs
 * PAR DÉFAUT, par-dessus les vrais réglages du disque. On ne garde donc que le
 * changement lui-même : `load()` le réapplique sur les valeurs lues, puis
 * écrit. Si `load()` échoue, rien n'est écrit — l'état mémoire suit l'utilisateur,
 * le disque reste intact (perdre un réglage vaut mieux que les écraser tous).
 */
let pending: Partial<Persisted> | null = null;

function persist(patch: Partial<Persisted>) {
  const cur = useSettings.getState();
  if (!cur.loaded) {
    pending = { ...pending, ...patch };
    return;
  }
  write({ ...cur, ...patch });
}

function write(s: Persisted) {
  void saveSettings({
    profileName: s.profileName,
    language: s.language,
    fiat: s.fiat,
    biometricEnabled: s.biometricEnabled,
    uiMode: s.uiMode,
    themePref: s.themePref,
    favorites: s.favorites,
    pinLength: s.pinLength,
    notifTx: s.notifTx,
    notifPrice: s.notifPrice,
    securityScan: s.securityScan,
    showTestnets: s.showTestnets,
    autoLockMinutes: s.autoLockMinutes,
    privacyGuard: s.privacyGuard,
    soundEnabled: s.soundEnabled,
    aiToolsEnabled: s.aiToolsEnabled,
    hapticsEnabled: s.hapticsEnabled,
    encryptedBackupAt: s.encryptedBackupAt,
    driveBackupAt: s.driveBackupAt,
    backupDigest: s.backupDigest,
    backupVerified: s.backupVerified,
  });
}

export const useSettings = create<SettingsState>((set, get) => ({
  loaded: false,
  profileName: '',
  language: detectInitialLanguage(),
  fiat: 'eur',
  biometricEnabled: false,
  uiMode: 'beginner',
  themePref: 'system',
  favorites: [],
  pinLength: 0,
  notifTx: true,
  notifPrice: true,
  securityScan: true,
  showTestnets: false, // testnets/devnets cachés par défaut (activables via Développeur)
  autoLockMinutes: 3,
  privacyGuard: true,
  soundEnabled: true,
  aiToolsEnabled: false,
  hapticsEnabled: true,
  encryptedBackupAt: null,
  driveBackupAt: null,
  backupDigest: null,
  backupVerified: false,

  load: async () => {
    const s = await loadSettings();
    const stored = (s?.language as string) || (await AsyncStorage.getItem(USER_LANGUAGE_KEY).catch(() => null));
    const language = await resolveLanguage(stored);
    const fromDisk: Persisted = {
      profileName: (s?.profileName as string) ?? '',
      language,
      fiat: (s?.fiat as string) ?? 'eur',
      biometricEnabled: (s?.biometricEnabled as boolean) ?? false,
      uiMode: (s?.uiMode as UiMode) ?? 'beginner',
      themePref: (s?.themePref as ThemePref) ?? 'system',
      favorites: Array.isArray(s?.favorites) ? (s.favorites as string[]) : [],
      pinLength: typeof s?.pinLength === 'number' ? (s.pinLength as number) : 0,
      notifTx: s?.notifTx !== false,
      notifPrice: s?.notifPrice !== false,
      securityScan: s?.securityScan !== false,
      showTestnets: s?.showTestnets === true, // défaut false (caché) sauf activation explicite
      autoLockMinutes: typeof s?.autoLockMinutes === 'number' ? (s.autoLockMinutes as number) : 3,
      privacyGuard: s?.privacyGuard !== false,
      soundEnabled: s?.soundEnabled !== false,
      // Opt-in strict : absent en stockage = désactivé.
      aiToolsEnabled: s?.aiToolsEnabled === true,
      hapticsEnabled: s?.hapticsEnabled !== false,
      encryptedBackupAt: typeof s?.encryptedBackupAt === 'string' ? s.encryptedBackupAt : null,
      driveBackupAt: typeof s?.driveBackupAt === 'string' ? s.driveBackupAt : null,
      backupDigest: typeof s?.backupDigest === 'string' ? s.backupDigest : null,
      backupVerified: s?.backupVerified === true,
    };
    // Changements faits pendant le chargement : réappliqués sur le disque lu, puis écrits.
    const queued = pending;
    pending = null;
    const next = { ...fromDisk, ...queued };
    setNumberLocale(next.language);
    set({ loaded: true, ...next });
    if (queued) write(next);
    if (isDecoySession()) set(DECOY_MASK);
  },

  setSoundEnabled: (on) => {
    set({ soundEnabled: on });
    persist({ soundEnabled: on });
  },
  setAiToolsEnabled: (on) => {
    set({ aiToolsEnabled: on });
    persist({ aiToolsEnabled: on });
  },
  setHapticsEnabled: (on) => {
    set({ hapticsEnabled: on });
    persist({ hapticsEnabled: on });
  },
  /*
   * L'empreinte n'est PAS touchée ici : la vérification en ligne prouve qu'un
   * fichier existe sur Drive, pas ce qu'il contient. Poser l'empreinte courante
   * déclarerait à jour une sauvegarde peut-être ancienne, rien qu'en la
   * consultant. Sans sauvegarde connue avant (réinstallation), l'empreinte reste
   * `null` : « à vérifier », l'utilisateur est invité à la refaire une fois.
   */
  setDriveBackupAt: (iso) => {
    const patch = { driveBackupAt: iso, encryptedBackupAt: get().encryptedBackupAt ?? iso };
    set(patch);
    persist(patch);
  },
  markEncryptedBackup: (kind = 'file', digest) => {
    const now = new Date().toISOString();
    // `require` différé : walletStore importe ce module (même raison que dans setFlag).
    // Empreinte introuvable : `null`, donc « à vérifier » — jamais un faux « à jour ».
    let backupDigest: string | null = null;
    if (digest !== undefined) backupDigest = digest;
    else {
      try {
        backupDigest = (require('./walletStore') as typeof import('./walletStore')).backupDigestToRecord();
      } catch {
        backupDigest = null;
      }
    }
    const patch = kind === 'drive' ? { encryptedBackupAt: now, driveBackupAt: now, backupDigest } : { encryptedBackupAt: now, backupDigest };
    set(patch);
    persist(patch);
  },
  setBackupVerified: (on) => {
    set({ backupVerified: on });
    persist({ backupVerified: on });
  },

  setProfileName: (name) => {
    set({ profileName: name });
    persist({ profileName: name });
  },
  setLanguage: (language) => {
    setNumberLocale(language);
    applyRTL(isRtl(language));
    set({ language });
    persist({ language });
    AsyncStorage.setItem(USER_LANGUAGE_KEY, language).catch(() => {});
  },
  setFiat: (fiat) => {
    set({ fiat });
    persist({ fiat });
  },
  setBiometricEnabled: (biometricEnabled) => {
    set({ biometricEnabled });
    persist({ biometricEnabled });
  },
  setUiMode: (uiMode) => {
    set({ uiMode });
    persist({ uiMode });
  },
  setThemePref: (themePref) => {
    set({ themePref });
    persist({ themePref });
  },
  toggleFavorite: (coinId) => {
    // Avant `load()`, la liste en mémoire est vide : basculer ici remplacerait les favoris enregistrés.
    if (!get().loaded) return;
    const cur = get().favorites;
    const favorites = cur.includes(coinId) ? cur.filter((id) => id !== coinId) : [...cur, coinId];
    set({ favorites });
    persist({ favorites });
  },
  setPinLength: (pinLength) => {
    // « Inchangé » n'a de sens qu'une fois les réglages lus (avant, c'est la valeur par défaut).
    if (get().loaded && pinLength === get().pinLength) return;
    set({ pinLength });
    persist({ pinLength });
  },
  setNotifPref: (key, on) => {
    set({ [key]: on } as Pick<SettingsState, 'notifTx' | 'notifPrice'>);
    persist({ [key]: on } as Partial<Persisted>);
  },
  setFlag: (key, on) => {
    set({ [key]: on } as Pick<SettingsState, 'securityScan' | 'showTestnets'>);
    persist({ [key]: on } as Partial<Persisted>);
    // Testnets masqués alors que le réseau actif en est un : retour au réseau par
    // défaut (comme customChainsStore.remove), sinon il resterait actif mais
    // invisible dans le sélecteur. `require` différé : walletStore importe ce module.
    if (key === 'showTestnets' && !on) {
      const { useWallet, DEFAULT_CHAIN } = require('./walletStore') as typeof import('./walletStore');
      const w = useWallet.getState();
      if (hasChain(w.activeChain) && getAdapter(w.activeChain).config.testnet) w.setActiveChain(DEFAULT_CHAIN);
    }
  },
  setAutoLockMinutes: (min) => {
    set({ autoLockMinutes: min });
    persist({ autoLockMinutes: min });
  },
  setPrivacyGuard: (privacyGuard) => {
    set({ privacyGuard });
    persist({ privacyGuard });
  },
}));

/**
 * Hook de traduction lié à la langue courante. Fonction STABLE tant que la
 * langue ne change pas : une nouvelle à chaque rendu invalidait tous les
 * useMemo/useCallback qui en dépendent.
 */
export function useT(): (key: Key) => string {
  const lang = useSettings((s) => s.language);
  return useCallback((key: Key) => translate(lang, key), [lang]);
}

/**
 * Traducteur des phrases d'activité, paramètres substitués.
 *
 * `humanizeTx` est un module de domaine : il ne connaît pas la langue et ne peut
 * donc pas écrire ses phrases — il rend une clé et des paramètres. Ce crochet
 * fait le pont, à un seul endroit, plutôt que de laisser chaque écran refaire
 * la même substitution.
 *
 * Les motifs sont de la forme `{amount}` ; `split`/`join` plutôt que `replace`,
 * qui ne remplacerait que la première occurrence et interpréterait `$&` dans la
 * valeur — un nom de contact contenant `$` corromprait la phrase.
 */
export function useActivityT(): ActivityTranslate {
  const lang = useSettings((s) => s.language);
  return useCallback<ActivityTranslate>((key, params) => {
    let out = translate(lang, key as Key);
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v);
    }
    return out;
  }, [lang]);
}

/** Traducteur de la fenêtre de signature (`explainRequest`) : même substitution `{param}`. */
export function useExplainT(): ExplainT {
  const lang = useSettings((s) => s.language);
  return useCallback<ExplainT>((key, params) => {
    let out = translate(lang, key as Key);
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v);
    }
    return out;
  }, [lang]);
}

export function fiatSymbol(code: string): string {
  return FIATS.find((f) => f.code === code)?.symbol ?? code.toUpperCase();
}

/**
 * Session LEURRE : les réglages sont lus (langue, thème…), mais l'état de
 * sauvegarde et le nom de profil appartiennent aux VRAIS portefeuilles. Un
 * « sauvegarde faite le 3 octobre » sur un leurre créé hier le trahirait.
 * Masqués en mémoire seulement : le pare-feu d'écriture empêche de toute façon
 * de réécrire `nova.settings` pendant la session.
 */
const DECOY_MASK: Partial<SettingsState> = { encryptedBackupAt: null, driveBackupAt: null, backupDigest: null, backupVerified: false, profileName: '' };
onDecoyChange((on) => {
  if (on) useSettings.setState(DECOY_MASK);
});

