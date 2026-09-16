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
const NO_ICON = new Set(['gravity', 'monad-testnet', 'sepolia', 'memecore']);

/**
 * URL de l'icône d'un réseau (ou undefined → cercle lettré côté UI).
 *
 * ⚠️ Les icônes DefiLlama sont servies en `image/webp` — que React Native `<Image>`
 * NE DÉCODE PAS sur iOS (et de façon inégale sur Android) → l'image échouait et on
 * retombait sur la lettre (« E » pour les L2 ETH). On les passe donc par le proxy
 * d'images `wsrv.nl` qui les convertit en **PNG** (rendu fiable partout), redimensionné.
 */
export function chainIconUrl(id: string): string | undefined {
  if (NO_ICON.has(id)) return undefined;
  const slug = SLUG_OVERRIDE[id] ?? id;
  const src = `icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&output=png&w=96&h=96&fit=cover`;
}
