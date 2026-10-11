/** Préférences du navigateur (non sensibles) : moteur de recherche, mode sombre forcé. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAPP_CATALOG, DAPP_CATEGORIES, type CatalogDapp } from '../src/domain/web/dappCatalog';

export type SearchEngine = 'google' | 'duckduckgo' | 'brave';
export const ENGINES: { key: SearchEngine; label: string; url: (q: string) => string }[] = [
  { key: 'google', label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { key: 'duckduckgo', label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  { key: 'brave', label: 'Brave', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
];

const K_ENGINE = 'kalyx.browser.engine';
const K_DARK = 'kalyx.browser.forceDark';

export async function loadBrowserPrefs(): Promise<{ engine: SearchEngine; forceDark: boolean }> {
  try {
    const [e, d] = await Promise.all([AsyncStorage.getItem(K_ENGINE), AsyncStorage.getItem(K_DARK)]);
    return { engine: (e as SearchEngine) || 'google', forceDark: d === '1' };
  } catch {
    return { engine: 'google', forceDark: false };
  }
}
export function saveEngine(e: SearchEngine): void {
  AsyncStorage.setItem(K_ENGINE, e).catch(() => {});
}
export function saveForceDark(on: boolean): void {
  AsyncStorage.setItem(K_DARK, on ? '1' : '0').catch(() => {});
}

/**
 * dApps vérifiées, regroupées par catégorie (page nouvel onglet, suggestions,
 * coche « vérifié »). Le catalogue lui-même (compatibilité, icônes) vit dans
 * `src/domain/web/dappCatalog.ts` ; cet export est gardé pour les appelants.
 */
export const VERIFIED_DAPPS: { category: string; items: CatalogDapp[] }[] = DAPP_CATEGORIES.map((category) => ({
  category,
  items: DAPP_CATALOG.filter((d) => d.category === category),
}));
