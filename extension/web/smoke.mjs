#!/usr/bin/env node
/**
 * Test de fumée de la WEBAPP : le build de test (`vite build --mode test`) dans
 * un vrai Chromium. Sans relais WalletConnect ici : le crochet de test relie un
 * « téléphone » (adresses publiques du vecteur de test BIP-39 « abandon … about »).
 *
 *   npx vite build --config web/vite.config.ts --mode test && node web/smoke.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../.output/web-test');
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const CSP = (await readFile(join(ROOT, '_headers'), 'utf8')).match(/Content-Security-Policy: (.+)/)[1];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    // La politique du site publié (_headers) : une violation ferait échouer le test.
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...(extname(file) === '.html' ? { 'content-security-policy': CSP } : {}) });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const ok = (cond, label) => (cond ? console.log('✓', label) : (console.error('✗', label), failed++));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => /Content Security Policy|Trusted Type/i.test(m.text()) && errors.push(`CSP : ${m.text().slice(0, 160)}`));
try {
  await page.goto(URL_);
  await page.locator('.web-title').waitFor({ timeout: 20_000 });
  ok(true, 'écran de liaison affiché');
  ok((await page.locator('.ob-values li').count()) === 3, 'les trois promesses (aucune clé, validation au téléphone, tout voir)');
  // Sans relais ici, le lien n'arrive pas : les options (ouvrir, copier) restent cachées tant qu'il n'y a pas de QR.
  ok(await page.locator('.web-options').isHidden(), 'options du lien cachées tant que le QR n\u2019est pas prêt');

  // Options du lien (une fois le QR prêt) : téléphone → « Ouvrir dans l'app » + QR replié ; partout → copier.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL_ });
  const opts = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.id = 'opts-test';
    box.append(...window.__kalyxWebTest.linkOptions('wc:test@2?relay-protocol=irn&symKey=00', true));
    document.body.append(box);
    const pc = document.createElement('div');
    pc.append(...window.__kalyxWebTest.linkOptions('wc:test@2?relay-protocol=irn&symKey=00', false));
    return { phoneOpen: !!box.querySelector('[data-testid=open-app]'), pcOpen: !!pc.querySelector('[data-testid=open-app]'), pcCopy: !!pc.querySelector('[data-testid=copy-link]') };
  });
  ok(opts.phoneOpen && !opts.pcOpen, 'téléphone : « Ouvrir dans l’app Kalyx » ; ordinateur : non');
  ok(opts.pcCopy, 'ordinateur : « Copier le lien de connexion »');
  await page.locator('#opts-test [data-testid=copy-link]').click();
  ok((await page.evaluate(() => navigator.clipboard.readText())) === 'wc:test@2?relay-protocol=irn&symKey=00', 'lien copié dans le presse-papiers');
  await page.evaluate(() => document.getElementById('opts-test')?.remove());

  // Aucune clé possible sur le web.
  const send = (m) => page.evaluate((msg) => window.browser.runtime.sendMessage(msg), m);
  ok((await send({ type: 'wallet:import-phrase', phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' })).error === 'PHONE_ONLY', 'import de phrase refusé (PHONE_ONLY)');
  ok((await send({ type: 'wallet:create' })).ok === false, 'création de portefeuille refusée');
  ok((await page.evaluate(() => Object.keys(localStorage).some((k) => /seed|mnemonic|phrase/i.test(k)))) === false, 'rien qui ressemble à une phrase dans le stockage');

  // Téléphone « relié » (crochet de test) : l'accueil de l'extension.
  await page.evaluate(async () => {
    const t = window.__kalyxWebTest;
    await t.host.testLink({ topic: 'test-topic', evmChains: [1, 8453], label: 'Téléphone', wallets: [{ key: 'w1', label: 'Principal', accounts: [{ index: 0, label: 'Compte 1', evm: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', solana: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk' }] }] });
    await t.load();
  });
  await page.locator('[data-testid=account]').waitFor({ timeout: 15_000 });
  ok(await page.locator('[data-testid=phone-badge]').isVisible(), 'accueil : compte du téléphone (badge)');
  ok((await page.locator('.bar .icon[title], .bar .icon[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.getAttribute('title')))).every((l) => !/verrouiller|lock/i.test(l ?? '')), 'pas de verrou (aucun mot de passe)');
  ok((await page.locator('.acts .act').count()) >= 4, 'actions : acheter, envoyer, recevoir, swap…');

  // Réglages : rien de ce qui suppose un mot de passe ou des clés locales.
  await page.locator('.bar .icon').filter({ has: page.locator('svg') }).nth(0).click();
  await page.locator('.settings').waitFor();
  for (const id of ['change-password', 'passkey-open', 'export-backup', 'ask-password', 'show-phrase', 'duress-open', 'phone-only']) {
    ok((await page.locator(`[data-testid=${id}]`).count()) === 0, `réglages : pas de « ${id} »`);
  }
  ok((await page.locator('[data-testid=web-sign-out]').count()) === 1, 'réglages : « Se déconnecter »');
  ok((await page.locator('[data-testid=allowances]').count()) === 1, 'réglages : autorisations de tokens');

  // Se déconnecter : tout est effacé, retour à la liaison.
  await page.locator('[data-testid=web-sign-out]').click();
  await page.locator('[data-testid=web-sign-out-confirm]').click();
  await page.waitForLoadState('load');
  await page.locator('.web-title').waitFor({ timeout: 20_000 });
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kx:kalyx.wallets') || k === 'kalyx.web.vaultKey'));
  ok(left.length === 0 || !left.includes('kx:kalyx.wallets'), 'déconnexion : portefeuilles effacés');

  // Inactivité : revenu après 31 min → déconnecté, le message le dit.
  await page.evaluate(async () => {
    const t = window.__kalyxWebTest;
    await t.host.testLink({ topic: 'test-topic-2', evmChains: [1], label: 'Téléphone', wallets: [{ key: 'w1', label: 'Principal', accounts: [{ index: 0, label: 'Compte 1', evm: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' }] }] });
    localStorage.setItem('kalyx.web.lastActive', String(Date.now() - 31 * 60_000));
  });
  await page.reload();
  await page.locator('.web-title').waitFor({ timeout: 20_000 });
  ok(await page.locator('.banner.warn').first().isVisible(), 'inactivité : déconnecté, message affiché');
  ok((await send({ type: 'home:get' })).wallets?.length === 0, 'inactivité : plus aucun portefeuille');

  // Clé du coffre local effacée (stockage vidé à moitié) : on repart proprement, sans erreur.
  await page.evaluate(() => localStorage.removeItem('kalyx.web.vaultKey'));
  await page.reload();
  await page.locator('.web-title').waitFor({ timeout: 20_000 });
  ok((await send({ type: 'vault:status' })).unlocked === true, 'clé locale perdue : nouveau coffre ouvert, sans erreur');

  // Téléphone (largeur 390) : la colonne prend toute la largeur, sans débordement.
  await page.setViewportSize({ width: 390, height: 844 });
  ok((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'téléphone : pas de défilement horizontal');
  ok(errors.length === 0, `aucune erreur de page${errors.length ? ` : ${errors.join(' | ').slice(0, 300)}` : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? 'ÉCHEC' : 'OK');
process.exit(failed ? 1 : 0);
