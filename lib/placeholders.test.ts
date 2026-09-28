jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import { translate, LANGUAGES, ALL_KEYS } from './i18n';

/**
 * Chaque traduction garde EXACTEMENT les emplacements de l'anglais (`${…}` et
 * `{…}`) : un emplacement traduit ou perdu s'affiche tel quel à l'écran.
 */
// Emplacements distincts (une langue peut en répéter un, ou non). Plus aucun `${…}` : ce serait du code affiché tel quel.
const tokens = (s: string) => [...new Set(s.match(/\$\{[^}]*\}|\{[a-zA-Z_]+\}/g) ?? [])].sort();

it('mêmes emplacements dans les 15 langues', () => {
  const langs: string[] = (LANGUAGES as unknown as { code: string }[]).map((l) => l.code);
  const keys: string[] = ALL_KEYS;
  expect(keys.length).toBeGreaterThan(1000);
  const bad: string[] = [];
  for (const k of keys) {
    const ref = tokens(translate('en' as never, k as never)).join('|');
    for (const lang of langs) {
      const got = tokens(String(translate(lang as never, k as never) ?? '')).join('|');
      if (got !== ref) bad.push(`${lang}.${k}: ${got} ≠ ${ref}`);
    }
  }
  expect(bad).toEqual([]);
  expect(keys.filter((k) => /\$\{/.test(translate('en' as never, k as never)))).toEqual([]);
});
