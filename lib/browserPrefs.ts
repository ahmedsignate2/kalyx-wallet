/** Préférences du navigateur (non sensibles) : moteur de recherche, mode sombre forcé. */
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/** dApps vérifiées par usage (page nouvel onglet). Vrais logos (favicon HD), zéro emoji. */
export const VERIFIED_DAPPS: { category: string; items: { name: string; host: string; url: string }[] }[] = [
  { category: 'Swap', items: [
    { name: 'Uniswap', host: 'app.uniswap.org', url: 'https://app.uniswap.org' },
    { name: '1inch', host: 'app.1inch.io', url: 'https://app.1inch.io' },
    { name: 'Jupiter', host: 'jup.ag', url: 'https://jup.ag' },
    { name: 'PancakeSwap', host: 'pancakeswap.finance', url: 'https://pancakeswap.finance' },
    { name: 'Curve', host: 'curve.fi', url: 'https://curve.fi' },
  ] },
  { category: 'Lending', items: [
    { name: 'Aave', host: 'app.aave.com', url: 'https://app.aave.com' },
    { name: 'Compound', host: 'app.compound.finance', url: 'https://app.compound.finance' },
    { name: 'Morpho', host: 'app.morpho.org', url: 'https://app.morpho.org' },
  ] },
  { category: 'Staking', items: [
    { name: 'Lido', host: 'stake.lido.fi', url: 'https://stake.lido.fi' },
    { name: 'Rocket Pool', host: 'stake.rocketpool.net', url: 'https://stake.rocketpool.net' },
    { name: 'Jito', host: 'jito.network', url: 'https://www.jito.network/staking' },
    { name: 'EigenLayer', host: 'app.eigenlayer.xyz', url: 'https://app.eigenlayer.xyz' },
  ] },
  { category: 'NFT', items: [
    { name: 'OpenSea', host: 'opensea.io', url: 'https://opensea.io' },
    { name: 'Blur', host: 'blur.io', url: 'https://blur.io' },
    { name: 'Magic Eden', host: 'magiceden.io', url: 'https://magiceden.io' },
  ] },
  { category: 'Bridges', items: [
    { name: 'Across', host: 'app.across.to', url: 'https://app.across.to' },
    { name: 'Stargate', host: 'stargate.finance', url: 'https://stargate.finance' },
    { name: 'Jumper', host: 'jumper.exchange', url: 'https://jumper.exchange' },
  ] },
];
