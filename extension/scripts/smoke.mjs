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
} finally {
  await ctx.close();
}
if (!process.exitCode) console.log('OK');
