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
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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

/** Violations de la CSP ou de Trusted Types relevées dans les pages de l'extension et le service worker. */
const cspViolations = [];
const watchCsp = (where, msg) => {
  const text = msg.text();
  if (/Content Security Policy|TrustedType|Trusted Type/i.test(text)) cspViolations.push(`${where}: ${text.slice(0, 200)}`);
};
const launch = async (lang = 'fr') => {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kalyx-ext-')), {
    headless: true,
    locale: lang === 'fr' ? 'fr-FR' : lang,
    executablePath: process.env.CHROMIUM_PATH,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', `--lang=${lang}`],
  });
  ctx.on('page', (p) => p.on('console', (m) => p.url().startsWith('chrome-extension://') && watchCsp(p.url().split('/').pop(), m)));
  ctx.on('serviceworker', (w) => w.on?.('console', (m) => watchCsp('service worker', m)));
  for (const w of ctx.serviceWorkers()) w.on?.('console', (m) => watchCsp('service worker', m));
  return ctx;
};
process.on('beforeExit', () => {
  if (cspViolations.length) {
    console.error('✗ violations CSP / Trusted Types :\n  ' + [...new Set(cspViolations)].join('\n  '));
    process.exitCode = 1;
  }
});
// ONLY=onboarding|dapps|attacks|langs|help|hardening : une seule partie (plus rapide à relancer).
if (['onboarding', 'dapps', 'attacks', 'langs', 'help', 'hardening'].includes(process.env.ONLY)) {
  await { onboarding, dapps, attacks, langs, help, hardening }[process.env.ONLY]();
  if (cspViolations.length) fail('violations CSP / Trusted Types :\n  ' + [...new Set(cspViolations)].join('\n  '));
  console.log(process.exitCode ? 'ÉCHEC' : 'OK');
  process.exit();
}
const ctx = await launch();
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
  Object.keys(local).join() === 'kalyx.vault' && key && !dump.includes(key.ct) && !dump.includes(PW)
    ? console.log('✓ disque : coffre chiffré seulement (ni clé de session, ni mot de passe)')
    : fail(`disque : ${Object.keys(local)}`);
  // Zone session : un bloc scellé par une clé WebCrypto non exportable, jamais la clé du coffre en clair.
  /^[0-9a-f]{24}$/.test(key?.n) && /^[0-9a-f]{96}$/.test(key?.ct) && !/"[0-9a-f]{64}"/.test(JSON.stringify(sess))
    ? console.log('✓ session : clé du coffre scellée (aucune clé en clair, même en mémoire de session)')
    : fail(`session : ${JSON.stringify(sess).slice(0, 120)}`);

  (await send({ type: 'vault:lock' })).ok && !(await page.evaluate(() => chrome.storage.session.get(null)))['kalyx.vaultKey']
    ? console.log('✓ verrouillé : clé de session effacée')
    : fail('verrouillage');
  (await send({ type: 'vault:unlock', password: 'faux-mot-de-passe' })).error === 'WRONG_PASSWORD' ? console.log('✓ mauvais mot de passe refusé') : fail('mauvais mot de passe accepté');
  t0 = Date.now();
  (await send({ type: 'vault:unlock', password: PW })).ok ? console.log(`✓ déverrouillé avec le bon mot de passe (${Date.now() - t0} ms)`) : fail('déverrouillage');

  // Le popup affiche l'état réel : déverrouillé (aucun portefeuille encore), puis verrouillé.
  await page.reload();
  await page.locator('.btn').waitFor();
  (await page.locator('.btn').textContent()) === 'Ajouter un portefeuille' ? console.log('✓ popup déverrouillé sans portefeuille : « Ajouter un portefeuille »') : fail('popup déverrouillé');
  await send({ type: 'vault:lock' });
  await page.reload();
  await page.locator('input[type=password]').waitFor();
  console.log('✓ popup verrouillé : champ mot de passe');
} finally {
  await ctx.close();
}
await onboarding();
await dapps();
await attacks();
await langs();
await help();
await hardening();

/**
 * Durcissement : « sites autorisés seulement » (Kalyx invisible ailleurs,
 * activé site par site depuis le popup), mode parano enregistré.
 */
async function hardening() {
  const PAGE = `<!doctype html><meta charset="utf-8"><title>site</title><body><script>
    window.kx = { providers: [] };
    window.addEventListener('eip6963:announceProvider', (e) => window.kx.providers.push(e.detail.info.rdns));
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  </script>`;
  const server = createServer((req, res) => (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(PAGE)));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const SITE = `http://localhost:${server.address().port}`;
  const PW = 'Plage-Orange-47!';
  const ctx = await launch();
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    const id = new URL(sw.url()).host;
    const ext = await ctx.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    const bg = (m) => ext.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await bg({ type: 'vault:create', password: PW });
    await bg({ type: 'wallet:import-phrase', phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' });
    const kalyxOn = async (page) => (await page.waitForTimeout(400), page.evaluate(() => window.kx.providers.includes('com.kalyxwallet')));

    const site = await ctx.newPage();
    await site.goto(SITE);
    (await kalyxOn(site)) ? console.log('✓ par défaut : Kalyx présent sur les sites') : fail('Kalyx absent par défaut');

    // Mode restreint : la page ne voit plus Kalyx du tout.
    (await bg({ type: 'sites:set-mode', mode: 'allowed' })).ok || fail('mode restreint refusé');
    await site.reload();
    !(await kalyxOn(site)) ? console.log('✓ sites autorisés seulement : Kalyx invisible sur un site non autorisé') : fail('Kalyx visible sur un site non autorisé');

    // Popup ouvert sur ce site : bandeau « Activer sur ce site », la page se recharge avec Kalyx.
    await site.bringToFront();
    await ext.reload();
    // Sans écran, « l'onglet actif » du popup n'est pas celui du site : on le désigne.
    await ext.evaluate((url) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async (q) => (q.active ? (await query({})).filter((t) => t.url?.startsWith(url)) : query(q));
    }, SITE);
    await ext.locator('[data-testid=account]').waitFor();
    await ext.getByRole('button', { name: 'Réglages' }).click();
    await ext.locator('header.bar .link').click();
    await ext.locator('[data-testid=site-on]').waitFor({ timeout: 8_000 });
    if (process.env.SHOTS) await ext.screenshot({ path: join(process.env.SHOTS, 'site-off.png') });
    const reloaded = site.waitForEvent('load');
    await ext.locator('[data-testid=site-on]').click();
    await reloaded;
    (await kalyxOn(site)) ? console.log('✓ « Activer sur ce site » : la page se recharge avec Kalyx') : fail('site autorisé sans Kalyx');
    const acc = await bg({ type: 'sites:access', origin: SITE });
    acc.allowed.join() === SITE && acc.active ? console.log('✓ site ajouté aux sites autorisés') : fail(`accès ${JSON.stringify(acc)}`);
    (await bg({ type: 'sites:allow', origin: 'chrome://settings' })).error === 'BAD_ORIGIN' ? console.log('✓ page interne refusée comme site autorisé') : fail('chrome:// accepté');

    // Réglages : interrupteurs parano et sites, liste des sites autorisés.
    await ext.getByRole('button', { name: 'Réglages' }).click();
    await ext.locator('[data-testid=allowed-open]').waitFor();
    (await ext.locator('[data-testid=site-mode]').getAttribute('aria-checked')) === 'true' ? console.log('✓ réglage « sites autorisés seulement » affiché actif') : fail('interrupteur sites');
    await ext.locator('[data-testid=paranoid]').click();
    await ext.waitForFunction(() => document.querySelector('[data-testid=paranoid]')?.getAttribute('aria-checked') === 'true');
    const st = await bg({ type: 'vault:status' });
    st.paranoid && st.unlocked ? console.log('✓ mode parano activé (session gardée ouverte)') : fail(`parano ${JSON.stringify(st)}`);
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await ext.emulateMedia({ colorScheme: scheme }), await ext.waitForTimeout(350), await ext.screenshot({ path: join(process.env.SHOTS, `settings-security-${scheme}.png`), fullPage: true });

    // Retour au mode partout.
    (await bg({ type: 'sites:set-mode', mode: 'all' })).ok;
    await site.goto(SITE.replace('localhost', '127.0.0.1'));
    (await kalyxOn(site)) ? console.log('✓ retour à « partout » : Kalyx de nouveau présent') : fail('mode partout non rétabli');
  } finally {
    await ctx.close();
    server.close();
  }
}

/**
 * Aide et conformité (vague 5) : FAQ, À propos et documents légaux dans la
 * langue affichée, langue choisie à la main (la page suit), puis « Mot de
 * passe oublié ? » : tout est effacé et l'extension repart de zéro.
 */
