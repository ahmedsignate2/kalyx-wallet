#!/usr/bin/env node
/**
 * Test de fumée : l'extension construite se charge dans un vrai Chromium, son
 * service worker démarre, le cœur de Kalyx y dérive les MÊMES adresses que le
 * mobile.
 *
 *   npm run build && npm run test:smoke
 *
 * Playwright et Chromium sont ceux de la machine (PLAYWRIGHT_PATH,
 * CHROMIUM_PATH) : ce ne sont pas des dépendances de l'extension.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '../.output/chrome-mv3');
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);

const fail = (m) => {
  console.error('✗', m);
  process.exitCode = 1;
};

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kalyx-ext-')), {
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
  const id = new URL(sw.url()).host;
  console.log('✓ service worker démarré', id);

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  const title = await page.locator('h1').textContent();
  title === 'Kalyx Wallet' ? console.log('✓ popup affiché') : fail(`popup : titre « ${title} »`);
  const icon = await page.locator('img').evaluate((img) => img.complete && img.naturalWidth);
  icon === 128 ? console.log('✓ logo chargé') : fail(`logo : largeur ${icon}`);

  const r = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'kalyx:core-self-test' }).catch((e) => ({ error: String(e) })));
  r?.ok ? console.log('✓ cœur Kalyx dans le service worker : mêmes adresses que le mobile', r.evm, r.solana) : fail(`cœur : ${JSON.stringify(r)}`);

  // ── Coffre (lot 1) ──
  const send = (m) => page.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
  const PW = 'Plage-Orange-47!';
  let st = await send({ type: 'vault:status' });
  st.ok && !st.hasVault ? console.log('✓ aucun coffre au départ') : fail(`statut initial ${JSON.stringify(st)}`);
  (await send({ type: 'vault:create', password: '12345678' })).error === 'WEAK_PASSWORD' ? console.log('✓ mot de passe faible refusé') : fail('mot de passe faible accepté');
  let t0 = Date.now();
  const created = await send({ type: 'vault:create', password: PW });
  const createMs = Date.now() - t0;
  created.ok ? console.log(`✓ coffre créé (scrypt 2^17 dans le service worker : ${createMs} ms)`) : fail(`création ${JSON.stringify(created)}`);
  st = await send({ type: 'vault:status' });
  st.unlocked ? console.log('✓ déverrouillé après création') : fail('pas déverrouillé');
  const alarm = await page.evaluate(() => chrome.alarms.get('kalyx-autolock'));
  alarm ? console.log('✓ minuteur d’auto-verrouillage armé (15 min)') : fail('aucune alarme');

  // Ce qui est sur le DISQUE : le coffre chiffré, rien d'autre — ni clé de session, ni mot de passe.
  const local = await page.evaluate(() => chrome.storage.local.get(null));
  const sess = await page.evaluate(() => chrome.storage.session.get(null));
  const key = sess['kalyx.vaultKey'];
  const dump = JSON.stringify(local);
  Object.keys(local).join() === 'kalyx.vault' && key && !dump.includes(key) && !dump.includes(PW)
    ? console.log('✓ disque : coffre chiffré seulement (ni clé de session, ni mot de passe)')
    : fail(`disque : ${Object.keys(local)}`);

  (await send({ type: 'vault:lock' })).ok && !(await page.evaluate(() => chrome.storage.session.get(null)))['kalyx.vaultKey']
    ? console.log('✓ verrouillé : clé de session effacée')
    : fail('verrouillage');
  (await send({ type: 'vault:unlock', password: 'faux-mot-de-passe' })).error === 'WRONG_PASSWORD' ? console.log('✓ mauvais mot de passe refusé') : fail('mauvais mot de passe accepté');
  t0 = Date.now();
  (await send({ type: 'vault:unlock', password: PW })).ok ? console.log(`✓ déverrouillé avec le bon mot de passe (${Date.now() - t0} ms)`) : fail('déverrouillage');

  // Le popup affiche l'état réel.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent !== '…');
  const shown = await page.locator('#status').textContent();
  shown === 'Déverrouillé' ? console.log('✓ popup : « Déverrouillé »') : fail(`popup : « ${shown} »`);
} finally {
  await ctx.close();
}
if (!process.exitCode) console.log('OK');
