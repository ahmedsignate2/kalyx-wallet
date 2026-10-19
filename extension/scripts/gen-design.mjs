/**
 * Génère le DESIGN de l'extension à partir de celui de l'app, pour qu'ils ne
 * divergent jamais :
 *  - ui/tokens.css : couleurs Crème et Nuit, liseré, teintes des gestes
 *    (Envoyer, Recevoir…), ciel — lues dans ui/tokens.ts de l'app ;
 *  - ui/icons.ts : les icônes de l'app (ui/icon.tsx), même nom, même tracé :
 *    Phosphor « regular » et les glyphes maison au trait.
 * L'app importe react-native : bouchonné le temps de la lecture.
 *   node scripts/gen-design.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

/* ── Couleurs ── */
const src = readFileSync(join(root, 'ui/tokens.ts'), 'utf8').replace(/^import \{ Platform, type TextStyle \} from 'react-native';$/m, 'const Platform = { select: (o) => o.default };');
if (/from 'react-native'/.test(src)) throw new Error('imports de ui/tokens.ts changés : adapter le bouchon');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dir = mkdtempSync(join(tmpdir(), 'kalyx-tokens-'));
writeFileSync(join(dir, 'tokens.mjs'), js);
const tk = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);
rmSync(dir, { recursive: true, force: true });

const kebab = (k) => k.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);
const vars = (mode) => {
  const p = mode === 'dark' ? tk.dark : tk.light;
  const out = Object.entries(p).map(([k, v]) => `--${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tk.tints[mode])) out.push(`--tint-${k}: ${v.bg}; --ink-${k}: ${v.ink};`);
  return out.join(' ');
};
// Le verre posé sur le ciel de l'accueil (ui/theme.ts, palette `sky`) : mêmes variables, dans `.on-sky`.
const theme = readFileSync(join(root, 'ui/theme.ts'), 'utf8');
const skyBlock = theme.match(/const sky: Palette = \{([\s\S]*?)\n\};/);
if (!skyBlock) throw new Error('palette sky introuvable dans ui/theme.ts');
const skyVars = [...skyBlock[1].matchAll(/^\s+([a-zA-Z0-9]+): '([^']+)'/gm)].map((m) => `--${kebab(m[1])}: ${m[2]};`);
if (skyVars.length < 8) throw new Error('palette sky incomplète');
const darkBase = Object.entries(tk.dark).map(([k, v]) => `--${kebab(k)}: ${v};`).join(' ');
const css = `/* GÉNÉRÉ par scripts/gen-design.mjs depuis ui/tokens.ts de l'app — ne pas modifier à la main. */
:root { color-scheme: light; ${vars('light')} --gold: ${tk.BRAND_GOLD.light}; --gold-deep: ${tk.BRAND_GOLD.deep}; }
@media (prefers-color-scheme: dark) { :root { color-scheme: dark; ${vars('dark')} } }
.on-sky { color-scheme: dark; ${darkBase} ${skyVars.join(' ')} color: var(--text); }
`;
writeFileSync(join(here, '../ui/tokens.css'), css);

/* ── Icônes ── */
const iconSrc = readFileSync(join(root, 'ui/icon.tsx'), 'utf8');
const map = Object.fromEntries([...iconSrc.matchAll(/^\s+([a-zA-Z]+): \{ icon: ([A-Za-z]+)Icon/gm)].map((m) => [m[1], m[2]]));
const WANT = ['send', 'receive', 'buy', 'exchange', 'lock', 'gear', 'copy', 'chevron', 'caretDown', 'warning', 'check', 'checkmark', 'trendUp', 'trendDown', 'history', 'dapps', 'security', 'eye', 'eyeOff', 'errorCircle', 'alert', 'clock', 'walletconnect', 'about', 'support', 'reset', 'wallet', 'extensions', 'currency', 'add', 'import', 'create', 'phrase', 'arrowUpRight', 'sign'];
const defsDir = join(root, 'node_modules/phosphor-react-native/src/defs');
const icons = {};
for (const name of WANT) {
  const file = map[name];
  if (!file) throw new Error(`icône inconnue dans ui/icon.tsx : ${name}`);
  const def = readFileSync(join(defsDir, `${file}.tsx`), 'utf8');
  const regular = def.slice(def.indexOf("'regular'"));
  const block = regular.slice(0, regular.indexOf('</>'));
  const paths = [...block.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`tracé introuvable : ${file}`);
  icons[name] = { view: 256, fill: paths };
}
// Propres à l'extension (pas dans l'app) : le panneau latéral.
for (const [name, file] of [['sidebar', 'SidebarSimple']]) {
  const def = readFileSync(join(defsDir, `${file}.tsx`), 'utf8');
  const regular = def.slice(def.indexOf("'regular'"));
  icons[name] = { view: 256, fill: [...regular.slice(0, regular.indexOf('</>')).matchAll(/d="([^"]+)"/g)].map((m) => m[1]) };
}
// Glyphes maison au trait (une seule <Path d="…"> par entrée).
for (const name of ['back', 'close', 'bell', 'scan']) {
  const m = iconSrc.match(new RegExp(`^\\s+${name}: \\(\\) => <Path d="([^"]+)" />,`, 'm'));
  if (!m) throw new Error(`glyphe maison introuvable : ${name}`);
  icons[name] = { view: 24, stroke: [m[1]] };
}
writeFileSync(
  join(here, '../ui/icons.ts'),
  `/** GÉNÉRÉ par scripts/gen-design.mjs depuis ui/icon.tsx de l'app (Phosphor « regular » et glyphes maison) — ne pas modifier à la main. */\nexport const ICONS: Record<string, { view: number; fill?: string[]; stroke?: string[] }> = ${JSON.stringify(icons, null, 1)};\n`,
);
console.log(`tokens.css, ${Object.keys(icons).length} icônes`);
