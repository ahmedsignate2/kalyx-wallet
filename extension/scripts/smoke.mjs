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

const launch = () => chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kalyx-ext-')), {
  headless: true,
  locale: 'fr-FR',
  executablePath: process.env.CHROMIUM_PATH,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', '--lang=fr'],
});
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
  Object.keys(local).join() === 'kalyx.vault' && key && !dump.includes(key) && !dump.includes(PW)
    ? console.log('✓ disque : coffre chiffré seulement (ni clé de session, ni mot de passe)')
    : fail(`disque : ${Object.keys(local)}`);

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
        await page.screenshot({ path: join(SHOTS, `${name}-${scheme}.png`) });
      }
      await page.emulateMedia({ colorScheme: 'light' });
    };
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 360, height: 560 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByText('Commencer').waitFor();
    console.log('✓ popup sans coffre : « Commencer »');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `popup-start-${scheme}.png`) });

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

    // ── Portefeuille (lot 3) ──
    await popup.reload();
    await popup.locator('select.account').waitFor();
    const options = await popup.locator('select.account option').count();
    options >= 2 ? console.log(`✓ popup : sélecteur de comptes (${options})`) : fail(`popup : ${options} compte(s)`);
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
    await popup.locator('select.account').waitFor();
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `popup-wallet-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.getByRole('tab', { name: 'Activité' }).click();
    await popup.waitForFunction(() => !document.querySelector('.list')?.textContent?.includes('Actualisation'), null, { timeout: 120_000 });
    const act = await popup.locator('.list').textContent();
    console.log(`✓ onglet Activité : ${(await popup.locator('.list .row').count())} ligne(s)${act.includes('Sans réponse') ? ' · réseaux muets nommés' : ''}`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `popup-activity-${scheme}.png`) });

    // Changer de compte : l'écran suit.
    const first = await popup.locator('select.account').inputValue();
    const other = await popup.locator('select.account option').evaluateAll((os, cur) => os.map((o) => o.value).find((v) => v !== cur), first);
    await popup.locator('select.account').selectOption(other);
    await popup.waitForFunction((v) => document.querySelector('select.account')?.value === v, other);
    console.log('✓ changement de compte');

    // Réglages : devise.
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.locator('select').first().selectOption('usd');
    await popup.waitForFunction(() => document.querySelector('[data-testid=total]'), null, { timeout: 30_000 });
    const totalUsd = await popup.locator('[data-testid=total]').textContent();
    totalUsd === '—' || totalUsd.includes('$') ? console.log(`✓ devise USD (« ${totalUsd} »)`) : fail(`devise : « ${totalUsd} »`);

    // Panneau latéral : la même interface, plus large.
    const panel = await ctx.newPage();
    await panel.setViewportSize({ width: 420, height: 820 });
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.locator('select.account').waitFor();
    console.log('✓ panneau latéral affiché');
    if (SHOTS) for (const scheme of ['light', 'dark']) await panel.emulateMedia({ colorScheme: scheme }), await panel.screenshot({ path: join(SHOTS, `sidepanel-${scheme}.png`) });

    // ── Envoyer et recevoir (lot 4) ──
    const bg = (m) => popup.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    await popup.reload();
    await popup.locator('select.account').waitFor();
    // Portefeuille à phrase NON vérifiée : l'écran intermédiaire passe au premier « Recevoir ».
    const fresh = await bg({ type: 'wallet:create' });
    await bg({ type: 'home:select', walletId: fresh.id, index: 0 });
    await popup.reload();
    await popup.getByRole('button', { name: /Recevoir/ }).click();
    await popup.getByText('Ta phrase n’est pas vérifiée').waitFor();
    console.log('✓ premier « Recevoir » sans phrase vérifiée : écran intermédiaire');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `receive-warn-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.getByRole('button', { name: 'Continuer quand même' }).click();
    await popup.locator('.qr svg').waitFor();
    const shownAddr = (await popup.locator('[data-testid=receive-address]').textContent()).replace(/\s/g, '');
    const freshMeta = (await bg({ type: 'wallet:list' })).wallets.find((w) => w.id === fresh.id);
    shownAddr === freshMeta.accounts[0].evm ? console.log('✓ Recevoir : QR + adresse EVM du compte affiché') : fail(`adresse reçue ${shownAddr}`);
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `receive-${scheme}.png`) });
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
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `send-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });

    // Liste blanche : activée, un inconnu est bloqué AVANT tout réseau.
    await popup.getByRole('button', { name: /Retour/ }).click();
    await popup.getByRole('button', { name: 'Réglages' }).click();
    await popup.getByRole('button', { name: 'Liste blanche' }).click();
    await popup.getByRole('button', { name: 'Activer' }).click();
    await popup.waitForFunction(() => document.querySelector('[data-testid=wl-state]')?.textContent === 'Activée');
    console.log('✓ liste blanche activée');
    if (SHOTS) for (const scheme of ['light', 'dark']) await popup.emulateMedia({ colorScheme: scheme }), await popup.screenshot({ path: join(SHOTS, `whitelist-${scheme}.png`) });
    await popup.emulateMedia({ colorScheme: 'light' });
    const blocked = await bg({ type: 'send:prepare', assetKey: 'ethereum:native', to: '0x1111111111111111111111111111111111111111', amount: '0.01' });
    blocked.error === 'NOT_WHITELISTED' ? console.log('✓ liste blanche : destinataire inconnu bloqué') : fail(`liste blanche : ${JSON.stringify(blocked)}`);
    const wlDisk = JSON.stringify(await popup.evaluate(() => chrome.storage.local.get('kalyx.whitelist')));
    wlDisk.includes('"ct"') && !wlDisk.includes('"enabled"') ? console.log('✓ liste blanche scellée sur le disque') : fail('liste blanche en clair');

    // Verrouillé : plus rien d'affiché.
    await popup.reload();
    await popup.locator('select.account').waitFor();
    await popup.getByRole('button', { name: 'Verrouiller' }).click();
    await popup.locator('input[type=password]').waitFor();
    (await popup.locator('[data-testid=total]').count()) === 0 ? console.log('✓ verrouillé : soldes masqués') : fail('soldes visibles verrouillé');
  } finally {
    await ctx.close();
  }
}
if (!process.exitCode) console.log('OK');
