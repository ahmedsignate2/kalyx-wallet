#!/usr/bin/env node
/**
 * Images du Chrome Web Store, à partir de la VRAIE extension construite :
 * captures prises dans Chromium (profil neuf, langue choisie), puis mises en
 * page en 1280×800 avec une légende. Plus la petite tuile 440×280.
 *
 *   npm run build && node scripts/store-images.mjs            # fr et en
 *   LANGS=de,ja node scripts/store-images.mjs                  # autres langues
 *
 * Seulement des écrans qui ne dépendent ni du réseau ni d'un site de test :
 * accueil et phrase floutée. Les écrans avec de vrais soldes et une vraie dApp
 * se capturent pendant la bêta (voir store/PUBLISH.md) et passent par
 * frame() : `FRAME=capture.png TITLE="…" SUB="…" OUT=… node scripts/store-images.mjs`.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '../.output/chrome-mv3');
const OUT = join(HERE, '../store/images');
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);

const CAPTIONS = {
  fr: {
    welcome: ['Tes clés restent chez toi.', 'Chiffrées sur ton ordinateur avec ton mot de passe. Kalyx n’a pas de serveur de comptes.'],
    phrase: ['Ta phrase, floutée par défaut.', '12 mots à noter sur papier, puis à vérifier. Kalyx ne te la demandera jamais.'],
    tile: 'Portefeuille non-custodial · EVM et Solana',
  },
  en: {
    welcome: ['Your keys stay with you.', 'Encrypted on your computer with your password. Kalyx has no account server.'],
    phrase: ['Your phrase, blurred by default.', '12 words to write on paper, then check. Kalyx will never ask for it.'],
    tile: 'Non-custodial wallet · EVM and Solana',
  },
};

const font = (w) => `url(data:font/ttf;base64,${readFileSync(join(HERE, `../public/fonts/GeneralSans-${w}.ttf`)).toString('base64')})`;
const LOGO = `data:image/png;base64,${readFileSync(join(HERE, '../public/icon/128.png')).toString('base64')}`;
const CSS = `
@font-face { font-family: G; src: ${font('Medium')}; font-weight: 500; }
@font-face { font-family: G; src: ${font('Semibold')}; font-weight: 600; }
* { margin: 0; box-sizing: border-box; }
body { font-family: G, sans-serif; background: #F4EEE5; color: #1D1A16; }`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Une capture dans un cadre 1280×800, légende à gauche. */
async function frame(browser, png, title, sub, out) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const img = `data:image/png;base64,${readFileSync(png).toString('base64')}`;
  await page.setContent(`<style>${CSS}
    .w { display: flex; align-items: center; gap: 56px; height: 800px; padding: 0 72px; }
    .t { flex: 1; } .t img { width: 56px; border-radius: 14px; margin-bottom: 36px; }
    h1 { font-weight: 600; font-size: 50px; line-height: 1.08; letter-spacing: -0.02em; }
    p { margin-top: 20px; font-weight: 500; font-size: 22px; line-height: 1.45; color: #6B6358; max-width: 470px; }
    .s { flex: none; width: 560px; height: 680px; border-radius: 28px; overflow: hidden; background: #fff; box-shadow: 0 30px 80px rgba(70,48,24,.18), 0 0 0 1px rgba(70,48,24,.08); }
    .s img { width: 100%; height: 100%; object-fit: cover; object-position: top center; }
  </style><div class="w"><div class="t"><img src="${LOGO}"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="s"><img src="${img}"></div></div>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out });
  await page.close();
  console.log('✓', out);
}

async function tile(browser, sub, out) {
  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await page.setContent(`<style>${CSS}
    body { background: #0B0B10; color: #F5F1EA; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 280px; gap: 14px; }
    img { width: 72px; border-radius: 18px; } h1 { font-weight: 600; font-size: 34px; letter-spacing: -0.01em; } p { font-weight: 500; font-size: 15px; color: #E6C682; }
  </style><img src="${LOGO}"><h1>Kalyx Wallet</h1><p>${esc(sub)}</p>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out });
  await page.close();
  console.log('✓', out);
}

/** Captures de l'onboarding, dans une langue, sur un profil neuf. */
async function shoot(lang) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kalyx-store-')), {
    headless: true,
    deviceScaleFactor: 2,
    locale: lang,
    executablePath: process.env.CHROMIUM_PATH,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', `--lang=${lang}`],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }));
    // Même rapport que le cadre (560×680), en double densité : net une fois mis en page.
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 530, height: 644 });
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/onboarding.html`);
    await page.locator('h1').first().waitFor();
    const dir = mkdtempSync(join(tmpdir(), 'kalyx-shots-'));
    await page.screenshot({ path: join(dir, 'welcome.png') });
    await page.locator('button.btn').first().click();
    const pw = page.locator('input[type=password]');
    // Mot de passe jetable d'un profil de capture, détruit à la fin.
    const secret = `Store-${crypto.randomUUID()}`;
    await pw.nth(0).fill(secret);
    await pw.nth(1).fill(secret);
    await page.locator('button[type=submit]').click();
    await page.locator('.grid').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(dir, 'phrase.png') });
    return dir;
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  if (process.env.FRAME) {
    await frame(browser, process.env.FRAME, process.env.TITLE ?? '', process.env.SUB ?? '', process.env.OUT ?? join(OUT, 'custom.png'));
  } else {
    for (const lang of (process.env.LANGS ?? 'fr,en').split(',')) {
      const c = CAPTIONS[lang];
      if (!c) throw new Error(`légendes manquantes pour ${lang}`);
      const dir = await shoot(lang);
      await frame(browser, join(dir, 'welcome.png'), ...c.welcome, join(OUT, `${lang}-1-keys.png`));
      await frame(browser, join(dir, 'phrase.png'), ...c.phrase, join(OUT, `${lang}-2-phrase.png`));
      await tile(browser, c.tile, join(OUT, `${lang}-tile-440x280.png`));
    }
  }
} finally {
  await browser.close();
}
