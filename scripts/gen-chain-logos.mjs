#!/usr/bin/env node
/**
 * Génère src/domain/chains/chainLogos.generated.ts : le logo VECTORIEL de chaque
 * réseau, embarqué dans l'app.
 *
 * Pourquoi : les logos venaient de DefiLlama en miniature (`rsz_…`, ~64 px)
 * agrandie par un proxy — flous sur un écran haute densité, un appel réseau par
 * icône, rien hors ligne. Un SVG est net à toute taille et s'affiche tout de
 * suite.
 *
 * Source : web3icons (MIT), variante « background » (pastille de marque).
 * L'appariement se fait par IDENTIFIANT DE CHAÎNE EVM, pas par nom : plusieurs
 * projets partagent un nom (Gravity, BOB, Core…), jamais un chainId.
 *
 *   node --no-warnings scripts/gen-chain-logos.mjs
 *
 * Réseau sans logo trouvé → absent du fichier → `chainIconUrl` retombe sur
 * l'image distante, puis sur le cercle lettré.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = '@web3icons/core@4.0.56';
const COMMON = '@web3icons/common@0.11.51';
const OUT = join(ROOT, 'src/domain/chains/chainLogos.generated.ts');

/** Réseaux sans chainId EVM, ou réseaux de test : logo d'un autre identifiant. */
const BY_NAME = {
  bitcoin: 'bitcoin',
  solana: 'solana',
  'solana-devnet': 'solana',
  ton: 'ton',
  'ton-testnet': 'ton',
  sepolia: 'ethereum',
  'base-sepolia': 'base',
  'monad-testnet': 'monad',
  // web3icons range Hemi sous l'identifiant de son réseau de test (743111).
  hemi: 'hemi',
  // opBNB n'a pas de logo propre dans web3icons : c'est la marque BNB.
  opbnb: 'binance-smart-chain',
};

function unpack(spec, into) {
  const file = execFileSync('npm', ['pack', spec, '--silent'], { cwd: into, encoding: 'utf8' }).trim().split('\n').pop();
  const dir = join(into, spec.replace(/[@/]/g, '_'));
  execFileSync('mkdir', ['-p', dir]);
  execFileSync('tar', ['xzf', join(into, file), '-C', dir]);
  return join(dir, 'package');
}

/** SVG compact : sans l'attribut de classe du site, sans l'indentation. */
function compact(svg) {
  return svg.replace(/\s*class="web3icons"/, '').replace(/>\s+</g, '><').trim();
}

const work = mkdtempSync(join(tmpdir(), 'chain-logos-'));
const core = unpack(CORE, work);
const common = unpack(COMMON, work);

const { networks } = await import(pathToFileURL(join(common, 'dist/metadata/networks.js')).href);
const byChainId = new Map(networks.filter((n) => n.chainId != null).map((n) => [Number(n.chainId), n.id]));

const configs = await import(pathToFileURL(join(ROOT, 'src/domain/chains/configs.ts')).href);
const chains = Object.values(configs).filter((c) => c && typeof c === 'object' && c.id && c.family);

/*
 * Uniquement les logos de RÉSEAU : essayé sur les jetons natifs (CORE, DEGEN),
 * web3icons renvoie d'autres marques — vérifié sur planche le 2026-09-27.
 */
const svgPath = (kind, id) => join(core, `dist/svgs/${kind}/background/${id}.svg.js`);
const logos = {};
const missing = [];
for (const chain of chains) {
  const network = BY_NAME[chain.id] ?? (chain.evmChainId != null ? byChainId.get(Number(chain.evmChainId)) : undefined);
  let file = network && existsSync(svgPath('networks', network)) ? svgPath('networks', network) : undefined;
  if (!file || !existsSync(file)) {
    missing.push(chain.id);
    continue;
  }
  logos[chain.id] = compact((await import(pathToFileURL(file).href)).default);
}

const ids = Object.keys(logos).sort();
const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(logos[id])},`).join('\n');
writeFileSync(
  OUT,
  `/* eslint-disable */
// GÉNÉRÉ par scripts/gen-chain-logos.mjs — ne pas modifier à la main.
//
// Logos : web3icons (${CORE}), https://github.com/0xa3k5/web3icons
// Licence MIT — Copyright (c) 0xa3k5. Permission is hereby granted, free of
// charge, to any person obtaining a copy of this software, to deal in the
// Software without restriction, subject to the above copyright notice being
// included in all copies. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY.
//
// Sans logo embarqué (image distante) : ${missing.join(', ') || 'aucun'}.

export const CHAIN_LOGO_SVG: Readonly<Record<string, string>> = {
${body}
};
`,
);
console.log(`${ids.length} logos écrits, ${missing.length} sans logo : ${missing.join(', ')}`);
rmSync(work, { recursive: true, force: true });
