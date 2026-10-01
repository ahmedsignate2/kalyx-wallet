/**
 * Couleur de MARQUE d'un actif (par identifiant CoinGecko), pour teinter la
 * lumière de sa fiche : on reconnaît Solana à son violet, Bitcoin à son orange
 * avant même d'avoir lu le nom. Inconnu : null, la fiche garde la lumière
 * glacier par défaut — jamais de couleur inventée.
 */
const BRAND: Record<string, string> = {
  bitcoin: '#F7931A',
  ethereum: '#627EEA',
  solana: '#9945FF',
  'the-open-network': '#0098EA',
  binancecoin: '#F3BA2F',
  'usd-coin': '#2775CA',
  tether: '#26A17B',
  ripple: '#23292F',
  cardano: '#0033AD',
  dogecoin: '#C2A633',
  'avalanche-2': '#E84142',
  'matic-network': '#8247E5',
  'polygon-ecosystem-token': '#8247E5',
  tron: '#FF060A',
  chainlink: '#2A5ADA',
  polkadot: '#E6007A',
  litecoin: '#345D9D',
  'shiba-inu': '#FFA409',
  uniswap: '#FF007A',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  near: '#00C08B',
  aptos: '#2DD8A3',
  sui: '#4DA2FF',
  pepe: '#3D8130',
  dai: '#F5AC37',
  'wrapped-bitcoin': '#F09242',
  'staked-ether': '#00A3FF',
};

export function tokenBrandColor(coingeckoId: string | undefined | null): string | null {
  return (coingeckoId && BRAND[coingeckoId]) || null;
}

/**
 * Couleur d'un RÉSEAU, lue dans son propre logo embarqué : la teinte saturée
 * la plus présente (le bleu de Base, le rouge d'Optimism, le jaune de BNB…).
 * Couvre d'office les soixante réseaux, et ceux qu'on ajoutera — sans table à
 * tenir à jour. Gris, blancs et noirs sont ignorés : ils ne disent rien.
 */
const chainCache = new Map<string, string | null>();

/**
 * Corrections : logos monochromes (aucune teinte à lire) ou dont la teinte la
 * plus présente n'est pas celle de la marque (Arbitrum : le bleu nuit du fond
 * l'emporte sur son bleu ciel).
 */
const CHAIN_OVERRIDE: Record<string, string> = {
  ethereum: '#627EEA',
  sepolia: '#627EEA',
  arbitrum: '#28A0F0',
  base: '#0052FF',
  'base-sepolia': '#0052FF',
  solana: '#9945FF',
  'solana-devnet': '#9945FF',
  linea: '#61DFFF',
  zksync: '#8C8DFC',
  scroll: '#EBC28E',
  gnosis: '#3E9E7E',
  cronos: '#1199FA',
  zetachain: '#00A86B',
  boba: '#CBFF00',
  abstract: '#00DE73',
  lisk: '#4070F4',
  swell: '#4B65F2',
};

/** Réseau d'origine des grandes pièces natives : ailleurs, c'est la couleur du réseau qui parle. */
const HOME_CHAIN: Record<string, string> = { ethereum: 'ethereum', bitcoin: 'bitcoin', solana: 'solana', 'the-open-network': 'ton', binancecoin: 'bnb' };

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Saturation et luminosité (0-1) : on garde les vraies couleurs. */
function isColorful([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return s > 0.35 && l > 0.18 && l < 0.85;
}

export function dominantSvgColor(svg: string): string | null {
  const counts = new Map<string, number>();
  for (const m of svg.matchAll(/(?:fill|stop-color|stroke)\s*[=:]\s*["']?(#[0-9a-fA-F]{3,6})\b/g)) {
    const rgb = hexToRgb(m[1]);
    if (!rgb || !isColorful(rgb)) continue;
    const key = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

export function chainBrandColor(chainId: string | undefined | null, logos: Readonly<Record<string, string>>): string | null {
  if (!chainId) return null;
  if (CHAIN_OVERRIDE[chainId]) return CHAIN_OVERRIDE[chainId];
  if (!chainCache.has(chainId)) chainCache.set(chainId, logos[chainId] ? dominantSvgColor(logos[chainId]) : null);
  return chainCache.get(chainId) ?? null;
}

/**
 * Teinte de la fiche d'un actif.
 *  - Une pièce native HORS de son réseau d'origine (ETH sur Base, sur
 *    Arbitrum…) prend la couleur du réseau : c'est lui qui la distingue.
 *  - Sinon la couleur de l'actif (USDC bleu, même sur Polygon).
 *  - Actif inconnu : la couleur du réseau, à défaut rien.
 */
export function tokenTint(coingeckoId: string | undefined | null, chainId: string | undefined | null, logos: Readonly<Record<string, string>>): string | null {
  const home = coingeckoId ? HOME_CHAIN[coingeckoId] : undefined;
  if (home && chainId && chainId !== home) return chainBrandColor(chainId, logos) ?? tokenBrandColor(coingeckoId);
  return tokenBrandColor(coingeckoId) ?? chainBrandColor(chainId, logos);
}

/** `#RRGGBB` + opacité → `rgba(…)`. Couleur illisible : rendue telle quelle. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex;
}

/** Mélange opaque de deux couleurs `#RRGGBB` (t = part de `b`). */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Couleur de marque par SYMBOLE (listes de swap : pas d'identifiant CoinGecko). */
const SYMBOL_BRAND: Record<string, string> = {
  ETH: '#627EEA', WETH: '#627EEA', STETH: '#00A3FF', WSTETH: '#00A3FF',
  BTC: '#F7931A', WBTC: '#F7931A', CBBTC: '#F7931A', TBTC: '#F7931A',
  USDC: '#2775CA', 'USDC.E': '#2775CA', USDT: '#26A17B', 'USD₮': '#26A17B', USDT0: '#26A17B', DAI: '#F5AC37', USDE: '#4C4C4C',
  SOL: '#9945FF', WSOL: '#9945FF', JUP: '#C7F284', BONK: '#F8A71D',
  TON: '#0098EA', BNB: '#F3BA2F', WBNB: '#F3BA2F', POL: '#8247E5', MATIC: '#8247E5',
  AVAX: '#E84142', WAVAX: '#E84142', ARB: '#28A0F0', OP: '#FF0420', LINK: '#2A5ADA',
  UNI: '#FF007A', AAVE: '#B6509E', PEPE: '#3D8130', SHIB: '#FFA409', DOGE: '#C2A633',
};

/** Teinte d'un jeton de swap : son symbole, sinon le réseau. */
export function swapTokenTint(symbol: string | undefined, chainId: string | undefined, logos: Readonly<Record<string, string>>): string | null {
  return (symbol && SYMBOL_BRAND[symbol.toUpperCase()]) || chainBrandColor(chainId, logos);
}
