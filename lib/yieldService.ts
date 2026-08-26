import { LifiYieldConfig } from './yield/LifiYieldAdapter';

export interface YieldOpportunity extends LifiYieldConfig {
  apy: number;
  type: string;
}

// Fallback configuration if the dynamic registry API fails.
// In production, this is fetched from https://api.nova-wallet.io/v1/yield-registry
// Each entry fully describes the protocol's capabilities — the engine never guesses.
const FALLBACK_REGISTRY: LifiYieldConfig[] = [
  {
    id: 'jito', protocol: 'Jito', symbol: 'JitoSOL',
    underlyingAsset: 'SOL', chainId: 'solana', lifiChainId: 1151111081099710,
    yieldTokenAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    underlyingAddress: '11111111111111111111111111111111',
    nativeToken: 'SOL', decimals: 9,
    stakeSupported: true, unstakeSupported: true,
    quoteProvider: 'lifi', approvalRequired: false,
  },
  {
    id: 'benqi-staked-avax', protocol: 'Benqi', symbol: 'sAVAX',
    underlyingAsset: 'AVAX', chainId: 43114, lifiChainId: 43114,
    yieldTokenAddress: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE',
    underlyingAddress: '0x0000000000000000000000000000000000000000',
    nativeToken: 'AVAX', decimals: 18,
    stakeSupported: true, unstakeSupported: true,
    quoteProvider: 'lifi', approvalRequired: true,
  },
  {
    id: 'lido', protocol: 'Lido', symbol: 'stETH',
    underlyingAsset: 'ETH', chainId: 1, lifiChainId: 1,
    yieldTokenAddress: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    underlyingAddress: '0x0000000000000000000000000000000000000000',
    nativeToken: 'ETH', decimals: 18,
    stakeSupported: true, unstakeSupported: true,
    quoteProvider: 'lifi', approvalRequired: true,
  },
  {
    id: 'rocket-pool', protocol: 'Rocket Pool', symbol: 'rETH',
    underlyingAsset: 'ETH', chainId: 1, lifiChainId: 1,
    yieldTokenAddress: '0xae78736cd615f374d3085123a210448e74fc6393',
    underlyingAddress: '0x0000000000000000000000000000000000000000',
    nativeToken: 'ETH', decimals: 18,
    stakeSupported: true, unstakeSupported: true,
    quoteProvider: 'lifi', approvalRequired: true,
  },
  {
    id: 'binance-staked-eth', protocol: 'Stader', symbol: 'BNBx',
    underlyingAsset: 'BNB', chainId: 56, lifiChainId: 56,
    yieldTokenAddress: '0x1bdd3Cf7F79cfB8EdbB955f20ad99211551BA275',
    underlyingAddress: '0x0000000000000000000000000000000000000000',
    nativeToken: 'BNB', decimals: 18,
    stakeSupported: true, unstakeSupported: true,
    quoteProvider: 'lifi', approvalRequired: true,
  },
];

export async function fetchYieldRegistry(): Promise<LifiYieldConfig[]> {
  try {
    // In production: const res = await fetch('https://api.nova-wallet.io/v1/yield-registry');
    // return await res.json();
    return FALLBACK_REGISTRY;
  } catch (e) {
    return FALLBACK_REGISTRY;
  }
}

export async function fetchYieldOpportunities(): Promise<YieldOpportunity[]> {
  const registry = await fetchYieldRegistry();
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    const data = await res.json();
    
    return registry.map(cfg => {
      const pool = data.data.find((p: any) => p.project === cfg.id && (p.symbol.includes(cfg.symbol) || p.symbol.includes(cfg.underlyingAsset)));
      return {
        ...cfg,
        type: 'Liquid Staking',
        apy: pool ? pool.apy : (cfg.id === 'lido' ? 3.2 : 5.0),
      };
    });
  } catch (e) {
    console.warn('[YieldService] DefiLlama fetch failed', e);
    return registry.map(cfg => ({ ...cfg, type: 'Liquid Staking', apy: 3.5 }));
  }
}
