/**
 * Préférences utilisateur (non sensibles) : nom de profil, langue, devise fiat,
 * état du déverrouillage biométrique. Persistées localement.
 */
import { create } from 'zustand';
import { setNumberLocale } from '../src';
import { saveSettings, loadSettings } from './secureStore';
import { translate, type Lang, type Key, detectInitialLanguage, resolveLanguage, applyRTL, isRtl, USER_LANGUAGE_KEY } from './i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  hapticsEnabled: boolean;
  /** ISO de la dernière sauvegarde chiffrée réussie (fichier ou Drive), null sinon. */
  encryptedBackupAt: string | null;
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
  setHapticsEnabled: (on: boolean) => void;
  markEncryptedBackup: () => void;
  setBackupVerified: (on: boolean) => void;
}

function persist(
  s: Pick<
    SettingsState,
    | 'profileName' | 'language' | 'fiat' | 'biometricEnabled' | 'uiMode' | 'themePref' | 'favorites' | 'pinLength' | 'notifTx' | 'notifPrice' | 'securityScan' | 'showTestnets' | 'autoLockMinutes' | 'privacyGuard' | 'soundEnabled' | 'hapticsEnabled' | 'backupVerified' | 'encryptedBackupAt'
  >,
) {
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
    hapticsEnabled: s.hapticsEnabled,
    encryptedBackupAt: s.encryptedBackupAt,
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
  hapticsEnabled: true,
  encryptedBackupAt: null,
  backupVerified: false,

  load: async () => {
    const s = await loadSettings();
    const stored = (s?.language as string) || (await AsyncStorage.getItem(USER_LANGUAGE_KEY).catch(() => null));
    const language = await resolveLanguage(stored);
    setNumberLocale(language);
    set({
      loaded: true,
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
      hapticsEnabled: s?.hapticsEnabled !== false,
      encryptedBackupAt: typeof s?.encryptedBackupAt === 'string' ? s.encryptedBackupAt : null,
      backupVerified: s?.backupVerified === true,
    });
  },

  setSoundEnabled: (on) => {
    set({ soundEnabled: on });
    persist({ ...get(), soundEnabled: on });
  },
  setHapticsEnabled: (on) => {
    set({ hapticsEnabled: on });
    persist({ ...get(), hapticsEnabled: on });
  },
  markEncryptedBackup: () => {
    const encryptedBackupAt = new Date().toISOString();
    set({ encryptedBackupAt });
    persist({ ...get(), encryptedBackupAt });
  },
  setBackupVerified: (on) => {
    set({ backupVerified: on });
    persist({ ...get(), backupVerified: on });
  },

  setProfileName: (name) => {
    set({ profileName: name });
    persist({ ...get(), profileName: name });
  },
  setLanguage: (language) => {
    setNumberLocale(language);
    applyRTL(isRtl(language));
    set({ language });
    persist({ ...get(), language });
    AsyncStorage.setItem(USER_LANGUAGE_KEY, language).catch(() => {});
  },
  setFiat: (fiat) => {
    set({ fiat });
    persist({ ...get(), fiat });
  },
  setBiometricEnabled: (biometricEnabled) => {
    set({ biometricEnabled });
    persist({ ...get(), biometricEnabled });
  },
  setUiMode: (uiMode) => {
    set({ uiMode });
    persist({ ...get(), uiMode });
  },
  setThemePref: (themePref) => {
    set({ themePref });
    persist({ ...get(), themePref });
  },
  toggleFavorite: (coinId) => {
    const cur = get().favorites;
    const favorites = cur.includes(coinId) ? cur.filter((id) => id !== coinId) : [...cur, coinId];
    set({ favorites });
    persist({ ...get(), favorites });
  },
  setPinLength: (pinLength) => {
    if (pinLength === get().pinLength) return;
    set({ pinLength });
    persist({ ...get(), pinLength });
  },
  setNotifPref: (key, on) => {
    set({ [key]: on } as Pick<SettingsState, 'notifTx' | 'notifPrice'>);
    persist({ ...get(), [key]: on });
  },
  setFlag: (key, on) => {
    set({ [key]: on } as Pick<SettingsState, 'securityScan' | 'showTestnets'>);
    persist({ ...get(), [key]: on });
  },
  setAutoLockMinutes: (min) => {
    set({ autoLockMinutes: min });
    persist({ ...get(), autoLockMinutes: min });
  },
  setPrivacyGuard: (privacyGuard) => {
    set({ privacyGuard });
    persist({ ...get(), privacyGuard });
  },
}));

/** Hook de traduction lié à la langue courante. */
export function useT(): (key: Key) => string {
  const lang = useSettings((s) => s.language);
  return (key: Key) => translate(lang, key);
}

export function fiatSymbol(code: string): string {
  return FIATS.find((f) => f.code === code)?.symbol ?? code.toUpperCase();
}
