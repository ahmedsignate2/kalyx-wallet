#!/usr/bin/env node
/**
 * Génère src/domain/ramp/buyLogos.generated.ts : les VRAIS logos de l'achat,
 * embarqués (nets à toute taille, affichés hors ligne, sans appel réseau).
 *
 *  - jetons achetables : web3icons (MIT), variante « background » : la même
 *    pastille de marque que les logos de réseau (gen-chain-logos.mjs), pour
 *    que liste des jetons et liste des réseaux parlent la même langue ;
 *  - Apple Pay, Google Pay, Visa, SEPA : simple-icons (CC0), tracés seuls —
 *    la couleur est posée à l'affichage (le noir d'Apple Pay devient blanc en
 *    mode sombre). Mastercard est dessiné directement (deux disques).
 *
 *   node --no-warnings scripts/gen-buy-logos.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/domain/ramp/buyLogos.generated.ts');
const CORE = '@web3icons/core@4.0.56';
const SIMPLE = 'simple-icons@13.21.0';

/** Jetons : symbole affiché → fichier web3icons. */
const TOKENS = {
  USDC: 'tokens/background/USDC',
  USDT: 'tokens/background/USDT',
  EURC: 'tokens/background/EURC',
  PYUSD: 'tokens/background/PYUSD',
  DAI: 'tokens/background/DAI',
  // Un jeton natif porte le logo de son réseau : identique dans les deux listes.
  BTC: 'networks/background/bitcoin',
  ETH: 'networks/background/ethereum',
  SOL: 'networks/background/solana',
  POL: 'networks/background/polygon',
  BNB: 'networks/background/binance-smart-chain',
  AVAX: 'networks/background/avalanche',
  TON: 'networks/background/ton',
};
const PAY = { applepay: 'applepay', googlepay: 'googlepay', visa: 'visa', sepa: 'sepa' };

function unpack(spec, into) {
  const file = execFileSync('npm', ['pack', spec, '--silent'], { cwd: into, encoding: 'utf8' }).trim().split('\n').pop();
  const dir = join(into, spec.replace(/[^a-z0-9]/gi, '_'));
  execFileSync('mkdir', ['-p', dir]);
  execFileSync('tar', ['xzf', join(into, file), '-C', dir]);
  return join(dir, 'package');
}
const compact = (svg) => svg.replace(/\s*\n\s*/g, '').replace(/ class="web3icons"/, '');

const work = mkdtempSync(join(tmpdir(), 'kalyx-buy-logos-'));
try {
  const core = unpack(CORE, work);
  const simple = unpack(SIMPLE, work);
  const tokens = {};
  for (const [sym, rel] of Object.entries(TOKENS)) {
    const file = join(core, 'dist/svgs', `${rel}.svg.js`);
    if (!existsSync(file)) throw new Error(`logo manquant : ${rel}`);
    tokens[sym] = compact((await import(pathToFileURL(file).href)).default);
  }
  const pay = {};
  for (const [k, name] of Object.entries(PAY)) {
    const svg = readFileSync(join(simple, 'icons', `${name}.svg`), 'utf8');
    pay[k] = /<path d="([^"]+)"/.exec(svg)[1];
  }
  const body = `/* eslint-disable */
// GÉNÉRÉ par scripts/gen-buy-logos.mjs — ne pas modifier à la main.
//
// Jetons : web3icons (${CORE}), licence MIT, Copyright (c) 0xa3k5.
// Moyens de paiement : simple-icons (${SIMPLE}), CC0 1.0. Les marques restent
// la propriété de leurs titulaires ; elles désignent ici le moyen de paiement.

/** Logo de marque des jetons achetables (SVG complet). */
export const TOKEN_LOGO_SVG: Readonly<Record<string, string>> = ${JSON.stringify(tokens, null, 2)};

/** Tracés (viewBox 0 0 24 24) des moyens de paiement ; couleur posée à l'affichage. */
export const PAY_LOGO_PATH: Readonly<Record<'applepay' | 'googlepay' | 'visa' | 'sepa', string>> = ${JSON.stringify(pay, null, 2)};
`;
  writeFileSync(OUT, body);
  console.log(`${Object.keys(tokens).length} jetons, ${Object.keys(pay).length} moyens de paiement → ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
