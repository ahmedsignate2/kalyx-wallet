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

  load: () => Promise<void>;
  setProfileName: (name: string) => void;
  setLanguage: (lang: Lang) => void;
  setFiat: (fiat: string) => void;
  setBiometricEnabled: (on: boolean) => void;
  setUiMode: (mode: UiMode) => void;
  setThemePref: (pref: ThemePref) => void;
}

function persist(
  s: Pick<SettingsState, 'profileName' | 'language' | 'fiat' | 'biometricEnabled' | 'uiMode' | 'themePref'>,
) {
  void saveSettings({
    profileName: s.profileName,
    language: s.language,
    fiat: s.fiat,
    biometricEnabled: s.biometricEnabled,
    uiMode: s.uiMode,
    themePref: s.themePref,
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
}));

/** Hook de traduction lié à la langue courante. */
export function useT(): (key: Key) => string {
  const lang = useSettings((s) => s.language);
  return (key: Key) => translate(lang, key);
}

export function fiatSymbol(code: string): string {
  return FIATS.find((f) => f.code === code)?.symbol ?? code.toUpperCase();
}
