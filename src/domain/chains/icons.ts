import { CHAIN_LOGO_SVG } from './chainLogos.generated';

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
/**
 * Préfixe des logos EMBARQUÉS (scripts/gen-chain-logos.mjs). `chainIconUrl`
 * garde sa forme — une chaîne — pour que les écrans la passent comme avant ;
 * c'est le composant d'image (ui/kit/LogoImage) qui reconnaît le préfixe et
 * dessine le SVG au lieu d'aller sur le réseau.
 */
export const CHAIN_LOGO_PREFIX = 'kalyx-chain:';

/** SVG du logo embarqué désigné par `uri`, ou undefined si ce n'en est pas un. */
export function embeddedChainLogo(uri: string | null | undefined): string | undefined {
  return uri?.startsWith(CHAIN_LOGO_PREFIX) ? CHAIN_LOGO_SVG[uri.slice(CHAIN_LOGO_PREFIX.length)] : undefined;
}

const SLUG_OVERRIDE: Record<string, string> = {
  bnb: 'bsc',
  immutable: 'imx',
  swell: 'swellchain',
  worldchain: 'world-chain',
  zksync: 'zksync-era',
};

// Réseaux sans icône DefiLlama connue → repli lettré (évite un 404/broken image).
const NO_ICON = new Set(['gravity', 'monad-testnet', 'sepolia', 'memecore', 'base-sepolia', 'solana-devnet']);

/**
 * URL de l'icône d'un réseau (ou undefined → cercle lettré côté UI).
 *
 * D'abord le logo vectoriel embarqué ; à défaut, l'image distante ci-dessous.
 *
 * ⚠️ Les icônes DefiLlama sont servies en `image/webp` — que React Native `<Image>`
 * NE DÉCODE PAS sur iOS (et de façon inégale sur Android) → l'image échouait et on
 * retombait sur la lettre (« E » pour les L2 ETH). On les passe donc par le proxy
 * d'images `wsrv.nl` qui les convertit en **PNG** (rendu fiable partout), redimensionné.
 */
export function chainIconUrl(id: string): string | undefined {
  if (CHAIN_LOGO_SVG[id]) return CHAIN_LOGO_PREFIX + id;
  if (NO_ICON.has(id)) return undefined;
  const slug = SLUG_OVERRIDE[id] ?? id;
  const src = `icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&output=png&w=192&h=192&fit=cover`;
}
