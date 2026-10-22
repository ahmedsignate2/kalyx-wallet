import { defineConfig } from 'wxt';
import { extensionRegistry } from './scripts/registryPlugin';
import { readFileSync } from 'node:fs';

/** Relais Kalyx (Worker Cloudflare) : les fournisseurs à clé passent par lui, aucune clé dans l'extension. */
const RELAY_URL = 'https://kalyx-ton-proxy.ahamedsignate2.workers.dev';

/**
 * Mode compagnon : identifiant de projet WalletConnect (Reown). PUBLIC (ce n'est
 * pas une clé secrète), fourni au build ; absent, le mode compagnon s'affiche
 * comme indisponible. Le même que l'app (EXPO_PUBLIC_WALLETCONNECT_ID).
 */
const WALLETCONNECT_ID = (process.env.WALLETCONNECT_ID || process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '').trim();

const PKG = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Extension Kalyx — Manifest V3, Chromium (Chrome, Brave, Edge) en v1.
 *
 * Permissions réduites à ce que le cahier des charges prévoit. L'accès aux
 * sites (http/https) sert UNIQUEMENT au pont vers les dApps (lot 5) : un
 * script de page inerte et un relais, en page principale seulement.
 */
export default defineConfig({
  /*
   * Le cœur (src/domain/chains/configs) lit des clés d'API via process.env,
   * inexistant dans un service worker. Aucune clé n'est embarquée dans
   * l'extension : elles passeront par un relais (cahier des charges, §8).
   */
  vite: () => ({ define: { 'process.env': JSON.stringify({ EXPO_PUBLIC_KALYX_RELAY_URL: RELAY_URL, EXPO_PUBLIC_WALLETCONNECT_ID: WALLETCONNECT_ID }) }, plugins: [extensionRegistry()] }),
  manifest: {
    // Nom et description dans la langue du navigateur : public/_locales.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Bêta non répertoriée (lot 8) : affichée dans Chrome et dans les réglages.
    version_name: `${PKG.version} beta`,
    minimum_chrome_version: '116',
    permissions: ['storage', 'alarms', 'idle', 'sidePanel', 'scripting', 'notifications'],
    // Le script de page (monde MAIN) est enregistré par le service worker : il lui faut l'accès aux sites.
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    // Pages de l'extension : nos scripts seulement, aucun plugin, jamais affichées dans le cadre d'un site.
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
    action: { default_title: 'Kalyx Wallet', default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' } },
  },
});
