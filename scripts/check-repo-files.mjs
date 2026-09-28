#!/usr/bin/env node
/**
 * Garde du dépôt : échoue si un fichier suivi par git ne devrait pas l'être
 * (secret, base de données, historique de conversation, build, brouillon).
 * Le .gitignore empêche l'ajout par erreur ; ceci attrape les `git add -f`.
 */
import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, 'fichier .env'],
  [/(^|\/)\.dev\.vars$/, 'secrets Wrangler'],
  [/\.(pem|key|keystore|jks|p8|p12|pfx|mobileprovision)$/i, 'clé ou certificat'],
  [/(^|\/)(credentials(\.json)?|google-services\.json|GoogleService-Info\.plist)(\/|$)/, 'identifiants'],
  [/\.(db|sqlite3?|bak|backup|dump|kalyxbackup)$|\.db-/i, 'base de données / sauvegarde'],
  [/(^|\/)conversation[^/]*$/i, 'historique de conversation'],
  [/\.(apk|aab|ipa|zip|tar|tgz|7z|rar|log|tsbuildinfo)$|\.tar\.gz$/i, 'binaire / archive / journal'],
  [/(^|\/)(node_modules|dist|build|coverage|\.next|\.expo|\.wrangler|scratch|tmp)\//, 'dossier généré ou brouillon'],
  [/^(android|ios)\//, 'natif généré (expo prebuild)'],
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const bad = [];
for (const f of files) {
  const hit = FORBIDDEN.find(([re]) => re.test(f));
  if (hit) bad.push(`${f}  (${hit[1]})`);
}
if (bad.length) {
  console.error('Fichiers interdits dans le dépôt :\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`OK : ${files.length} fichiers suivis, aucun interdit.`);
