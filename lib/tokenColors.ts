/**
 * Couleur de MARQUE d'un actif (par identifiant CoinGecko), pour teinter la
 * lumière de sa fiche : on reconnaît Solana à son violet, Bitcoin à son orange
 * avant même d'avoir lu le nom. Inconnu : null, la fiche garde la lumière
 * glacier par défaut — jamais de couleur inventée.
 */
const BRAND: Record<string, string> = {
  // Monnaies et grandes plateformes
  bitcoin: '#F7931A', ethereum: '#627EEA', solana: '#9945FF', 'the-open-network': '#0098EA', binancecoin: '#F3BA2F',
  ripple: '#3B82F6', cardano: '#0033AD', dogecoin: '#C2A633', 'avalanche-2': '#E84142', tron: '#FF060A',
  polkadot: '#E6007A', litecoin: '#345D9D', 'bitcoin-cash': '#8DC351', stellar: '#7D00FF', monero: '#FF6600',
  'ethereum-classic': '#3AB83A', cosmos: '#6F7390', near: '#00C08B', aptos: '#2DD8A3', sui: '#4DA2FF',
  'internet-computer': '#29ABE2', 'hedera-hashgraph': '#8259EF', algorand: '#00C2A8', tezos: '#2C7DF7',
  'matic-network': '#8247E5', 'polygon-ecosystem-token': '#8247E5', arbitrum: '#28A0F0', optimism: '#FF0420',
  mantle: '#65B3AE', 'immutable-x': '#17B5CB', starknet: '#EC796B', celestia: '#7B2BF9', 'injective-protocol': '#00F2FE',
  sei: '#9E1F19', kaspa: '#70C7BA', 'fetch-ai': '#1D2D5C', 'render-token': '#E62C2C', filecoin: '#0090FF',
  'hyperliquid': '#97FCE4', berachain: '#814625', 'flare-networks': '#E62058', fantom: '#1969FF', sonic: '#FE9A4C',
  kava: '#FF564F', celo: '#FCFF52', 'crypto-com-chain': '#1199FA', okb: '#2D60E0', 'leo-token': '#F5A623',
  // Stables
  tether: '#26A17B', 'usd-coin': '#2775CA', dai: '#F5AC37', 'ethena-usde': '#9D9D9D', 'first-digital-usd': '#24D8A6',
  'paypal-usd': '#0070E0', frax: '#5F5F5F', 'true-usd': '#1A5AFF', 'gemini-dollar': '#00DCFA', euro: '#003399',
  // DeFi
  uniswap: '#FF007A', chainlink: '#2A5ADA', aave: '#B6509E', maker: '#1AAB9B', 'lido-dao': '#00A3FF',
  'curve-dao-token': '#40649F', 'compound-governance-token': '#00D395', 'havven': '#00D1FF', sushi: '#FA52A0',
  '1inch': '#94A6C3', 'pancakeswap-token': '#D1884F', 'jupiter-exchange-solana': '#C7F284', raydium: '#C200FB',
  'thorchain': '#33FF99', 'gmx': '#2D42FC', 'pendle': '#1BE3C2', 'ethena': '#7B7B7B', 'ondo-finance': '#4A6BF6',
  'rocket-pool': '#F98D69', 'frax-share': '#000000', 'yearn-finance': '#006AE3', balancer: '#1E1E1E',
  'the-graph': '#6747ED', 'ens': '#5298FF', 'worldcoin-wld': '#7F7F7F', 'blur': '#FF6600', 'dydx-chain': '#6966FF',
  // Jetons emballés et dérivés
  'wrapped-bitcoin': '#F09242', 'coinbase-wrapped-btc': '#0052FF', 'staked-ether': '#00A3FF', 'wrapped-steth': '#00A3FF',
  weth: '#627EEA', 'rocket-pool-eth': '#F98D69', 'jito-staked-sol': '#6CB79B', 'msol': '#C94DFF', 'wrapped-solana': '#9945FF',
  // Mèmes et culture
  'shiba-inu': '#FFA409', pepe: '#3D8130', bonk: '#F8A71D', dogwifcoin: '#B88A6B', floki: '#F2A900',
  'popcat': '#F4A261', 'brett': '#0052FF', 'mog-coin': '#FFFFFF', 'book-of-meme': '#3BAA6F', 'notcoin': '#FEE33A',
  'dogs-2': '#F2F2F2', catizen: '#F8C34B', 'hamster-kombat': '#F4B740',
  // Jeux, IA, divers
  'the-sandbox': '#00ADEF', decentraland: '#FF2D55', 'axie-infinity': '#0055D5', apecoin: '#0054F9', gala: '#1A1A1A',
  'bittensor': '#7A7A7A', 'singularitynet': '#6916FF', 'ocean-protocol': '#7B1173', 'theta-token': '#2AB8E6',
  'chiliz': '#CD0124', 'basic-attention-token': '#FF5000', 'trust-wallet-token': '#3375BB', 'pyth-network': '#7142CF',
  'wormhole': '#7A7A7A', 'layerzero': '#9A9A9A', 'zksync': '#8C8DFC', 'blast': '#FCFC03', 'scroll': '#EBC28E',
};

export function tokenBrandColor(coingeckoId: string | undefined | null): string | null {
  const c = coingeckoId ? BRAND[coingeckoId] : undefined;
  // Une marque noire, blanche ou grise ne teinte rien : on la laisse au calcul.
  if (!c) return null;
  const rgb = hexToRgbLoose(c);
  return rgb && isColorfulLoose(rgb) ? c : null;
}

/**
 * Couleur PROPRE à un jeton inconnu, stable (même jeton → même couleur) :
 * teinte tirée de son identifiant, saturation et luminosité fixes. Sans elle,
 * tous les jetons d'Ethereum hors liste prenaient le bleu d'Ethereum.
 */
export function stableTokenColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return hslToHex(h % 360, 0.68, 0.56);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// Versions hissées (déclarations de fonction) des aides plus bas, utilisables ici.
function hexToRgbLoose(hex: string): [number, number, number] | null {
  let x = hex.replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(x) ? [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)] : null;
}
function isColorfulLoose([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return sat > 0.3 && l > 0.15 && l < 0.88;
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
  return tokenBrandColor(coingeckoId) ?? (coingeckoId ? stableTokenColor(coingeckoId) : chainBrandColor(chainId, logos));
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

/** Teinte d'un jeton de swap : sa marque, sinon sa couleur stable (jamais celle du réseau pour tous). */
export function swapTokenTint(symbol: string | undefined, chainId: string | undefined, logos: Readonly<Record<string, string>>): string | null {
  if (!symbol) return chainBrandColor(chainId, logos);
  return SYMBOL_BRAND[symbol.toUpperCase()] ?? stableTokenColor(symbol.toUpperCase());
}