async function help() {
  const PW = 'Plage-Orange-47!';
  const SHOTS = process.env.SHOTS;
  const both = async (p, name) => {
    if (!SHOTS) return;
    for (const scheme of ['light', 'dark']) await p.emulateMedia({ colorScheme: scheme }), await p.waitForTimeout(350), await p.screenshot({ path: join(SHOTS, `${name}-${scheme}.png`) });
    await p.emulateMedia({ colorScheme: 'light' });
  };
  const ctx = await launch();
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    const id = new URL(sw.url()).host;
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const bg = (m) => popup.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await bg({ type: 'vault:create', password: PW });
    await bg({ type: 'wallet:import-phrase', phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' });
    await popup.reload();
    await popup.locator('[data-testid=account]').waitFor();
    const tabs = () => popup.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      window.__tabs = [];
      chrome.tabs.create = (o) => (window.__tabs.push(o.url), /^(https:|mailto:)/.test(o.url) ? Promise.resolve({}) : create(o));
    });

    // FAQ : 8 questions, les chemins des menus remplis avec les vrais libellés.
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.locator('[data-testid=faq-open]').click();
    const nq = await popup.locator('[data-testid=faq] details').count();
    nq === 8 ? console.log('✓ FAQ : 8 questions') : fail(`FAQ : ${nq} questions`);
    await popup.locator('[data-testid=faq] summary').nth(4).click();
    const a5 = (await popup.locator('[data-testid=faq] details[open] p').textContent()) ?? '';
    a5.includes('Réglages › Sécurité › Sites connectés') && !/[{}]/.test(a5) ? console.log('✓ FAQ : chemin de réglage réel (Réglages › Sécurité › Sites connectés)') : fail(`FAQ : « ${a5} »`);
    await both(popup, 'faq');
    await popup.locator('header.bar .link').click();

    // À propos : version, éditeur, documents légaux du site dans la langue affichée.
    await tabs();
    await popup.locator('[data-testid=about-open]').click();
    await popup.locator('[data-testid=privacy]').click();
    await popup.locator('[data-testid=terms]').click();
    const opened = await popup.evaluate(() => window.__tabs);
    opened.join() === 'https://kalyxwallet.com/fr/privacy,https://kalyxwallet.com/fr/terms' ? console.log('✓ À propos : confidentialité et conditions du site, en français') : fail(`liens légaux ${opened}`);
    (await popup.getByText('SIREN 130 046 865').count()) === 1 ? console.log('✓ À propos : éditeur affiché') : fail('éditeur absent');
    await both(popup, 'about');
    await popup.locator('header.bar .link').click();

    // Langue choisie à la main : enregistrée, la page se recharge dans cette langue ; « navigateur » revient au français.
    await Promise.all([popup.waitForEvent('load'), popup.locator('[data-testid=language]').selectOption('ja')]);
    await popup.locator('[data-testid=account]').waitFor();
    const lang = (await popup.evaluate(() => chrome.storage.local.get('kalyx.lang')))['kalyx.lang'];
    const jaHome = await popup.evaluate(() => document.documentElement.lang);
    lang === 'ja' && jaHome === 'ja' && (await popup.getByRole('button', { name: '設定' }).count()) === 1 ? console.log('✓ langue choisie (日本語) : enregistrée, la page suit') : fail(`langue ${lang} / ${jaHome}`);
    // Une autre vue ouverte suit aussi (panneau latéral).
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.locator('[data-testid=account]').waitFor();
    (await panel.evaluate(() => document.documentElement.lang)) === 'ja' ? console.log('✓ panneau latéral dans la langue choisie') : fail('panneau pas dans la langue choisie');
    await popup.getByRole('button', { name: '設定' }).click();
    await Promise.all([panel.waitForEvent('load'), popup.waitForEvent('load'), popup.locator('[data-testid=language]').selectOption('')]);
    await popup.locator('[data-testid=account]').waitFor();
    (await popup.evaluate(() => document.documentElement.lang)) === 'fr' && (await panel.evaluate(() => document.documentElement.lang)) === 'fr'
      ? console.log('✓ retour à la langue du navigateur : toutes les vues suivent')
      : fail('retour à la langue du navigateur');
    await panel.close();

    // Mot de passe oublié : rien sans la case ET le mot exact ; ensuite tout est effacé.
    await bg({ type: 'vault:lock' });
    await popup.reload();
    await popup.locator('input[type=password]').waitFor();
    const resetTab = ctx.waitForEvent('page', { predicate: (p) => p.url().endsWith('/onboarding.html#reset') });
    await popup.locator('[data-testid=forgot-password]').click();
    const rp = await resetTab;
    await rp.locator('[data-testid=reset-go]').waitFor();
    const go = rp.locator('[data-testid=reset-go]');
    await rp.locator('[data-testid=reset-word]').fill('effacer');
    const offNoAck = await go.isDisabled();
    await rp.locator('[data-testid=reset-ack]').check();
    await rp.locator('[data-testid=reset-word]').fill('efface');
    const offBadWord = await go.isDisabled();
    await rp.locator('[data-testid=reset-word]').fill('effacer');
    offNoAck && offBadWord && !(await go.isDisabled()) ? console.log('✓ réinitialisation : case ET mot exact exigés') : fail('réinitialisation : bouton actif trop tôt');
    await both(rp, 'reset');
    await go.click();
    // L'onglet revient à l'accueil (créer ou restaurer).
    await rp.getByRole('button', { name: 'Créer un portefeuille' }).waitFor({ timeout: 15_000 });
    const ob = rp;
    const after = await ob.evaluate(async () => ({ st: await chrome.runtime.sendMessage({ type: 'vault:status' }), local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
    !after.st.hasVault && Object.keys(after.local).length === 0 && Object.keys(after.session).length === 0
      ? console.log('✓ mot de passe oublié : tout effacé (disque et session), retour à l’accueil')
      : fail(`après réinitialisation ${JSON.stringify({ st: after.st, local: Object.keys(after.local), session: Object.keys(after.session) })}`);
    // Le popup ouvert ensuite repart de zéro, et l'extension reste utilisable : nouveau coffre.
    // (le popup s'est fermé en ouvrant l'onglet de réinitialisation)
    const p2 = await ctx.newPage();
    await p2.goto(`chrome-extension://${id}/popup.html`);
    await p2.getByRole('button', { name: 'Commencer' }).waitFor({ timeout: 10_000 }).then(() => console.log('✓ popup après effacement : « Commencer »'), () => fail('popup après effacement'));
    const bg2 = (m) => p2.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    (await bg2({ type: 'vault:create', password: PW })).ok && (await bg2({ type: 'vault:status' })).unlocked ? console.log('✓ nouveau coffre créé juste après, sans redémarrer') : fail('nouveau coffre après effacement');
  } finally {
    await ctx.close();
  }
}

/**
 * Langues (lot 7) : l'accueil s'affiche dans la langue du navigateur, l'arabe
 * de droite à gauche, et une langue non prise en charge retombe sur l'anglais.
 */
async function langs() {
  const cases = [
    ['ar', 'مرحبًا بك في Kalyx', 'rtl'],
    ['ja', 'Kalyx へようこそ', 'ltr'],
    ['de', 'Willkommen bei Kalyx', 'ltr'],
    ['sv', 'Welcome to Kalyx', 'ltr'],
  ];
  for (const [lang, title, dir] of cases) {
    const ctx = await launch(lang);
    try {
      const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${new URL(sw.url()).host}/onboarding.html`);
      await page.locator('h1').first().waitFor({ timeout: 10_000 });
      const got = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, dir: document.documentElement.dir, lang: document.documentElement.lang }));
      got.h1 === title && got.dir === dir ? console.log(`✓ langue ${lang} : « ${got.h1} » (${got.dir})`) : fail(`langue ${lang} : ${JSON.stringify(got)}`);
    } finally {
      await ctx.close();
    }
  }
}

/**
 * Onboarding piloté comme un utilisateur, dans un profil neuf : créer
 * (mot de passe, phrase, vérification), puis importer la phrase de test
 * standard et retrouver les adresses du mobile. Captures claires et sombres
 * dans SHOTS si défini.
 */
async function onboarding() {
  const SHOTS = process.env.SHOTS;
  const ctx = await launch();
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    const id = new URL(sw.url()).host;
    // L'installation ouvre l'onboarding d'elle-même.
    const auto = ctx.pages().find((p) => p.url().endsWith('/onboarding.html')) ?? (await ctx.waitForEvent('page', { timeout: 10_000 }).catch(() => null));
    auto?.url().endsWith('/onboarding.html') ? console.log('✓ onboarding ouvert à l’installation') : fail('onboarding non ouvert à l’installation');
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 900, height: 900 });
    const shot = async (name) => {
      if (!SHOTS) return;
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        await new Promise((r) => setTimeout(r, 450));
        await page.screenshot({ path: join(SHOTS, `${name}-${scheme}.png`) });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 360, height: 560 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByText('Commencer').waitFor();
    console.log('✓ popup sans coffre : « Commencer »');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `popup-start-${scheme}.png`) });

    await page.goto(`chrome-extension://${id}/onboarding.html`);
    await page.getByText('Bienvenue dans Kalyx').waitFor();
    await shot('1-welcome');
    await page.getByText('Créer un portefeuille').click();
    const [pw, pw2] = [page.locator('input[type=password]').nth(0), page.locator('input[type=password]').nth(1)];
    await pw.fill('azertyuiop');
    await pw2.fill('azertyuiop');
    await page.getByText('Continuer').click();
    await page.waitForFunction(() => document.querySelector('.error')?.textContent);
    (await page.locator('.error').textContent())?.includes('Trop simple') ? console.log('✓ interface : mot de passe faible refusé') : fail('mot de passe faible accepté par l’interface');
    await pw.fill('Plage-Orange-47!');
    await pw2.fill('Plage-Orange-47!');
    await shot('2-password');
    await page.getByText('Continuer').click();
    await page.locator('.grid').waitFor({ timeout: 20_000 });
    const words = await page.locator('.word').evaluateAll((els) => els.map((e) => e.lastChild.textContent));
    words.length === 12 ? console.log('✓ phrase de 12 mots, floutée avant affichage') : fail(`phrase : ${words.length} mots`);
    (await page.getByText('J’ai noté ma phrase').isDisabled()) ? console.log('✓ « J’ai noté » bloqué tant que la phrase est cachée') : fail('« J’ai noté » actif trop tôt');
    await shot('3-phrase-hidden');
    await page.getByText('Afficher la phrase').click();
    await shot('4-phrase');
    await page.getByText('J’ai noté ma phrase').click();
    for (let i = 0; i < 3; i++) {
      const q = await page.locator('h1 + p').textContent();
      const n = Number(q.match(/\d+/)[0]);
      if (i === 0) {
        const wrong = (await page.locator('.choices button').allTextContents()).find((w) => w !== words[n - 1]);
        await page.locator('.choices button', { hasText: new RegExp(`^${wrong}$`) }).click();
        (await page.locator('.error').textContent()) ? console.log('✓ mauvais mot refusé') : fail('mauvais mot accepté');
        await shot('5-verify');
      }
      await page.locator('.choices button', { hasText: new RegExp(`^${words[n - 1]}$`) }).click();
    }
    await page.getByText('Ton portefeuille est prêt').waitFor();
    (await page.locator('.banner').count()) === 0 ? console.log('✓ phrase vérifiée : pas de rappel') : fail('rappel affiché après vérification');
    await shot('6-done');
    const sess = await page.evaluate(() => chrome.storage.local.get(null));
    const disk = JSON.stringify(sess);
    !disk.includes(words.join(' ')) && !disk.includes(`${words[0]} ${words[1]}`)
      ? console.log('✓ disque : la phrase n’apparaît pas en clair')
      : fail('phrase en clair sur le disque');

    // Import de la phrase de test standard (vecteur public) : mêmes adresses que le mobile.
    await page.goto(`chrome-extension://${id}/onboarding.html`);
    await page.getByText('J’ai déjà un portefeuille').click();
    await page.getByText('Phrase de récupération').click();
    await page.locator('textarea').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandn');
    (await page.locator('.small.error').textContent())?.includes('abandn') ? console.log('✓ mot inconnu signalé pendant la saisie') : fail('mot inconnu non signalé');
    await page.locator('textarea').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await shot('7-import');
    await page.getByRole('button', { name: 'Importer' }).click();
    await page.getByText('Ton portefeuille est prêt').waitFor({ timeout: 120_000 });
    const text = await page.locator('#app').textContent();
    text.includes('0x9858Ef…aEda94') && text.includes('HAgk14Jp…3DKpqk')
      ? console.log('✓ import : EVM 0x9858…  SOL HAgk…, comme le mobile')
      : fail(`import : adresses ${text}`);
    await page.goto(`chrome-extension://${id}/onboarding.html`);
    await page.getByText('J’ai déjà un portefeuille').click();
    await page.getByText('Phrase de récupération').click();
    await page.locator('textarea').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await page.getByRole('button', { name: 'Importer' }).click();
    await page.waitForFunction(() => document.querySelector('.error[role=alert]')?.textContent);
    (await page.locator('.error[role=alert]').textContent()) === 'Ce portefeuille est déjà dans Kalyx.' ? console.log('✓ doublon refusé') : fail('doublon accepté');

    // Mode compagnon : l'option existe ; sans ID WalletConnect au build, elle le dit (jamais de QR factice).
    await page.goto(`chrome-extension://${id}/onboarding.html`);
    await page.getByText('J’ai déjà un portefeuille').click();
    await page.getByText('Relier mon téléphone').click();
    await page.getByText('Relier ton téléphone').waitFor();
    await page.waitForFunction(() => /pas disponible/.test(document.body.textContent) || document.querySelector('.qr svg') || document.querySelector('.error[role=alert]')?.textContent);
    const comp = await page.evaluate(() => (document.querySelector('.qr svg') ? 'qr' : /pas disponible/.test(document.body.textContent) ? 'indisponible' : 'erreur'));
    process.env.WALLETCONNECT_ID ? (comp !== 'indisponible' ? console.log(`✓ compagnon : ${comp}`) : fail('compagnon indisponible malgré l’ID')) : comp === 'indisponible' ? console.log('✓ compagnon : indisponible sans ID WalletConnect') : fail(`compagnon : ${comp} sans ID`);

    // ── Portefeuille (lot 3) ──
    await popup.reload();
    await popup.locator('[data-testid=account]').waitFor();
    await popup.locator('[data-testid=account]').click();
    await popup.waitForTimeout(350);
    if (SHOTS) await popup.screenshot({ path: join(SHOTS, 'popup-accounts-light.png') });
    const options = await popup.locator('.modal .acct-row').count();
    options >= 2 ? console.log(`✓ popup : sélecteur de comptes (${options})`) : fail(`popup : ${options} compte(s)`);
    await popup.keyboard.press('Escape');
    await popup.waitForFunction(() => !document.querySelector('.veil'));
    // Acheter : les couples crypto/réseau du compte actif (EVM + Solana), la page Stripe ouverte ensuite dans un onglet.
    await popup.getByRole('button', { name: 'Acheter' }).click();
    await popup.locator('[data-testid=buy-usdc-base]').waitFor();
    const buyOpts = await popup.locator('.modal [data-testid^=buy-]').count();
    buyOpts === 6 ? console.log('✓ acheter : 6 choix (EVM + Solana) pour ce compte') : fail(`acheter : ${buyOpts} choix`);
    await popup.keyboard.press('Escape');
    await popup.waitForFunction(() => !document.querySelector('.veil'));
    // Première lecture réseau terminée (ou réseaux muets) : plus de « Actualisation… ».
    await popup.waitForFunction(() => !document.querySelector('.status')?.textContent?.includes('…'), null, { timeout: 120_000 });
    const total = (await popup.locator('[data-testid=total]').textContent()).trim();
    const down = await popup.locator('.banner.warn').allTextContents();
    console.log(`  total affiché : « ${total} »${down.length ? ` · ${down.join(' | ')}` : ''}`);
    if (/^0[,.]00/.test(total.replace(/[^\d,.]/g, '')) && down.length) fail('total à 0 alors que des réseaux sont muets');
    else console.log('✓ jamais de faux zéro : réseau muet nommé ou total réel');

    // Ouverture avec le cliché en cache : mesurée, objectif < 200 ms.
    const times = [];
    for (let i = 0; i < 5; i++) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: 360, height: 600 });
      await p.goto(`chrome-extension://${id}/popup.html`);
      await p.waitForFunction(() => document.body.dataset.firstPaint);
      times.push(Number(await p.evaluate(() => document.body.dataset.firstPaint)));
      await p.close();
    }
    const best = Math.min(...times);
    const median = times.sort((a, b) => a - b)[2];
    median < 200 ? console.log(`✓ popup affiché en ${median} ms (médiane de 5, min ${best} ms)`) : fail(`popup trop lent : ${times.join(', ')} ms`);

    await popup.reload();
    await popup.locator('[data-testid=account]').waitFor();
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `popup-wallet-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.getByRole('tab', { name: 'Activité' }).click();
    await popup.waitForFunction(() => !document.querySelector('[data-testid=activity]')?.textContent?.includes('Actualisation'), null, { timeout: 120_000 });
    const act = await popup.locator('[data-testid=activity]').textContent();
    console.log(`✓ onglet Activité : ${(await popup.locator('[data-testid=activity] .row').count())} ligne(s)${act.includes('Sans réponse') ? ' · réseaux muets nommés' : ''}`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `popup-activity-${scheme}.png`) });

    // ── Vague 2 : NFT (lecture seule), réseaux affichés, token ajouté par contrat, token masqué ──
    await popup.getByRole('tab', { name: 'NFT' }).click();
    await popup.waitForFunction(() => { const el = document.querySelector('[data-testid=nfts]'); return el && !el.querySelector('.list[aria-hidden]') && !el.textContent.includes('Actualisation'); }, null, { timeout: 120_000 });
    const nftText = await popup.locator('[data-testid=nfts]').textContent();
    console.log(`✓ onglet NFT : ${await popup.locator('[data-testid=nfts] .nft-card').count()} NFT${nftText.includes('Sans réponse') ? ' · réseaux muets nommés' : nftText.includes('Aucun NFT') ? ' · « Aucun NFT » dit' : ''}`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `popup-nfts-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    // ── Vague 4 : Échanger (sans réseau ici : aucun actif détenu, c'est dit) ──
    {
      const acts = await popup.evaluate(() => { const r = document.querySelector('.acts')?.getBoundingClientRect(); return r ? { w: r.width, right: r.right, vw: innerWidth } : null; });
      acts && acts.right <= acts.vw ? console.log(`✓ accueil : 5 gestes dans le popup (${Math.round(acts.w)} px)`) : fail(`gestes hors du popup : ${JSON.stringify(acts)}`);
      await popup.getByRole('button', { name: 'Swap', exact: true }).click();
      await popup.waitForFunction(() => document.querySelector('[data-testid=sw-empty]') || document.querySelectorAll('[data-testid=sw-from] option').length > 0, null, { timeout: 30_000 });
      const swErr = (await popup.locator('[data-testid=sw-empty]').textContent().catch(() => '')) ?? '';
      const nSrc = await popup.locator('[data-testid=sw-from] option').count();
      nSrc > 0 || swErr.includes('Aucun actif') ? console.log(`✓ Échanger : ${nSrc ? `${nSrc} actif(s) de départ` : '« Aucun actif à échanger » dit, rien d’inventé'}`) : fail(`Échanger : « ${swErr} »`);
      if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `swap-${scheme}.png`) });
      await popup.emulateMedia({ colorScheme: 'light' });
      // Devis inventé par la page : refusé par le service worker (aucun devis gardé sous cet identifiant).
      (await popup.evaluate((m) => chrome.runtime.sendMessage(m), { type: 'swap:confirm', id: 'deadbeef' })).error === 'SWAP_QUOTE_GONE' ? console.log('✓ Échanger : un devis inconnu ne se signe pas') : fail('devis inconnu accepté');
      await popup.locator('header .link').click();
    }
    await popup.getByRole('tab', { name: 'Tokens' }).click();
    await popup.locator('[data-testid=manage-networks]').click();
    await popup.locator('[data-testid=net-polygon]').waitFor();
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `networks-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.locator('[data-testid=net-polygon]').click();
    await popup.waitForFunction(() => document.querySelector('[data-testid=net-polygon]')?.getAttribute('aria-checked') === 'false');
    (await popup.evaluate((m) => chrome.runtime.sendMessage(m), { type: 'assets:networks' })).networks.find((n) => n.id === 'polygon')?.hidden ? console.log('✓ réseau masqué (Polygon)') : fail('masquer un réseau');
    await popup.locator('[data-testid=net-polygon]').click();
    await popup.waitForFunction(() => document.querySelector('[data-testid=net-polygon]')?.getAttribute('aria-checked') === 'true');
    console.log('✓ réseau réaffiché');
    await popup.locator('header .link').click();
    await popup.locator('[data-testid=add-token]').waitFor();
    // Un vrai contrat (UNI, Ethereum), lu sur le réseau : rien de fictif.
    const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
    await popup.locator('[data-testid=add-token]').click();
    await popup.locator('[data-testid=token-chain]').selectOption('ethereum');
    await popup.locator('[data-testid=token-contract]').fill('0x1234');
    await popup.locator('[data-testid=token-check]').click();
    await popup.waitForFunction(() => document.querySelector('.modal .error')?.textContent?.includes('invalide'), null, { timeout: 10_000 }).then(() => console.log('✓ contrat invalide refusé'), () => fail('contrat invalide accepté'));
    await popup.locator('[data-testid=token-contract]').fill(UNI);
    await popup.locator('[data-testid=token-check]').click();
    const found = await popup.locator('[data-testid=token-found]').waitFor({ timeout: 60_000 }).then(() => true, () => false);
    if (!found) console.log(`⚠ ajout de token non vérifié (réseau : « ${await popup.locator('.modal .error').textContent()} »)`);
    else {
      (await popup.locator('[data-testid=token-found]').textContent()).includes('UNI') ? console.log('✓ token lu sur son contrat (UNI)') : fail('symbole du contrat');
      if (SHOTS) await popup.screenshot({ path: join(SHOTS, 'add-token.png') });
      await popup.locator('[data-testid=token-check]').click();
      await popup.waitForFunction(() => document.querySelector('[data-testid=custom-tokens]')?.textContent?.includes('UNI'), null, { timeout: 120_000 }).then(() => console.log('✓ token ajouté, dans « Ajoutés par toi »'), () => fail('token ajouté absent'));
      if (SHOTS) await popup.screenshot({ path: join(SHOTS, 'custom-token.png') });
      await popup.locator('[data-testid=custom-tokens] .row').first().click();
      await popup.locator('[data-testid=hide-token]').click();
      await popup.waitForFunction(() => document.querySelector('[data-testid=muted-tokens]')?.textContent?.includes('UNI') && !document.querySelector('[data-testid=custom-tokens]'), null, { timeout: 30_000 }).then(() => console.log('✓ token masqué (à part, hors du total)'), () => fail('masquer un token'));
      await popup.locator('[data-testid=muted-tokens] summary').click();
      await popup.locator('[data-testid=muted-tokens] .row').first().click();
      await popup.locator('[data-testid=show-token]').click();
      await popup.locator('[data-testid=custom-tokens]').waitFor({ timeout: 30_000 });
      await popup.locator('[data-testid=custom-tokens] .row').first().click();
      await popup.locator('[data-testid=remove-token]').click();
      await popup.waitForFunction(() => !document.querySelector('[data-testid=custom-tokens]'), null, { timeout: 30_000 }).then(() => console.log('✓ token réaffiché puis retiré'), () => fail('retirer le token'));
    }
    await popup.keyboard.press('Escape');
    await popup.waitForTimeout(300);

    // Changer de compte : l'écran suit.
    const first = await popup.locator('[data-testid=account]').textContent();
    await popup.locator('[data-testid=account]').click();
    await popup.locator('.modal .acct-row:not(.on)').first().click();
    await popup.waitForFunction((v) => { const n = document.querySelector('[data-testid=account]')?.textContent; return n && n !== v; }, first);
    console.log('✓ changement de compte');

    // Bêta (lot 8) : badge, version et « Signaler un problème » (e-mail sans donnée du portefeuille).
    (await popup.locator('header .beta').textContent()) === 'Bêta' ? console.log('✓ badge Bêta') : fail('badge Bêta absent');
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.waitForTimeout(350);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `settings-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    const ver = await popup.getByText('Version 0.9.0 beta').count();
    ver === 1 ? console.log('✓ version 0.9.0 beta affichée') : fail('version absente des réglages');
    // Le mailto part vers l'application d'e-mail (pas d'onglet sans écran) : on lit l'adresse demandée.
    await popup.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = (o) => ((window.__mail = o.url), o.url.startsWith('mailto:') ? Promise.resolve({}) : create(o));
    });
    await popup.locator('[data-testid=report]').click();
    const mailUrl = (await popup.waitForFunction(() => window.__mail, null, { timeout: 5_000 }).then((h) => h.jsonValue()).catch(() => '')) ?? '';
    const decoded = decodeURIComponent(mailUrl);
    mailUrl.startsWith('mailto:support@kalyxwallet.com?subject=') && decoded.includes('0.9.0 beta') && !/0x[0-9a-fA-F]{40}/.test(decoded)
      ? console.log('✓ signaler un problème : e-mail au support, version, aucune adresse')
      : fail(`signaler : « ${mailUrl.slice(0, 120)} »`);

    // ── Gérer le portefeuille (vague 1) : renommer, ajouter un compte, clé privée, sauvegarde, mot de passe ──
    {
      const VPW = 'Plage-Orange-47!';
      await popup.locator('[data-testid=manage-wallet]').click();
      await popup.locator('[data-testid=rename-wallet]').click();
      await popup.locator('[data-testid=rename-input]').fill('  Principal\u202e  smoke ');
      await popup.locator('[data-testid=rename-save]').click();
      await popup.waitForFunction(() => document.querySelector('[data-testid=rename-wallet] strong')?.textContent === 'Principal smoke', null, { timeout: 5_000 }).then(() => console.log('✓ renommer : nom nettoyé (contrôles et espaces retirés)'), () => fail('renommer'));
      const before = await popup.locator('[data-testid^=acct-]').count();
      if (await popup.locator('[data-testid=add-account]').count()) {
        await popup.locator('[data-testid=add-account]').click();
        await popup.waitForFunction((n) => document.querySelectorAll('[data-testid^=acct-]').length === n + 1, before, { timeout: 10_000 }).then(() => console.log('✓ ajouter un compte'), () => fail('ajouter un compte'));
      }
      if (SHOTS) await popup.waitForTimeout(500), await popup.screenshot({ path: join(SHOTS, 'manage-wallet.png') });
      await popup.locator('[data-testid=acct-0]').click();
      if (await popup.locator('[data-testid=show-key]').count()) {
        await popup.locator('[data-testid=show-key]').click();
        await popup.locator('.modal input[type=password]').fill('faux-mot-de-passe');
        await popup.locator('[data-testid=key-reveal]').click();
        await popup.waitForFunction(() => document.querySelector('.modal .error')?.textContent, null, { timeout: 10_000 });
        (await popup.locator('[data-testid=key-value]').count()) === 0 ? console.log('✓ clé privée : mauvais mot de passe refusé') : fail('clé sans mot de passe');
        await popup.waitForTimeout(1_200);
        await popup.locator('.modal input[type=password]').fill(VPW);
        await popup.locator('[data-testid=key-reveal]').click();
        const key = await popup.locator('[data-testid=key-value]').textContent({ timeout: 15_000 }).catch(() => '');
        /^(0x[0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{80,90})$/.test(key) ?(SHOTS && (await popup.screenshot({ path: join(SHOTS, 'private-key.png') })), console.log('✓ clé privée affichée après le mot de passe')) : fail(`clé privée : « ${key.slice(0, 8)}… »`);
      }
      await popup.keyboard.press('Escape');
      await popup.waitForTimeout(300);
      await popup.locator('.screen .bar .link').click();
      await popup.locator('[data-testid=export-backup]').click();
      const sheetPw = popup.locator('.modal input[type=password]');
      await sheetPw.nth(0).fill(VPW);
      await sheetPw.nth(1).fill(VPW);
      await sheetPw.nth(2).fill(VPW);
      await popup.locator('[data-testid=backup-export]').click();
      await popup.waitForFunction(() => document.querySelector('.modal .error')?.textContent, null, { timeout: 15_000 }).then(() => console.log('✓ sauvegarde : mot de passe identique à celui de l’extension refusé'), () => fail('sauvegarde même mot de passe'));
      const dl = popup.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      await sheetPw.nth(0).fill(VPW);
      await sheetPw.nth(1).fill('Sauvegarde-Solide-93!');
      await sheetPw.nth(2).fill('Sauvegarde-Solide-93!');
      await popup.locator('[data-testid=backup-export]').click();
      const file = await dl;
      file && /^kalyx-backup-\d{4}-\d{2}-\d{2}\.json$/.test(file.suggestedFilename()) ? console.log(`✓ sauvegarde chiffrée téléchargée (${file.suggestedFilename()})`) : fail('sauvegarde non téléchargée');
      if (file) {
        const text = await readFile(await file.path(), 'utf8');
        JSON.parse(text).version === 3 && !/abandon|0x[0-9a-f]{64}/.test(text) ? console.log('✓ fichier chiffré (format v3), aucun secret en clair') : fail('contenu de la sauvegarde');
      }
      await popup.keyboard.press('Escape');
      await popup.waitForTimeout(300);
      await popup.locator('[data-testid=change-password]').click();
      await sheetPw.nth(0).fill(VPW);
      await sheetPw.nth(1).fill('Nouveau-Mot-De-Passe-58!');
      await sheetPw.nth(2).fill('Nouveau-Mot-De-Passe-58!');
      await popup.locator('[data-testid=pw-change]').click();
      await popup.waitForFunction(() => !document.querySelector('[data-testid=pw-change]'), null, { timeout: 60_000 }).then(() => console.log('✓ mot de passe changé'), () => fail('changer le mot de passe'));
      (await popup.evaluate((m) => chrome.runtime.sendMessage(m), { type: 'vault:change-password', oldPassword: 'Nouveau-Mot-De-Passe-58!', newPassword: VPW })).ok ? console.log('✓ ancien mot de passe remis') : fail('remettre le mot de passe');
      await popup.keyboard.press('Escape');
      await popup.waitForTimeout(300);
    }
    await popup.locator('header .link').click();
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.locator('select[aria-label="Devise"]').selectOption('usd');
    await popup.waitForFunction(() => document.querySelector('[data-testid=total]'), null, { timeout: 30_000 });
    const totalUsd = await popup.locator('[data-testid=total]').textContent();
    totalUsd === '—' || totalUsd.includes('$') ? console.log(`✓ devise USD (« ${totalUsd} »)`) : fail(`devise : « ${totalUsd} »`);

    // Panneau latéral : la même interface, plus large.
    const panel = await ctx.newPage();
    await panel.setViewportSize({ width: 420, height: 820 });
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.locator('[data-testid=account]').waitFor();
    console.log('✓ panneau latéral affiché');
    if (SHOTS) for (const scheme of ['light', 'dark']) await panel.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await panel.screenshot({ path: join(SHOTS, `sidepanel-${scheme}.png`) });

    // ── Envoyer et recevoir (lot 4) ──
    const bg = (m) => popup.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await popup.reload();
    await popup.locator('[data-testid=account]').waitFor();
    // Portefeuille à phrase NON vérifiée : l'écran intermédiaire passe au premier « Recevoir ».
    const fresh = await bg({ type: 'wallet:create' });
    await bg({ type: 'home:select', walletId: fresh.id, index: 0 });
    await popup.reload();
    await popup.getByRole('button', { name: /Recevoir/ }).click();
    await popup.getByText('Ta phrase n’est pas vérifiée').waitFor();
    console.log('✓ premier « Recevoir » sans phrase vérifiée : écran intermédiaire');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `receive-warn-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.getByRole('button', { name: 'Continuer quand même' }).click();
    await popup.locator('.qr svg').waitFor();
    const rawAddr = await popup.locator('[data-testid=receive-address]').textContent();
    /\s/.test(rawAddr) ? fail(`adresse avec des espaces : « ${rawAddr} »`) : console.log('✓ Recevoir : adresse sans espace (copiable telle quelle)');
    const shownAddr = rawAddr.replace(/\s/g, '');
    const freshMeta = (await bg({ type: 'wallet:list' })).wallets.find((w) => w.id === fresh.id);
    shownAddr === freshMeta.accounts[0].evm ? console.log('✓ Recevoir : QR + adresse EVM du compte affiché') : fail(`adresse reçue ${shownAddr}`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `receive-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.getByRole('tab', { name: 'Solana' }).click();
    ((await popup.locator('[data-testid=receive-address]').textContent()).replace(/\s/g, '') === freshMeta.accounts[0].solana) ? console.log('✓ Recevoir : onglet Solana') : fail('adresse Solana');
    await popup.getByRole('button', { name: /Retour/ }).click();
    await popup.getByRole('button', { name: /Recevoir/ }).click();
    await popup.locator('.qr svg').waitFor();
    console.log('✓ écran intermédiaire une seule fois');
    await popup.getByRole('button', { name: /Retour/ }).click();

    // Vérifier plus tard : mot de passe redemandé, puis le défi des 3 mots.
    const verifyPage = await ctx.newPage();
    await verifyPage.goto(`chrome-extension://${id}/onboarding.html#verify=${fresh.id}`);
    await verifyPage.locator('input[type=password]').fill('faux-mot-de-passe');
    await verifyPage.getByRole('button', { name: 'Continuer' }).click();
    await verifyPage.waitForFunction(() => document.querySelector('.error')?.textContent);
    (await verifyPage.locator('.error').textContent()) === 'Mot de passe incorrect.' ? console.log('✓ vérifier plus tard : mauvais mot de passe refusé') : fail('mot de passe');
    await verifyPage.locator('input[type=password]').fill('Plage-Orange-47!');
    await verifyPage.getByRole('button', { name: 'Continuer' }).click();
    await verifyPage.getByText('Afficher la phrase').click();
    const later = await verifyPage.locator('.word').evaluateAll((els) => els.map((e) => e.lastChild.textContent));
    later.join(' ') === fresh.phrase ? console.log('✓ la phrase affichée est celle du portefeuille') : fail('phrase différente');
    await verifyPage.getByText('J’ai noté ma phrase').click();
    for (let i = 0; i < 3; i++) {
      const n = Number((await verifyPage.locator('h1 + p').textContent()).match(/\d+/)[0]);
      await verifyPage.locator('.choices button', { hasText: new RegExp(`^${later[n - 1]}$`) }).click();
    }
    await verifyPage.getByText('Ton portefeuille est prêt').waitFor();
    (await bg({ type: 'wallet:list' })).wallets.find((w) => w.id === fresh.id).backedUp ? console.log('✓ phrase vérifiée plus tard : rappel levé') : fail('backedUp');
    await verifyPage.close();

    // ── Vague 3 : carnet d'adresses (scellé), sosie signalé, changement d'adresse confirmé, choix dans Envoyer ──
    {
      // Adresses publiques réelles (phrase de test « test test … junk » de Hardhat), rien d'inventé.
      const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
      const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      const TWIN = '0xf39f000000000000000000000000000000002266';
      await popup.reload();
      await popup.getByRole('button', { name: 'Réglages' }).click();
      await popup.locator('[data-testid=settings-contacts]').click();
      await popup.locator('[data-testid=ct-new]').click();
      await popup.locator('[data-testid=ct-name]').fill('Léa');
      await popup.locator('[data-testid=ct-address]').fill(A.toLowerCase());
      await popup.locator('[data-testid=ct-save]').click();
      await popup.waitForFunction(() => document.querySelector('[data-testid=contacts]')?.textContent?.includes('Léa'), null, { timeout: 10_000 }).then(() => console.log('✓ contact ajouté'), () => fail('ajout de contact'));
      const disk = JSON.stringify(await popup.evaluate(() => chrome.storage.local.get(null)));
      !disk.includes('Léa') && !disk.toLowerCase().includes(A.toLowerCase()) ? console.log('✓ carnet scellé sur le disque (ni nom ni adresse en clair)') : fail('carnet en clair sur le disque');
      await popup.locator('[data-testid=ct-new]').click();
      await popup.locator('[data-testid=ct-name]').fill('Faux');
      await popup.locator('[data-testid=ct-address]').fill(TWIN);
      await popup.locator('[data-testid=ct-save]').click();
      await popup.locator('[data-testid=ct-ack]').waitFor({ timeout: 10_000 }).then(() => console.log('✓ sosie d’un contact signalé avant enregistrement'), () => fail('sosie non signalé'));
      if (SHOTS) await popup.screenshot({ path: join(SHOTS, 'contact-lookalike.png') });
      await popup.keyboard.press('Escape');
      await popup.waitForTimeout(300);
      await popup.locator('[data-testid=contacts] [data-testid=contact]').first().click();
      await popup.locator('[data-testid=ct-address]').fill(B);
      await popup.locator('[data-testid=ct-save]').click();
      await popup.waitForFunction(() => document.querySelector('.modal .error')?.textContent, null, { timeout: 5_000 });
      await popup.locator('[data-testid=ct-ack]').check();
      await popup.locator('[data-testid=ct-save]').click();
      await popup.locator('[data-testid=contact-changed]').waitFor({ timeout: 10_000 }).then(() => console.log('✓ changement d’adresse : confirmé, puis signalé sur le contact'), () => fail('changement d’adresse'));
      if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `contacts-${scheme}.png`) });
      await popup.emulateMedia({ colorScheme: 'light' });
      await popup.reload();
      await popup.getByRole('button', { name: /Envoyer/ }).click();
      await popup.waitForFunction(() => document.querySelectorAll('form select option').length > 0);
      await popup.locator('[data-testid=send-contacts]').click();
      await popup.locator('[data-testid=pick-contact]').first().click();
      (await popup.locator('form input[type=text]').first().inputValue()) === B ? console.log('✓ Envoyer : contact choisi, adresse remplie (même parcours ensuite)') : fail('choix du contact dans Envoyer');
    }

    // Envoyer : réseau injoignable ici → erreur nommée, rien n'est signé.
    await popup.reload();
    await popup.getByRole('button', { name: /Envoyer/ }).click();
    await popup.locator('form select').waitFor();
    await popup.waitForFunction(() => document.querySelectorAll('form select option').length > 0);
    await popup.locator('form input[type=text]').first().fill('0x123');
    await popup.locator('form input[inputmode=decimal]').first().fill('0.01');
    await popup.getByRole('button', { name: 'Vérifier' }).click();
    await popup.waitForFunction(() => document.querySelector('.error')?.textContent);
    console.log(`✓ Envoyer, adresse invalide : « ${await popup.locator('.error').textContent()} »`);
    await popup.locator('form input[type=text]').first().fill('0x1111111111111111111111111111111111111111');
    await popup.getByRole('button', { name: 'Vérifier' }).click();
    await popup.waitForFunction(() => !document.querySelector('.error')?.textContent?.startsWith('Adresse'), null, { timeout: 60_000 });
    await popup.waitForFunction(() => document.querySelector('.error')?.textContent, null, { timeout: 60_000 });
    console.log(`✓ Envoyer sans réseau : « ${await popup.locator('.error').textContent()} »`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `send-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });

    // Liste blanche : activée, un inconnu est bloqué AVANT tout réseau.
    await popup.getByRole('button', { name: /Retour/ }).click();
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.getByRole('button', { name: 'Liste blanche' }).click();
    await popup.getByRole('button', { name: 'Activer' }).click();
    await popup.waitForFunction(() => document.querySelector('[data-testid=wl-state]')?.textContent === 'Activée');
    console.log('✓ liste blanche activée');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 350)), await popup.screenshot({ path: join(SHOTS, `whitelist-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    const blocked = await bg({ type: 'send:prepare', assetKey: 'ethereum:native', to: '0x1111111111111111111111111111111111111111', amount: '0.01' });
    blocked.error === 'NOT_WHITELISTED' ? console.log('✓ liste blanche : destinataire inconnu bloqué') : fail(`liste blanche : ${JSON.stringify(blocked)}`);
    const wlDisk = JSON.stringify(await popup.evaluate(() => chrome.storage.local.get('kalyx.whitelist')));
    wlDisk.includes('"ct"') && !wlDisk.includes('"enabled"') ? console.log('✓ liste blanche scellée sur le disque') : fail('liste blanche en clair');

    // Verrouillé : plus rien d'affiché.
    await popup.reload();
    await popup.locator('[data-testid=account]').waitFor();
    await popup.getByRole('button', { name: 'Verrouiller' }).click();
    await popup.locator('input[type=password]').waitFor();
    (await popup.locator('[data-testid=total]').count()) === 0 ? console.log('✓ verrouillé : soldes masqués') : fail('soldes visibles verrouillé');
  } finally {
    await ctx.close();
  }
}

