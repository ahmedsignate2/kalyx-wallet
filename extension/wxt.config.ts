import { defineConfig } from 'wxt';
import { extensionRegistry } from './scripts/registryPlugin';
import { readFileSync } from 'node:fs';

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
  vite: () => ({ define: { 'process.env': '{}' }, plugins: [extensionRegistry()] }),
  manifest: {
    // Nom et description dans la langue du navigateur : public/_locales.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Bêta non répertoriée (lot 8) : affichée dans Chrome et dans les réglages.
    version_name: `${PKG.version} beta`,
    minimum_chrome_version: '116',
    permissions: ['storage', 'alarms', 'idle', 'sidePanel', 'scripting'],
    // Le script de page (monde MAIN) est enregistré par le service worker : il lui faut l'accès aux sites.
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'Kalyx Wallet', default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' } },
  },
});
