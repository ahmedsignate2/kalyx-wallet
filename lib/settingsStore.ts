/**
 * Préférences utilisateur (non sensibles) : nom de profil, langue, devise fiat,
 * état du déverrouillage biométrique. Persistées localement.
 */
import { create } from 'zustand';
import { saveSettings, loadSettings } from './secureStore';
import { translate, type Lang, type Key } from './i18n';

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
}

function persist(
  s: Pick<
    SettingsState,
    | 'profileName' | 'language' | 'fiat' | 'biometricEnabled' | 'uiMode' | 'themePref' | 'favorites' | 'pinLength' | 'notifTx' | 'notifPrice'
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
  });
}

export const useSettings = create<SettingsState>((set, get) => ({
  loaded: false,
  profileName: '',
  language: 'fr',
  fiat: 'eur',
  biometricEnabled: false,
  uiMode: 'beginner',
  themePref: 'system',
  favorites: [],
  pinLength: 0,
  notifTx: true,
  notifPrice: true,

  load: async () => {
    const s = await loadSettings();
    set({
      loaded: true,
      profileName: (s?.profileName as string) ?? '',
      language: (s?.language as Lang) ?? 'fr',
      fiat: (s?.fiat as string) ?? 'eur',
      biometricEnabled: (s?.biometricEnabled as boolean) ?? false,
      uiMode: (s?.uiMode as UiMode) ?? 'beginner',
      themePref: (s?.themePref as ThemePref) ?? 'system',
      favorites: Array.isArray(s?.favorites) ? (s.favorites as string[]) : [],
      pinLength: typeof s?.pinLength === 'number' ? (s.pinLength as number) : 0,
      notifTx: s?.notifTx !== false,
      notifPrice: s?.notifPrice !== false,
    });
  },

  setProfileName: (name) => {
    set({ profileName: name });
    persist({ ...get(), profileName: name });
  },
  setLanguage: (language) => {
    set({ language });
    persist({ ...get(), language });
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
}));

/** Hook de traduction lié à la langue courante. */
export function useT(): (key: Key) => string {
  const lang = useSettings((s) => s.language);
  return (key: Key) => translate(lang, key);
}

export function fiatSymbol(code: string): string {
  return FIATS.find((f) => f.code === code)?.symbol ?? code.toUpperCase();
}
