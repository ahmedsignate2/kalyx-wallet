export interface YieldOpportunity {
  chainId: number | string;
  id: string;
  project: string;
  symbol: string;
  underlyingAsset: string;
  yieldTokenAddress: string; // ex: stETH address
  apy: number;
  type: string;
}

// A curated list of Yield Tokens supported by our wallet for LI.FI routing
const SUPPORTED_YIELDS = [
  { id: 'lido', project: 'Lido', symbol: 'stETH', underlyingAsset: 'ETH', yieldTokenAddress: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', type: 'Liquid Staking', chainId: 1 },
  { id: 'rocket-pool', project: 'Rocket Pool', symbol: 'rETH', underlyingAsset: 'ETH', yieldTokenAddress: '0xae78736cd615f374d3085123a210448e74fc6393', type: 'Liquid Staking', chainId: 1 },
  { id: 'aave-v3', project: 'Aave', symbol: 'aUSDC', underlyingAsset: 'USDC', yieldTokenAddress: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', type: 'Lending', chainId: 1 },
  { id: 'kamino', project: 'Kamino', symbol: 'kUSDC', underlyingAsset: 'USDC_SOL', yieldTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', type: 'Lending', chainId: 'solana' },
  { id: 'jito', project: 'Jito', symbol: 'JitoSOL', underlyingAsset: 'SOL', yieldTokenAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', type: 'Liquid Staking', chainId: 'solana' },
  { id: 'benqi-staked-avax', project: 'Benqi', symbol: 'sAVAX', underlyingAsset: 'AVAX', yieldTokenAddress: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE', type: 'Liquid Staking', chainId: 43114 },
  { id: 'binance-staked-eth', project: 'Binance Staked BNB', symbol: 'BNBx', underlyingAsset: 'BNB', yieldTokenAddress: '0x1bdd3Cf7F79cfB8EdbB955f20ad99211551BA275', type: 'Liquid Staking', chainId: 56 }, // Stader BNBx
  { id: 'stargate', project: 'Stargate', symbol: 'ETH', underlyingAsset: 'ETH_BASE', yieldTokenAddress: '0x0000000000000000000000000000000000000000', type: 'Lending', chainId: 8453 }, // Just an example for Base
] as const;

export async function fetchYieldOpportunities(): Promise<YieldOpportunity[]> {
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    const data = await res.json();
    
    const opportunities: YieldOpportunity[] = [];
    
    for (const supported of SUPPORTED_YIELDS) {
      // Find matching pool in DefiLlama
      const pool = data.data.find((p: any) => p.project === supported.id && (p.symbol.includes(supported.symbol) || p.symbol.includes(supported.underlyingAsset)));
      
      opportunities.push({
        ...supported,
        apy: pool ? pool.apy : (supported.id === 'lido' ? 3.2 : supported.id === 'aave-v3' ? 5.1 : 7.0), // fallback APY if not found
      });
    }
    
    return opportunities;
  } catch (e) {
    console.warn('[YieldService] DefiLlama fetch failed', e);
    return SUPPORTED_YIELDS.map(s => ({ ...s, apy: 3.5 })); // generic fallback
  }
}
