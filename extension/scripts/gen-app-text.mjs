/**
 * Génère ui/appText.ts : les phrases d'EXPLICATION (ex*, gp*) et d'ACTIVITÉ
 * (act*) de l'app (lib/i18n.ts), dans ses 15 langues, mot pour mot. L'app
 * importe react-native : on ne la charge pas dans l'extension, on en extrait
 * les dictionnaires ici (react-native remplacé par des bouchons, le temps de
 * la lecture). À relancer après une modification des textes de l'app :
 *   node scripts/gen-app-text.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../lib/i18n.ts'), 'utf8')
  .replace(/^import \{ I18nManager, Platform, NativeModules \} from 'react-native';$/m, 'const I18nManager = { allowRTL() {}, forceRTL() {} }, Platform = { OS: "web" }, NativeModules = {};')
  .replace(/^import AsyncStorage from '@react-native-async-storage\/async-storage';$/m, 'const AsyncStorage = { getItem: async () => null };');
if (/from 'react-native'|async-storage'/.test(src)) throw new Error('imports de lib/i18n.ts changés : adapter les bouchons');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/\brequire\(/g, '(() => { throw 0; })(');
const dir = mkdtempSync(join(tmpdir(), 'kalyx-i18n-'));
const file = join(dir, 'i18n.mjs');
writeFileSync(file, js);
const app = await import(pathToFileURL(file).href);
rmSync(dir, { recursive: true, force: true });

const KEEP = /^(act|ex|gp)[A-Z_]/;
const langs = app.LANGUAGES.map((l) => l.code);
const out = {};
for (const lang of langs) {
  const d = app.RAW_DICTIONARIES[lang];
  out[lang] = Object.fromEntries(Object.keys(d).filter((k) => KEEP.test(k)).sort().map((k) => [k, d[k]]));
}
const body =
  '/**\n * GÉNÉRÉ par scripts/gen-app-text.mjs depuis lib/i18n.ts de l\'app — ne pas modifier à la main.\n' +
  ' * Phrases d\'explication (ex*, gp*) et d\'activité (act*), 15 langues ; l\'anglais sert de repli.\n */\n' +
  `export const APP_TEXT: Record<string, Record<string, string>> = ${JSON.stringify(out, null, 1)};\n`;
writeFileSync(join(here, '../ui/appText.ts'), body);
console.log(langs.map((l) => `${l}:${Object.keys(out[l]).length}`).join(' '));
