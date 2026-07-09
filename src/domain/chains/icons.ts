/**
 * URL d'icône par réseau, via le CDN DefiLlama (standard de facto, stable).
 *
 * Pourquoi : les icônes réseau venaient des « markets » CoinGecko keyés par
 * `coingeckoId`. Or Base/Arbitrum/Optimism… partagent `coingeckoId: 'ethereum'`
 * → ils affichaient TOUS l'icône ETH ; et les réseaux hors top-60 n'avaient
 * aucune icône. Ici chaque réseau a sa vraie marque, indépendante du prix.
 *
 * Slugs alignés sur l'`id` de chaîne, sauf exceptions ci-dessous (vérifiées en
 * live le 2026-07-09). Réseau non couvert → `undefined` → l'UI affiche un cercle
 * lettré de repli (jamais d'image cassée).
 */
const SLUG_OVERRIDE: Record<string, string> = {
  bnb: 'bsc',
  immutable: 'imx',
  swell: 'swellchain',
  worldchain: 'world-chain',
  zksync: 'zksync-era',
};

// Réseaux sans icône DefiLlama connue → repli lettré (évite un 404/broken image).
const NO_ICON = new Set(['gravity', 'monad-testnet', 'sepolia']);

/** URL de l'icône d'un réseau (ou undefined → cercle lettré côté UI). */
export function chainIconUrl(id: string): string | undefined {
  if (NO_ICON.has(id)) return undefined;
  const slug = SLUG_OVERRIDE[id] ?? id;
  return `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
}
