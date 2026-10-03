#!/usr/bin/env node
/**
 * Publication d'un build EAS sur le dépôt public de releases.
 *
 * Appelé par .eas/workflows/release-production.yml, une fois le build terminé :
 *   1. lit le build sur EAS (URL de l'APK, version, numéro de build) ;
 *   2. télécharge l'APK et calcule son empreinte SHA-256 ;
 *   3. crée la release sur ahmedsignate2/kalyx-wallet-release et y joint
 *      `kalyx-wallet.apk` + `kalyx-wallet.apk.sha256`.
 *
 * kalyxwallet.com/download sert l'asset `kalyx-wallet.apk` de la DERNIÈRE
 * release non pré-publiée : celle-ci devient donc la version téléchargée.
 *
 * Variables :
 *   BUILD_ID            identifiant du build EAS (sortie du job de build)
 *   GH_RELEASE_TOKEN    jeton GitHub (Contents: Read and write sur le dépôt de
 *                       releases) — variable d'environnement EAS « production »,
 *                       visibilité Secret
 *   RELEASE_REPO        facultatif, défaut ahmedsignate2/kalyx-wallet-release
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BUILD_ID = process.env.BUILD_ID;
const TOKEN = process.env.GH_RELEASE_TOKEN;
const REPO = process.env.RELEASE_REPO || 'ahmedsignate2/kalyx-wallet-release';

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!BUILD_ID) fail('BUILD_ID manquant : le job de build n’a pas transmis son identifiant.');
if (!TOKEN) {
  fail(
    'GH_RELEASE_TOKEN manquant. Sur expo.dev → projet kalyx-wallet → Environment variables → environnement « production », ' +
      'ajouter GH_RELEASE_TOKEN (visibilité Secret) : un jeton GitHub fine-grained avec Contents: Read and write sur ' + REPO + '.',
  );
}

// 1. Le build EAS
let build;
try {
  const out = execFileSync('npx', ['--yes', 'eas-cli@latest', 'build:view', BUILD_ID, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  build = JSON.parse(out.slice(out.indexOf('{')));
} catch (e) {
  fail(`Lecture du build ${BUILD_ID} impossible sur EAS : ${e.message}`);
}
const apkUrl = build?.artifacts?.applicationArchiveUrl || build?.artifacts?.buildUrl;
if (build?.status && build.status !== 'FINISHED') fail(`Le build ${BUILD_ID} n’est pas terminé (statut : ${build.status}).`);
if (!apkUrl) fail(`Le build ${BUILD_ID} n’a pas d’APK à télécharger.`);
if (!/\.apk(\?|$)/i.test(apkUrl)) fail(`Le build ${BUILD_ID} n’est pas un APK (${apkUrl}). Profil attendu : production-apk.`);
const version = build.appVersion || '0.0.0';
const buildNumber = build.appBuildVersion || BUILD_ID.slice(0, 8);
const commit = (build.gitCommitHash || '').slice(0, 7);

// 2. L'APK et son empreinte
const res = await fetch(apkUrl);
if (!res.ok) fail(`Téléchargement de l’APK refusé (HTTP ${res.status}).`);
const apk = Buffer.from(await res.arrayBuffer());
if (apk.length < 1_000_000) fail(`APK suspect : ${apk.length} octets seulement.`);
const sha = createHash('sha256').update(apk).digest('hex');
const shaLine = `${sha}  kalyx-wallet.apk\n`;
writeFileSync('kalyx-wallet.apk.sha256', shaLine);
console.log(`APK ${(apk.length / 1e6).toFixed(1)} Mo — SHA-256 ${sha}`);

// 3. La release
const gh = async (url, init = {}) => {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }
  return { ok: r.ok, status: r.status, json, text };
};

const tag = `v${version}-${buildNumber}`;
const created = await gh(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tag_name: tag,
    name: `Kalyx Wallet v${version} — bêta (build ${buildNumber})`,
    body: [
      `**Kalyx Wallet v${version}** — bêta ouverte, build ${buildNumber}${commit ? ` (commit \`${commit}\`)` : ''}.`,
      '',
      `**SHA-256** \`kalyx-wallet.apk\` : \`${sha}\``,
      '',
      'Vérification : `sha256sum -c kalyx-wallet.apk.sha256`',
    ].join('\n'),
    prerelease: false,
    make_latest: 'true',
  }),
});
if (!created.ok) {
  if (created.status === 401 || created.status === 403) fail(`GitHub refuse le jeton (HTTP ${created.status}) : vérifier que GH_RELEASE_TOKEN a Contents: Read and write sur ${REPO}.`);
  if (created.status === 404) fail(`Dépôt ${REPO} introuvable pour ce jeton (HTTP 404).`);
  if (created.status === 422) fail(`La release ${tag} existe déjà (HTTP 422) : ce build a déjà été publié.`);
  fail(`Création de la release refusée (HTTP ${created.status}) : ${created.text.slice(0, 300)}`);
}
const uploadBase = created.json.upload_url.replace(/\{.*$/, '');

for (const [name, data, type] of [
  ['kalyx-wallet.apk', apk, 'application/vnd.android.package-archive'],
  ['kalyx-wallet.apk.sha256', Buffer.from(shaLine), 'text/plain'],
]) {
  const up = await gh(`${uploadBase}?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': type }, body: data });
  if (!up.ok) fail(`Envoi de ${name} refusé (HTTP ${up.status}) : ${up.text.slice(0, 300)}. La release ${tag} existe sans ce fichier — la supprimer avant de relancer.`);
  console.log(`✓ ${name} envoyé`);
}
console.log(`\n✓ Release publiée : ${created.json.html_url}\n`);
