/**
 * Régénère PRIVACY.md et TERMS.md depuis la source unique (web/content, en
 * français, qui fait foi). Ces copies avaient divergé du texte de l'app.
 *   node scripts/gen-legal-md.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

function load(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, () => ({}));
  return mod.exports;
}

const legal = fs.readFileSync(path.join(root, 'lib/legalText.ts'), 'utf8');
const updated = legal.match(/LEGAL_UPDATED = '([^']+)'/)[1];
const header = `Éditeur : **KALYX (Entreprise individuelle de Ahamed Signate)** · SIREN 130 046 865 · Contact : support@kalyxwallet.com ou Telegram @kalyxntw (https://t.me/kalyxntw)`;

for (const [file, out, title] of [
  ['web/content/privacy.ts', 'PRIVACY.md', 'Politique de confidentialité'],
  ['web/content/terms.ts', 'TERMS.md', "Conditions d'utilisation"],
]) {
  const { sections } = load(file);
  const body = sections.map((s) => `## ${s.title}\n${s.body.trim()}\n`).join('\n');
  const md = `# ${title} — Kalyx Wallet\n\n_Dernière mise à jour : ${updated}_\n\n> Généré par \`scripts/gen-legal-md.mjs\` depuis \`${file}\` (source unique, aussi affichée par l'app et le site). Le français fait foi.\n\n${header}\n\n${body}`;
  fs.writeFileSync(path.join(root, out), md);
  console.log(`${out} : ${sections.length} sections`);
}
