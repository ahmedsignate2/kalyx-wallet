/**
 * WEBAPP (app.kalyxwallet.com) : l'interface de l'extension, construite comme
 * un site statique. Mêmes alias et mêmes constantes que l'extension
 * (wxt.config.ts) : relais Kalyx, identifiant public WalletConnect fourni au build.
 *
 *   WALLETCONNECT_ID=… npx vite build --config web/vite.config.ts
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * En-têtes du site publié (format Cloudflare Pages / Netlify : `_headers`).
 * La même politique que les pages de l'extension : nos scripts et nos styles
 * seulement, aucune injection de HTML par chaîne (Trusted Types), réseau https
 * et wss (nœuds, relais Kalyx, WalletConnect). Cadres : la vérification
 * d'origine de WalletConnect (Verify) seulement ; embarqué par Telegram
 * seulement (mini-app sur Telegram Web). Reprend le durcissement de l'ancien
 * tableau de bord (public/_headers) : HSTS, CORP, Permissions-Policy large.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self' https: wss:",
  "media-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
  'upgrade-insecure-requests',
].join('; ');
const HEADERS = `/*
  Content-Security-Policy: ${CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;
const SECURITY_TXT = `Contact: mailto:security@kalyxwallet.com
Contact: https://intakesecurity.io/programs/kalyx-wallet/submit
Contact: https://github.com/ahmedsignate2/kalyx-wallet/security/advisories/new
Policy: https://github.com/ahmedsignate2/kalyx-wallet/blob/main/docs/security/VDP.md
Acknowledgments: https://github.com/ahmedsignate2/kalyx-wallet/blob/main/docs/security/ACKNOWLEDGMENTS.md
Preferred-Languages: en, fr
Canonical: https://app.kalyxwallet.com/.well-known/security.txt
Expires: 2027-10-26T00:00:00.000Z
`;
function headers(): Plugin {
  return {
    name: 'kalyx-web-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
      // RFC 9116 : où signaler une faille (programme de divulgation, voir docs/security/VDP.md).
      this.emitFile({ type: 'asset', fileName: '.well-known/security.txt', source: SECURITY_TXT });
    },
  };
}

const RELAY_URL = 'https://kalyx-ton-proxy.ahamedsignate2.workers.dev';
const WALLETCONNECT_ID = (process.env.WALLETCONNECT_ID || process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '').trim();
const TON_CRYPTO = fileURLToPath(new URL('../../src/crypto/tonCoreCrypto.ts', import.meta.url));
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

/** Dossier de sortie : `KALYX_WEB_OUT` (depuis la racine du dépôt, ex. `dist` pour le déploiement), sinon .output/web. */
const OUT = process.env.KALYX_WEB_OUT ? resolve(fileURLToPath(new URL('../..', import.meta.url)), process.env.KALYX_WEB_OUT) : null;

export default defineConfig(({ mode }) => ({
  plugins: [headers()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  base: '/',
  resolve: { alias: { '@ton/crypto': TON_CRYPTO } },
  define: {
    'process.env': JSON.stringify({ EXPO_PUBLIC_KALYX_RELAY_URL: RELAY_URL, EXPO_PUBLIC_WALLETCONNECT_ID: WALLETCONNECT_ID }),
    __KALYX_VERSION__: JSON.stringify(PKG.version),
    // `--mode test` : crochet de test (web/smoke.mjs) ; jamais dans le build publié.
    __KALYX_WEB_TEST__: JSON.stringify(mode === 'test'),
  },
  build: {
    outDir: mode === 'test' ? fileURLToPath(new URL('../.output/web-test', import.meta.url)) : (OUT ?? fileURLToPath(new URL('../.output/web', import.meta.url))),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
}));
