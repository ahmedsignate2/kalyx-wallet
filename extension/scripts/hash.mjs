#!/usr/bin/env node
/**
 * EMPREINTE DU BUILD — pour vérifier que l'extension publiée est bien celle
 * de ce code source.
 *
 *   npm ci && npm run build && npm run hash
 *
 * Calcule le SHA-256 de chaque fichier de .output/chrome-mv3 (chemins triés),
 * puis l'empreinte globale = SHA-256 de la liste « chemin  empreinte ». Le zip
 * du store, lui, porte des dates : on compare le CONTENU, pas l'archive.
 * Deux builds du même commit, avec le même package-lock, donnent la même
 * empreinte globale ; elle est publiée avec chaque version.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(ROOT);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lines = files.map((f) => `${relative(ROOT, f).split('\\').join('/')}  ${sha(readFileSync(f))}`);
if (process.argv.includes('--list')) console.log(lines.join('\n'));
console.log(`${sha(lines.join('\n') + '\n')}  (${files.length} fichiers, ${ROOT})`);
