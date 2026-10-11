/**
 * Parité des traductions : chaque clé existe dans les 15 langues, n'est jamais
 * vide, et garde les mêmes variables `{nom}` que l'anglais. Couvre les trois
 * sources de textes : lib/i18n.ts (app), ui/web/webI18n.ts (tableau de bord
 * web) et locales/*.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ALL_KEYS, LANGUAGES, RAW_DICTIONARIES, type Lang } from '../../lib/i18n';
import { WEB_DICTIONARIES } from '../../ui/web/webI18n';

jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'web' }, NativeModules: {} }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }));
jest.mock('../../lib/settingsStore', () => ({ useSettings: () => 'en' }));

const CODES = LANGUAGES.map((l) => l.code);
const placeholders = (v: string | undefined) => [...new Set(v?.match(/\{[a-zA-Z_]+\}/g) ?? [])].sort();

type Dicts = Readonly<Record<Lang, Readonly<Partial<Record<string, string>>>>>;

function checkParity(dicts: Dicts, reference: readonly string[]) {
  const missing: string[] = [];
  const extra: string[] = [];
  const empty: string[] = [];
  const vars: string[] = [];
  for (const lang of CODES) {
    const dict = dicts[lang];
    for (const key of reference) {
      const v = dict[key];
      if (v === undefined) missing.push(`${lang}.${key}`);
      else if (v.trim() === '') empty.push(`${lang}.${key}`);
      else if (placeholders(v).join() !== placeholders(dicts.en[key]).join()) vars.push(`${lang}.${key}`);
    }
    for (const key of Object.keys(dict)) if (!reference.includes(key)) extra.push(`${lang}.${key}`);
  }
  return { missing, extra, empty, vars };
}

const clean = { missing: [], extra: [], empty: [], vars: [] };

describe('i18n parity — 15 languages', () => {
  test('exactly 15 languages, one dictionary each', () => {
    expect(CODES).toHaveLength(15);
    expect(Object.keys(RAW_DICTIONARIES).sort()).toEqual([...CODES].sort());
    expect(Object.keys(WEB_DICTIONARIES).sort()).toEqual([...CODES].sort());
  });

  test('lib/i18n.ts: every key exists in every language, same {variables}', () => {
    expect(checkParity(RAW_DICTIONARIES as Dicts, ALL_KEYS)).toEqual(clean);
  });

  test('ui/web/webI18n.ts: every key exists in every language, same {variables}', () => {
    expect(checkParity(WEB_DICTIONARIES as Dicts, Object.keys(WEB_DICTIONARIES.en))).toEqual(clean);
  });

  test('locales/*.json: one file per language, same keys, same {variables}', () => {
    const dir = path.join(__dirname, '../../locales');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.map((f) => f.replace(/\.json$/, '')).sort()).toEqual([...CODES].sort());
    // Sections imbriquées (« legal », « transaction.action ») : clés aplaties en « a.b ».
    const flatten = (o: Record<string, unknown>, prefix = ''): Record<string, string> =>
      Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        return v && typeof v === 'object' ? { ...acc, ...flatten(v as Record<string, unknown>, key) } : { ...acc, [key]: String(v) };
      }, {});
    const dicts = Object.fromEntries(
      CODES.map((c) => [c, flatten(JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')))]),
    ) as unknown as Dicts;
    expect(checkParity(dicts, Object.keys(dicts.en))).toEqual(clean);
  });
});
