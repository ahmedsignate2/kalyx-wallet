#!/usr/bin/env node
/**
 * Garde « bonne adresse par chaîne ».
 *
 * `account.address` est l'adresse du réseau AFFICHÉ dans l'app. L'utiliser là
 * où une chaîne précise est attendue (dApp EVM, Solana Pay, WalletConnect…)
 * donne une adresse Solana à une dApp Ethereum, ou l'inverse — faute trouvée à
 * six endroits le 28/09. Utiliser `addressForChain(compte, chaîne)` ou
 * `evmAddress` / `solAddress` / `btcAddress` du compte actif.
 *
 * Les usages existants, vérifiés un par un (réseau actif voulu), sont listés
 * ci-dessous avec leur nombre. Un nouveau fichier, ou un nombre qui augmente,
 * fait échouer la CI : vérifier puis, si l'usage est juste, mettre à jour ici.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REVIEWED = {
  'app/swap.tsx': 14, // la source d'un échange est toujours le réseau actif
  'app/token/[id].tsx': 2, // déclencheur de rafraîchissement seulement
  'app/approvals.tsx': 3, // écran EVM du réseau actif
  'app/security.tsx': 3, // idem
  'app/wallet-born.tsx': 1, // affichage après création
  'ui/BtcAccelerate.tsx': 1, // ouvert sur Bitcoin actif
  'ui/TokenPicker.tsx': 4, // variable locale, calculée par addressForChain
  'lib/walletStore.ts': 13, // le coffre lui-même
};

const files = execFileSync('git', ['ls-files', '-z', '--', '*.ts', '*.tsx'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !/\.test\.tsx?$/.test(f) && /^(app|ui|lib|components|src)\//.test(f));

const bad = [];
for (const f of files) {
  const code = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const n = (code.match(/\baccount\??\.address\b/g) ?? []).length;
  if (n > (REVIEWED[f] ?? 0)) bad.push(`${f} : ${n} (vérifié : ${REVIEWED[f] ?? 0})`);
}
if (bad.length) {
  console.error("`account.address` = adresse du réseau AFFICHÉ. Nouvel usage à vérifier (addressForChain ?) :\n  " + bad.join('\n  '));
  process.exit(1);
}
console.log('OK : aucun nouvel usage de account.address.');
