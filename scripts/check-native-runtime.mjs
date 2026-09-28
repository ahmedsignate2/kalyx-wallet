#!/usr/bin/env node
/**
 * Garde du runtime natif (voir `runtimeVersion` dans app.config.ts).
 *
 * Le runtime est un numéro fixe, partagé par le build et les mises à jour OTA.
 * Si le NATIF change (module natif ajouté, plugin, version de React Native…)
 * sans que ce numéro change, une OTA enverrait du JavaScript qui appelle un
 * module absent de l'APK installé : l'app planterait chez l'utilisateur.
 *
 * Ce script recalcule l'empreinte native (@expo/fingerprint, Android) et la
 * compare à celle enregistrée dans native-runtime.json :
 *   - empreinte inchangée                 → OK
 *   - empreinte changée, runtime inchangé → ÉCHEC : incrémenter NATIVE_RUNTIME
 *   - runtime changé, non enregistré      → ÉCHEC : lancer avec --record
 *
 *   node scripts/check-native-runtime.mjs            vérifier
 *   node scripts/check-native-runtime.mjs --record   enregistrer (après incrément)
 *
 * Calculé avec un profil de build FIXE (aucun) : la configuration évaluée en
 * dépend, et deux profils donneraient deux empreintes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createFingerprintAsync, SourceSkips } from '@expo/fingerprint';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.join(root, 'native-runtime.json');
delete process.env.EAS_BUILD_PROFILE;
/*
 * MÊME CALCUL SUR TOUTES LES MACHINES. Expo charge `.env` tout seul, et
 * app.config.ts en lit `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (schéma d'URL Google) :
 * la machine de build (avec .env), celle de dev et la CI (sans) calculaient
 * des empreintes différentes pour le même code. Ni `.env` ni cette variable
 * n'entrent dans le calcul. À retenir : changer l'ID client Google change le
 * natif — nouvel APK, sans que cette garde le signale.
 */
process.env.EXPO_NO_DOTENV = '1';
delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

const config = fs.readFileSync(path.join(root, 'app.config.ts'), 'utf8');
const runtime = config.match(/export const NATIVE_RUNTIME = '([^']+)'/)?.[1];
if (!runtime) {
  console.error('NATIVE_RUNTIME introuvable dans app.config.ts');
  process.exit(2);
}
/*
 * Sources exclues de l'empreinte :
 *
 *   GitIgnore — `.gitignore` est inclus comme source `bareGitIgnore` par
 *   l'outil, mais il ne change rien à l'APK. `ignorePaths` ne le filtre pas
 *   (c'est un chemin spécial) ; seul `sourceSkips` fonctionne.
 *
 *   ExpoConfigRuntimeVersionIfString — le runtime est une chaîne fixe ;
 *   l'incrémenter ne doit pas changer l'empreinte, sinon on a un cycle.
 *
 *   ExpoConfigVersions — APP_VERSION varie par profil de build (supprimé
 *   ci-dessus), mais ça ne touche pas le natif.
 */
const sourceSkips =
  SourceSkips.GitIgnore |
  SourceSkips.ExpoConfigRuntimeVersionIfString |
  SourceSkips.ExpoConfigVersions;

const { hash, sources } = await createFingerprintAsync(root, { platforms: ['android'], sourceSkips });

// Diagnostic : une ligne par source, pour comparer deux machines (`diff`).
if (process.argv.includes('--sources')) {
  for (const s of sources) console.log(`${s.hash ?? '-'} ${s.type} ${s.filePath ?? s.id}`);
  process.exit(0);
}

if (process.argv.includes('--record')) {
  fs.writeFileSync(file, JSON.stringify({ runtime, fingerprint: hash }, null, 2) + '\n');
  console.log(`Enregistré : runtime ${runtime}, empreinte ${hash}`);
  process.exit(0);
}

const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
if (!saved) {
  console.error('native-runtime.json absent : lancer avec --record.');
  process.exit(1);
}
if (saved.runtime !== runtime) {
  console.error(`NATIVE_RUNTIME est passé de ${saved.runtime} à ${runtime} sans être enregistré : lancer avec --record.`);
  process.exit(1);
}
if (saved.fingerprint !== hash) {
  console.error(
    `Le NATIF a changé (empreinte ${saved.fingerprint} → ${hash}) mais NATIVE_RUNTIME est resté ${runtime}.\n` +
      'Une OTA atteindrait des APK qui n’ont pas ce natif, et l’app planterait.\n' +
      'Incrémenter NATIVE_RUNTIME dans app.config.ts, lancer avec --record, puis rebuilder l’APK.',
  );
  process.exit(1);
}
console.log(`OK : runtime ${runtime}, natif inchangé.`);