/**
 * Pont vers les dApps (lot 5), dans un profil neuf, avec une VRAIE page web
 * servie en local qui se comporte comme une dApp : découverte EIP-6963 et
 * Wallet Standard, connexion par la fenêtre Kalyx, réseau par site, iframe,
 * isolation entre sites, déconnexion, verrouillage, « Kalyx par défaut ».
 */
async function dapps() {
  const PAGE = `<!doctype html><meta charset="utf-8"><title>dApp de test</title><body><iframe id="f" src="about:blank"></iframe><script>
    window.kx = { providers: [], sol: [], events: [] };
    window.addEventListener('eip6963:announceProvider', (e) => window.kx.providers.push(e.detail));
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const api = { register: (w) => window.kx.sol.push(w) };
    window.addEventListener('wallet-standard:register-wallet', (e) => e.detail(api));
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
    window.kx.evm = () => window.kx.providers.find((p) => p.info.rdns === 'com.kalyxwallet').provider;
    window.kx.call = (method, params) => window.kx.evm().request({ method, params }).then((r) => ({ r }), (e) => ({ code: e.code, message: e.message }));
  </script>`;
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url === '/frame' ? '<!doctype html><body>cadre</body>' : PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const SITE = `http://localhost:${port}`;
  const OTHER = `http://127.0.0.1:${port}`;
  const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const PW = 'Plage-Orange-47!';

  const ctx = await launch();
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    const id = new URL(sw.url()).host;
    const ext = await ctx.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    const bg = (m) => ext.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await bg({ type: 'vault:create', password: PW });
    await bg({ type: 'wallet:import-phrase', phrase: ABOUT });
    await bg({ type: 'vault:lock' });

    const page = await ctx.newPage();
    await page.goto(SITE);
    await page.waitForFunction(() => window.kx.providers.length > 0, null, { timeout: 10_000 });
    const info = await page.evaluate(() => window.kx.providers.map((p) => p.info));
    const kalyx = info.find((i) => i.rdns === 'com.kalyxwallet');
    kalyx && kalyx.name === 'Kalyx' && kalyx.icon.startsWith('data:image/svg+xml') ? console.log('✓ dApp : Kalyx annoncé par EIP-6963 (com.kalyxwallet)') : fail(`EIP-6963 : ${JSON.stringify(info)}`);
    (await page.evaluate(() => typeof window.ethereum)) === 'undefined' ? console.log('✓ window.ethereum laissé libre par défaut') : fail('window.ethereum pris sans l’option');
    const sol = await page.evaluate(() => window.kx.sol.map((w) => ({ name: w.name, chains: w.chains, features: Object.keys(w.features) })));
    sol.some((w) => w.name === 'Kalyx' && w.features.includes('standard:connect') && w.features.includes('solana:signTransaction'))
      ? console.log('✓ dApp : Kalyx enregistré comme portefeuille Solana (Wallet Standard)')
      : fail(`Wallet Standard : ${JSON.stringify(sol)}`);

    // Iframe (même cliché d'une pub tierce) : rien d'injecté.
    await page.evaluate((u) => (document.getElementById('f').src = u), `${OTHER}/frame`);
    await page.waitForTimeout(800);
    const frame = page.frames().find((f) => f.url().endsWith('/frame'));
    (await frame.evaluate(() => window.__kalyxInjected__)) === undefined ? console.log('✓ iframe : aucun accès à Kalyx') : fail('iframe injectée');

    let r = await page.evaluate(() => window.kx.call('eth_chainId'));
    r.r === '0x1' ? console.log('✓ eth_chainId sans connexion : 0x1') : fail(`eth_chainId ${JSON.stringify(r)}`);
    r = await page.evaluate(() => window.kx.call('eth_accounts'));
    Array.isArray(r.r) && r.r.length === 0 ? console.log('✓ eth_accounts sans connexion : []') : fail(`eth_accounts ${JSON.stringify(r)}`);

    // Connexion : la fenêtre s'ouvre ; verrouillé → mot de passe d'abord.
    await page.evaluate(() => {
      window.kx.evm().on('accountsChanged', (a) => window.kx.events.push(['accountsChanged', a]));
      window.kx.evm().on('chainChanged', (c) => window.kx.events.push(['chainChanged', c]));
      window.kx.pendingConnect = window.kx.call('eth_requestAccounts');
    });
    const win = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 10_000 });
    await win.locator('input[type=password]').waitFor();
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await win.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 400)), await win.screenshot({ path: join(process.env.SHOTS, `locked-${scheme}.png`) });
    await win.emulateMedia({ colorScheme: 'light' });
    await win.locator('input[type=password]').fill(PW);
    await win.getByRole('button', { name: 'Déverrouiller' }).click();
    await win.locator('[data-testid=site-host]').waitFor();
    const host = await win.locator('[data-testid=site-host]').textContent();
    host === `localhost:${port}` ? console.log(`✓ fenêtre de connexion : site « ${host} » (origine lue par Chrome)`) : fail(`hôte ${host}`);
    (await win.getByText('Site local (développement).').count()) ? console.log('✓ site http local signalé') : fail('avertissement http');
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await win.emulateMedia({ colorScheme: scheme }), await win.screenshot({ path: join(process.env.SHOTS, `approval-connect-${scheme}.png`) });
    // La fenêtre se ferme d'elle-même après l'accord.
    await win.getByRole('button', { name: 'Connecter' }).click({ noWaitAfter: true }).catch(() => {});
    r = await page.evaluate(() => window.kx.pendingConnect);
    JSON.stringify(r.r) === JSON.stringify(['0x9858EfFD232B4033E47d90003D41EC34EcaEda94']) ? console.log('✓ connecté : adresse du compte choisi rendue au site') : fail(`connexion ${JSON.stringify(r)}`);
    r = await page.evaluate(() => window.kx.events);
    r.some((e) => e[0] === 'accountsChanged' && e[1][0]) ? console.log('✓ événement accountsChanged reçu') : fail(`événements ${JSON.stringify(r)}`);
    (await page.evaluate(() => window.kx.evm().selectedAddress)) ? console.log('✓ selectedAddress tenu à jour') : fail('selectedAddress');

    r = await page.evaluate(() => window.kx.call('wallet_switchEthereumChain', [{ chainId: '0x2105' }]));
    const chain = await page.evaluate(() => window.kx.call('eth_chainId'));
    r.r === null && chain.r === '0x2105' && (await page.evaluate(() => window.kx.events.some((e) => e[0] === 'chainChanged' && e[1] === '0x2105')))
      ? console.log('✓ réseau du site passé sur Base (chainChanged)')
      : fail(`switch ${JSON.stringify([r, chain])}`);
    r = await page.evaluate(() => window.kx.call('wallet_addEthereumChain', [{ chainId: '0x999999', rpcUrls: ['https://rpc.pirate.example'] }]));
    r.code === 4902 ? console.log('✓ réseau inconnu proposé par la page : refusé (4902)') : fail(`addChain ${JSON.stringify(r)}`);
    // ── Signatures (lot 6) : fenêtre, explication, signature vérifiée ──
    const { verifyMessage } = await import(pathToFileURL(join(HERE, '../../node_modules/ethers/lib.esm/index.js')).href);
    const nextWindow = () => ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 15_000 });
    const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    await page.evaluate((a) => {
      window.kx.p = window.kx.call('personal_sign', ['0x426f6e6a6f7572204b616c7978', a]);
    }, EVM0);
    let sw1 = await nextWindow();
    await sw1.locator('[data-testid=headline]').waitFor();
    console.log(`✓ fenêtre de signature : « ${await sw1.locator('[data-testid=headline]').textContent()} »`);
    (await sw1.locator('[data-testid=message]').textContent()) === 'Bonjour Kalyx' ? console.log('✓ message montré en clair') : fail('message');
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await sw1.emulateMedia({ colorScheme: scheme }), await sw1.screenshot({ path: join(process.env.SHOTS, `approval-sign-${scheme}.png`) });
    await sw1.getByRole('button', { name: 'Signer' }).click({ noWaitAfter: true, timeout: 5000 }).catch(() => {});
    r = await page.evaluate(() => window.kx.p);
    r.r && verifyMessage('Bonjour Kalyx', r.r) === EVM0 ? console.log('✓ personal_sign : signature valide du compte accordé') : fail(`personal_sign ${JSON.stringify(r)}`);

    // SIWE pour un AUTRE domaine que le site : danger, maintenir 2 s.
    const siwe = `evil.example wants you to sign in with your Ethereum account:\n${EVM0}\n\nSign in\n\nURI: https://evil.example\nVersion: 1\nChain ID: 1\nNonce: abcdefgh\nIssued At: 2026-01-01T00:00:00Z`;
    await page.evaluate(([m, a]) => {
      window.kx.p = window.kx.call('personal_sign', ['0x' + Array.from(new TextEncoder().encode(m)).map((b) => b.toString(16).padStart(2, '0')).join(''), a]);
    }, [siwe, EVM0]);
    sw1 = await nextWindow();
    await sw1.locator('[data-testid=risk]').waitFor();
    (await sw1.locator('[data-testid=risk]').textContent()).startsWith('Danger') ? console.log('✓ SIWE d’un autre domaine : « Danger »') : fail('risque SIWE');
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await sw1.emulateMedia({ colorScheme: scheme }), await sw1.screenshot({ path: join(process.env.SHOTS, `approval-danger-${scheme}.png`) });
    const hold = sw1.getByRole('button', { name: 'Maintenir pour signer' });
    await sw1.waitForTimeout(900);
    await hold.click({ timeout: 3000 });
    await sw1.waitForTimeout(400);
    !sw1.isClosed() ? console.log('✓ danger : un simple clic ne signe pas') : fail('clic simple a signé');
    const box = await hold.boundingBox();
    await sw1.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sw1.mouse.down();
    // La fenêtre se ferme d'elle-même une fois signé.
    await new Promise((res) => setTimeout(res, 2300));
    await sw1.mouse.up().catch(() => {});
    r = await page.evaluate(() => window.kx.p);
    r.r && verifyMessage(siwe, r.r) === EVM0 ? console.log('✓ danger : signé après 2 s de maintien') : fail(`maintien ${JSON.stringify(r)}`);

    // Transaction : sans réseau, l'échec s'affiche DANS la fenêtre ; refuser → 4001.
    await page.evaluate((a) => {
      window.kx.p = window.kx.call('eth_sendTransaction', [{ from: a, to: '0x1111111111111111111111111111111111111111', value: '0x1' }]);
    }, EVM0);
    sw1 = await nextWindow();
    await sw1.getByRole('button', { name: 'Confirmer' }).waitFor({ timeout: 30_000 });
    await sw1.waitForTimeout(800);
    await sw1.getByRole('button', { name: 'Confirmer' }).click();
    await sw1.waitForFunction(() => document.querySelector('.error')?.textContent, null, { timeout: 120_000 });
    console.log(`✓ transaction sans réseau : erreur dans la fenêtre (« ${(await sw1.locator('.error').textContent()).slice(0, 70)}… »)`);
    await sw1.getByRole('button', { name: 'Refuser' }).click({ noWaitAfter: true }).catch(() => {});
    r = await page.evaluate(() => window.kx.p);
    r.code === 4001 ? console.log('✓ puis refus : la dApp reçoit 4001') : fail(`tx ${JSON.stringify(r)}`);

    r = await page.evaluate((a) => window.kx.call('eth_sign', [a, '0x' + '11'.repeat(32)]), EVM0);
    r.code === 4200 ? console.log('✓ eth_sign (hachage brut) refusé') : fail(`eth_sign ${JSON.stringify(r)}`);

    // Solana : silencieux sans fenêtre, puis connexion.
    r = await page.evaluate(async () => {
      const w = window.kx.sol.find((x) => x.name === 'Kalyx');
      return (await w.features['standard:connect'].connect({ silent: true })).accounts.length;
    });
    r === 0 ? console.log('✓ Solana : reconnexion silencieuse sans fenêtre') : fail(`sol silent ${r}`);
    await page.evaluate(() => {
      const w = window.kx.sol.find((x) => x.name === 'Kalyx');
      window.kx.solConnect = w.features['standard:connect'].connect().then((x) => x.accounts.map((a) => a.address));
    });
    const win2 = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 10_000 });
    // La fenêtre se ferme d'elle-même après l'accord.
    await win2.getByRole('button', { name: 'Connecter' }).click({ noWaitAfter: true }).catch(() => {});
    r = await page.evaluate(() => window.kx.solConnect);
    r[0] === 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk' ? console.log('✓ Solana connecté : adresse du compte') : fail(`sol ${JSON.stringify(r)}`);
    // Signature d'un message Solana, vérifiée (ed25519).
    await page.evaluate(() => {
      const w = window.kx.sol.find((x) => x.name === 'Kalyx');
      const account = w.accounts[0];
      window.kx.solSig = w.features['solana:signMessage'].signMessage({ account, message: new TextEncoder().encode('Connexion à Jupiter') }).then((x) => Array.from(x[0].signature));
    });
    const sw2 = await nextWindow();
    await sw2.getByRole('button', { name: 'Signer' }).waitFor();
    await sw2.waitForTimeout(800);
    await sw2.getByRole('button', { name: 'Signer' }).click({ noWaitAfter: true }).catch(() => {});
    const solSig = await page.evaluate(() => window.kx.solSig);
    const { ed25519 } = await import(pathToFileURL(join(HERE, '../../node_modules/@noble/curves/esm/ed25519.js')).href);
    const { base58 } = await import(pathToFileURL(join(HERE, '../../node_modules/@scure/base/lib/esm/index.js')).href);
    ed25519.verify(Uint8Array.from(solSig), new TextEncoder().encode('Connexion à Jupiter'), base58.decode('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'))
      ? console.log('✓ Solana signMessage : signature ed25519 valide')
      : fail('signature Solana');

    // Fenêtre fermée = refus.
    const other = await ctx.newPage();
    await other.goto(OTHER);
    await other.waitForFunction(() => window.kx.providers.length > 0);
    r = await other.evaluate(() => window.kx.call('eth_accounts'));
    r.r.length === 0 ? console.log('✓ autre site : ne voit pas le compte connecté ailleurs') : fail('isolation');
    await other.evaluate(() => {
      window.kx.p = window.kx.call('eth_requestAccounts');
    });
    const win3 = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 10_000 });
    await win3.close();
    r = await other.evaluate(() => window.kx.p);
    r.code === 4001 ? console.log('✓ fenêtre fermée : refus (4001)') : fail(`fermeture ${JSON.stringify(r)}`);

    // Sites connectés : liste et déconnexion.
    await ext.reload();
    await ext.getByRole('button', { name: 'Réglages' }).click();
    await ext.getByRole('button', { name: 'Sites connectés' }).click();
    await ext.getByText(`localhost:${port}`).waitFor();
    console.log('✓ « Sites connectés » liste le site');
    if (process.env.SHOTS) for (const scheme of ['light', 'dark']) await ext.emulateMedia({ colorScheme: scheme }), await new Promise((r) => setTimeout(r, 450)), await ext.screenshot({ path: join(process.env.SHOTS, `sites-${scheme}.png`) });
    await ext.getByRole('button', { name: 'Déconnecter' }).click();
    await ext.getByText('Aucun site connecté.').waitFor();
    await page.waitForFunction(() => window.kx.events.some((e) => e[0] === 'accountsChanged' && e[1].length === 0));
    r = await page.evaluate(() => window.kx.call('eth_accounts'));
    r.r.length === 0 ? console.log('✓ déconnecté depuis Kalyx : le site perd l’adresse (événement reçu)') : fail('déconnexion');

    // Verrouillage : un site connecté perd l'adresse.
    await page.evaluate(() => {
      window.kx.events = [];
      window.kx.p = window.kx.call('eth_requestAccounts');
    });
    const win4 = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 10_000 });
    // La fenêtre se ferme d'elle-même après l'accord.
    await win4.getByRole('button', { name: 'Connecter' }).click({ noWaitAfter: true }).catch(() => {});
    await page.evaluate(() => window.kx.p);
    await bg({ type: 'vault:lock' });
    await page.waitForFunction(() => window.kx.events.some((e) => e[0] === 'accountsChanged' && e[1].length === 0), null, { timeout: 10_000 });
    console.log('✓ verrouillage : le site reçoit accountsChanged []');

    // « Kalyx par défaut » : window.ethereum pris aux pages ouvertes ensuite.
    await bg({ type: 'vault:unlock', password: PW });
    (await bg({ type: 'settings:set-default', on: true })).ok || fail('option par défaut');
    await page.reload();
    await page.waitForFunction(() => window.kx.providers.length > 0);
    (await page.evaluate(() => window.ethereum?.isKalyx === true && window.ethereum.isMetaMask === true)) ? console.log('✓ « Kalyx par défaut » : window.ethereum') : fail('window.ethereum');
    (await page.evaluate(() => window.__kalyxDefault__ === undefined)) ? console.log('✓ drapeau effacé après lecture') : fail('drapeau');
  } finally {
    await ctx.close();
    server.close();
  }
}

