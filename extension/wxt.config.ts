import { defineConfig } from 'wxt';
import { extensionRegistry } from './scripts/registryPlugin';

/**
 * Extension Kalyx — Manifest V3, Chromium (Chrome, Brave, Edge) en v1.
 *
 * Permissions réduites à ce que le cahier des charges prévoit. L'injection
 * dans les pages (accès à tous les sites) n'arrive qu'au lot 5, avec le pont
 * vers les dApps : rien n'est demandé avant d'en avoir besoin.
 */
export default defineConfig({
  /*
   * Le cœur (src/domain/chains/configs) lit des clés d'API via process.env,
   * inexistant dans un service worker. Aucune clé n'est embarquée dans
   * l'extension : elles passeront par un relais (cahier des charges, §8).
   */
  vite: () => ({ define: { 'process.env': '{}' }, plugins: [extensionRegistry()] }),
  manifest: {
    name: 'Kalyx Wallet',
    description: 'Portefeuille non-custodial pour Ethereum, les réseaux EVM et Solana.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'alarms', 'idle', 'sidePanel'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'Kalyx Wallet', default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' } },
  },
});
