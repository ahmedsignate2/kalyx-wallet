import { detectInitialLanguage, resolveLanguage, applyRTL, isRtl } from '../../lib/i18n';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'ar', languageTag: 'ar-SA', textDirection: 'rtl' }]),
}));

jest.mock('react-native', () => {
  const manager = {
    isRTL: false,
    allowRTL: jest.fn((val: boolean) => {
      manager.isRTL = val;
    }),
    forceRTL: jest.fn((val: boolean) => {
      manager.isRTL = val;
    }),
  };
  return {
    I18nManager: manager,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('Language detection & RTL initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    I18nManager.isRTL = false;
  });

  test('detects Arabic when system language is ar and enables RTL', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('ar');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  test('detects supported language (e.g. en) and disables RTL', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('en');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  test('falls back to fr on unsupported language', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'xx' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('fr');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
  });

  test('resolveLanguage prioritizes stored user preference over system language', async () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    const lang = await resolveLanguage('en');
    expect(lang).toBe('en');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  test('resolveLanguage uses system Arabic when no stored preference exists', async () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const lang = await resolveLanguage(null);
    expect(lang).toBe('ar');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  test('gracefully falls back when expo-localization native module throws', () => {
    (Localization.getLocales as jest.Mock).mockImplementation(() => {
      throw new Error("Cannot find native module 'ExpoLocalization'");
    });
    expect(() => detectInitialLanguage()).not.toThrow();
  });
});
