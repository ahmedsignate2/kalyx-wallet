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
