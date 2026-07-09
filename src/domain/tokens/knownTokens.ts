/**
 * Tokens « blue-chip » par réseau (evmChainId), interrogés EXPLICITEMENT en plus
 * de l'énumération Alchemy.
 *
 * Pourquoi : `alchemy_getTokenBalances(addr, 'erc20')` n'énumère PAS de façon
 * fiable tous les tokens détenus — un solde USDC bien réel peut être absent de la
 * liste (vérifié en live sur Base). Résultat : l'utilisateur ne voit pas son USDC.
 * En interrogeant ces contrats connus par adresse explicite, on garantit que les
 * stablecoins / wrapped majeurs apparaissent toujours s'ils sont détenus.
 *
 * Adresses vérifiées via alchemy_getTokenMetadata (symbole + décimales) le 2026-07-09.
 * Ajouter un token = ajouter son adresse ici (l'affichage prend le solde on-chain
 * réel et les métadonnées authoritatives, donc une adresse erronée = simplement
 * non détectée, jamais un faux solde).
 */
export const KNOWN_ERC20_BY_CHAIN: Record<number, string[]> = {
  // Ethereum
  1: [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
  ],
  // Optimism
  10: [
    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC
    '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT
    '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // DAI
    '0x4200000000000000000000000000000000000006', // WETH
    '0x4200000000000000000000000000000000000042', // OP
  ],
  // Polygon
  137: [
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
    '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  ],
  // Base
  8453: [
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDbC
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
    '0x4200000000000000000000000000000000000006', // WETH
    '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // cbBTC
  ],
  // Arbitrum One
  42161: [
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
    '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // DAI
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
  ],
};

/** Contrats connus pour un evmChainId (liste vide si réseau non couvert). */
export function knownTokensFor(evmChainId?: number): string[] {
  return (evmChainId != null && KNOWN_ERC20_BY_CHAIN[evmChainId]) || [];
}
