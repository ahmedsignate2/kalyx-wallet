jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import { isPluralOne } from './i18n';

describe('isPluralOne', () => {
  const original = Intl.PluralRules;
  afterEach(() => {
    (Intl as { PluralRules?: typeof Intl.PluralRules }).PluralRules = original;
  });

  it('suit Intl.PluralRules quand le moteur le fournit', () => {
    expect(isPluralOne('en', 1)).toBe(true);
    expect(isPluralOne('en', 0)).toBe(false);
    expect(isPluralOne('fr', 0)).toBe(true);
  });

  it('ne plante pas sans Intl.PluralRules (Hermes iOS) et garde les règles CLDR', () => {
    (Intl as { PluralRules?: typeof Intl.PluralRules }).PluralRules = undefined;
    expect(isPluralOne('en', 1)).toBe(true);
    expect(isPluralOne('en', 0)).toBe(false);
    expect(isPluralOne('fr', 0)).toBe(true);
    expect(isPluralOne('fr', 2)).toBe(false);
    expect(isPluralOne('ru', 21)).toBe(true);
    expect(isPluralOne('ru', 11)).toBe(false);
    expect(isPluralOne('ja', 1)).toBe(false);
  });
});
