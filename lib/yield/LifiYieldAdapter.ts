/**
 * LifiYieldAdapter — Concrete adapter for liquid staking protocols
 * routed through LI.FI (Jito, Benqi, Lido, Rocket Pool, Stader BNBx).
 *
 * Architecture rule: ONE adapter instance per protocol. No if/else on
 * chain names anywhere. The adapter carries its own chainId, token
 * addresses, and decimals. The YieldEngine just calls adapter.quoteStake()
 * or adapter.quoteUnstake() — it never needs to know which chain it is.
 */

import { YieldAdapter, YieldPosition, YieldQuote } from './YieldAdapter';
import { getLifiQuote, NATIVE_TOKEN } from '../../src';
import { getAdapter, EvmChainAdapter, SolanaChainAdapter } from '../../src';
import { formatBalance } from '../../src/domain/validation/amount';

export interface LifiYieldConfig {
  id: string;
  protocol: string;
  symbol: string;               // yield token symbol (JitoSOL, sAVAX, stETH...)
  underlyingAsset: string;      // underlying symbol (SOL, AVAX, ETH...)
  chainId: string | number;     // Nova chain ID (e.g. 'solana', 43114, 1)
  lifiChainId: number;          // LI.FI chain ID (e.g. 1151111081099710 for Solana)
  yieldTokenAddress: string;    // on-chain address of yield token
  underlyingAddress: string;    // on-chain address of underlying (NATIVE_TOKEN for natives)
  decimals: number;
}

/**
 * Maps a Nova chainId to the internal adapter name used by getAdapter().
 * This is the SINGLE source of truth — used nowhere else.
 */
function resolveAdapterName(chainId: string | number): string {
  if (chainId === 'solana') return 'solana';
  const map: Record<number, string> = {
    1: 'ethereum', 43114: 'avalanche', 56: 'bnb', 8453: 'base',
    137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 11155111: 'sepolia',
  };
  return map[chainId as number] || String(chainId);
}

export class LifiYieldAdapter implements YieldAdapter {
  readonly id: string;
  readonly chainId: string | number;
  readonly type = 'liquid-staking' as const;
  private readonly config: LifiYieldConfig;

  constructor(config: LifiYieldConfig) {
    this.config = config;
    this.id = config.id;
    this.chainId = config.chainId;
  }

  private get isSolana(): boolean {
    return this.config.chainId === 'solana';
  }

  private get adapterName(): string {
    return resolveAdapterName(this.config.chainId);
  }

  async detectPosition(address: string): Promise<YieldPosition | null> {
    try {
      let bal = 0n;
      let symbol = this.config.symbol;
      let decimals = this.config.decimals;

      if (this.isSolana) {
        const solAdapter = getAdapter('solana') as SolanaChainAdapter;
        const splTokens = await solAdapter.getSplTokens(address).catch(() => []);
        const t = splTokens.find((t: any) => t.mint === this.config.yieldTokenAddress);
        if (t) {
          bal = t.raw;
          decimals = t.decimals || decimals;
          symbol = t.symbol || symbol;
        }
      } else {
        const adapter = getAdapter(this.adapterName) as EvmChainAdapter;
        bal = await adapter.getTokenBalance(this.config.yieldTokenAddress, address).catch(() => 0n);
      }

      if (bal <= 0n) return null;

      return {
        id: this.id,
        protocol: this.config.protocol,
        chainId: this.config.chainId,
        balance: bal,
        decimals,
        symbol,
        underlyingAsset: this.config.underlyingAsset,
      };
    } catch {
      return null;
    }
  }

  async quoteStake(amount: bigint, fromAddress: string): Promise<YieldQuote> {
    const quote = await getLifiQuote({
      fromChainId: this.config.lifiChainId,
      toChainId: this.config.lifiChainId,
      fromToken: this.config.underlyingAddress,
      toToken: this.config.yieldTokenAddress,
      fromAmount: amount,
      fromAddress,
      isEarn: true, // 0% fee for staking
    });

    if (!quote) throw new Error(`Aucune route trouvée pour staker sur ${this.config.protocol}`);

    return {
      action: 'STAKE',
      fromToken: this.config.underlyingAddress,
      toToken: this.config.yieldTokenAddress,
      fromAmount: amount,
      expectedOutput: quote.toAmount,
      gasEstimate: quote.gasCostNative,
      approvalAddress: quote.approvalAddress,
      tx: quote.tx,
      chainId: this.config.chainId,
    };
  }

  async quoteUnstake(amount: bigint, fromAddress: string): Promise<YieldQuote> {
    const quote = await getLifiQuote({
      fromChainId: this.config.lifiChainId,
      toChainId: this.config.lifiChainId,
      fromToken: this.config.yieldTokenAddress,    // FROM yield token
      toToken: this.config.underlyingAddress,       // TO underlying
      fromAmount: amount,
      fromAddress,
      isEarn: false, // 0.3% fee for unstake (it's a swap)
    });

    if (!quote) throw new Error(`Aucune route trouvée pour retirer de ${this.config.protocol}`);

    return {
      action: 'UNSTAKE',
      fromToken: this.config.yieldTokenAddress,
      toToken: this.config.underlyingAddress,
      fromAmount: amount,
      expectedOutput: quote.toAmount,
      gasEstimate: quote.gasCostNative,
      approvalAddress: quote.approvalAddress,
      tx: quote.tx,
      chainId: this.config.chainId,
    };
  }
}