/**
 * PAGE MALVEILLANTE (lot 7) : tout ce qu'un site hostile peut tenter. Chaque
 * attaque doit échouer CÔTÉ ATTAQUANT.
 */
async function attacks() {
  const PAGE = `<!doctype html><meta charset="utf-8"><title>attaque</title><body><script>
    window.kx = { providers: [] };
    window.addEventListener('eip6963:announceProvider', (e) => window.kx.providers.push(e.detail));
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.kx.evm = () => window.kx.providers.find((p) => p.info.rdns === 'com.kalyxwallet').provider;
    window.kx.call = (method, params) => window.kx.evm().request({ method, params }).then((r) => ({ r }), (e) => ({ code: e.code, message: e.message }));
    window.kx.leaked = [];
    window.addEventListener('message', (e) => { if (e.data && e.data.k === 'kalyx:res' && e.data.id === 999001) window.kx.leaked.push(e.data); });
  </script>`;
  const FRAME = `<!doctype html><body><script>
    // Cadre tiers : se fait passer pour la page principale auprès du relais.
    parent.postMessage({ k: 'kalyx:req', id: 999001, family: 'evm', method: 'eth_requestAccounts', params: [] }, '*');
  </script>`;
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url === '/frame' ? FRAME : PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const SITE = `http://localhost:${port}`;
  const PW = 'Plage-Orange-47!';
  const ctx = await launch();
  const windows = () => ctx.pages().filter((p) => p.url().includes('/approval.html'));
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    const id = new URL(sw.url()).host;
    const ext = await ctx.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    const bg = (m) => ext.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await bg({ type: 'vault:create', password: PW });
    await bg({ type: 'wallet:import-phrase', phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' });

    const page = await ctx.newPage();
    await page.goto(SITE);
    await page.waitForFunction(() => window.kx.providers.length > 0);

    // 1. Un cadre tiers imite la page : ignoré par le relais.
    await page.evaluate((u) => {
      const f = document.createElement('iframe');
      f.src = u;
      document.body.append(f);
    }, `http://127.0.0.1:${port}/frame`);
    await page.waitForTimeout(1500);
    windows().length === 0 && (await page.evaluate(() => window.kx.leaked.length)) === 0 ? console.log('✓ attaque : un cadre tiers qui imite la page est ignoré') : fail('cadre tiers entendu');

    // 2. La page parle directement à l'extension, ou ouvre ses pages : impossible.
    const direct = await page.evaluate(async (extId) => {
      const out = {};
      out.runtime = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function'
        ? await chrome.runtime.sendMessage(extId, { type: 'vault:status' }).then(() => 'répondu', () => 'refusé')
        : 'absent';
      out.fetch = await fetch(`chrome-extension://${extId}/approval.html`).then(() => 'lu', () => 'refusé');
      return out;
    }, id);
    direct.runtime !== 'répondu' && direct.fetch === 'refusé' ? console.log(`✓ attaque : pas d’accès direct à l’extension (runtime ${direct.runtime}, pages ${direct.fetch})`) : fail(`accès direct ${JSON.stringify(direct)}`);

    // 3. Signer sans être connecté : refusé, sans fenêtre.
    let r = await page.evaluate(() => window.kx.call('personal_sign', ['0x6869', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94']));
    r.code === 4100 && windows().length === 0 ? console.log('✓ attaque : signature sans connexion refusée (4100), aucune fenêtre') : fail(`sans connexion ${JSON.stringify(r)}`);

    // 4. Inondation de connexions : UNE fenêtre ; refus ; puis plus de fenêtre pendant le délai.
    await page.evaluate(() => {
      window.kx.flood = Promise.all(Array.from({ length: 40 }, () => window.kx.call('eth_requestAccounts')));
    });
    const w1 = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 10_000 });
    await page.waitForTimeout(1000);
    windows().length === 1 ? console.log('✓ attaque : 40 demandes de connexion → une seule fenêtre') : fail(`${windows().length} fenêtres`);
    await w1.getByRole('button', { name: 'Refuser' }).click({ noWaitAfter: true }).catch(() => {});
    r = await page.evaluate(() => window.kx.flood);
    // Au-delà de 30 demandes en vol, le relais répond lui-même « trop de demandes » (-32005).
    r.every((x) => x.code === 4001 || x.code === -32005) && r.some((x) => x.code === 4001)
      ? console.log(`✓ refus : ${r.filter((x) => x.code === 4001).length} reçoivent 4001, ${r.filter((x) => x.code === -32005).length} freinées par le relais`)
      : fail(`inondation ${JSON.stringify(r.slice(0, 3))}`);
    r = await page.evaluate(() => window.kx.call('eth_requestAccounts'));
    await page.waitForTimeout(800);
    r.code === 4001 && windows().length === 0 ? console.log('✓ attaque : redemander aussitôt après un refus → refusé sans fenêtre') : fail(`après refus ${JSON.stringify(r)}`);

    // 5. Requête géante : refusée par le relais.
    r = await page.evaluate(() => window.kx.call('eth_call', [{ data: '0x' + 'ab'.repeat(400_000) }]));
    r.code === -32602 ? console.log('✓ attaque : requête de 800 Ko refusée') : fail(`géante ${JSON.stringify(r)}`);

    // 6. Rafale : la limite de débit répond, le reste ne passe pas.
    r = await page.evaluate(async () => (await Promise.all(Array.from({ length: 180 }, () => window.kx.call('eth_chainId')))).filter((x) => x.code === -32005).length);
    r > 0 ? console.log(`✓ attaque : rafale de 180 requêtes → ${r} freinées (-32005)`) : fail('pas de limite de débit');

    // 7. Inondation de signatures (site connecté) : 3 fenêtres au plus, le reste -32002.
    await page.waitForTimeout(10_500); // fin du délai de la limite de débit
    await bg({ type: 'vault:lock' });
    // Le délai après refus (10 s) est écoulé : une nouvelle connexion ouvre une fenêtre.
    await page.evaluate(() => {
      window.kx.c = window.kx.call('wallet_requestPermissions', [{ eth_accounts: {} }]);
    });
    const wc = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 15_000 });
    await wc.locator('input[type=password]').fill(PW);
    await wc.getByRole('button', { name: 'Déverrouiller' }).click();
    await wc.getByRole('button', { name: 'Connecter' }).waitFor();
    await wc.waitForTimeout(800);
    await wc.getByRole('button', { name: 'Connecter' }).click({ noWaitAfter: true }).catch(() => {});
    await page.evaluate(() => window.kx.c);
    // 7. Double-clic hérité : un clic aussitôt la fenêtre ouverte ne signe pas.
    const nextWin = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('/approval.html'), timeout: 15_000 });
    await page.evaluate(() => {
      window.kx.one = window.kx.call('personal_sign', ['0x6f6b', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94']);
    });
    const ws = await nextWin;
    await ws.getByRole('button', { name: 'Signer' }).click({ force: true, timeout: 3000 }).catch(() => {});
    await ws.waitForTimeout(150);
    !ws.isClosed() ? console.log('✓ attaque : clic immédiat (avant armement) sans effet') : fail('clic immédiat a signé');
    await ws.waitForTimeout(800);
    await ws.getByRole('button', { name: 'Signer' }).click({ noWaitAfter: true }).catch(() => {});
    r = await page.evaluate(() => window.kx.one);
    typeof r.r === 'string' ? console.log('✓ clic après armement : signé') : fail(`armement ${JSON.stringify(r)}`);

    // 8. Inondation de signatures : 3 fenêtres au plus, le reste -32002 ; fermer = refus.
    await page.evaluate(() => {
      window.kx.sigs = Promise.all(Array.from({ length: 10 }, (_, i) => window.kx.call('personal_sign', ['0x' + (100 + i).toString(16), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'])));
    });
    await page.waitForTimeout(2500);
    const n = windows().length;
    n <= 3 && n > 0 ? console.log(`✓ attaque : 10 signatures d’un coup → ${n} fenêtres au plus`) : fail(`${n} fenêtres de signature`);
    for (const w of windows()) await w.close();
    r = await page.evaluate(() => window.kx.sigs);
    r.every((x) => x.code === 4001 || x.code === -32002) ? console.log('✓ fenêtres fermées : refus (4001) ou demande en trop (-32002), rien de signé') : fail(`signatures ${JSON.stringify(r)}`);
    r = await page.evaluate(() => window.kx.call('personal_sign', ['0x6869', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94']));
    await page.waitForTimeout(600);
    r.code === 4001 && windows().length === 0 ? console.log('✓ et pas de nouvelle fenêtre de signature aussitôt après les refus') : fail(`après refus ${JSON.stringify(r)}`);
  } finally {
    await ctx.close();
    server.close();
  }
}
if (!process.exitCode && !cspViolations.length) console.log('✓ aucune violation CSP / Trusted Types');
if (!process.exitCode) console.log('OK');
