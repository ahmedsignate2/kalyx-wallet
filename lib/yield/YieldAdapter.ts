/**
 * YieldAdapter — Universal interface for every staking/lending protocol.
 * Each protocol implements this contract. The UI calls yieldEngine.stake() /
 * yieldEngine.unstake() and never touches chain-specific logic.
 */

export type YieldAction = 'STAKE' | 'UNSTAKE';

export interface YieldPosition {
  id: string;           // matches YieldOpportunity.id
  protocol: string;
  chainId: string | number;
  balance: bigint;
  decimals: number;
  symbol: string;       // e.g. 'JitoSOL', 'sAVAX'
  underlyingAsset: string; // e.g. 'SOL', 'AVAX'
}

export interface YieldQuote {
  action: YieldAction;
  fromToken: string;    // address
  toToken: string;      // address
  fromAmount: bigint;
  expectedOutput: bigint;
  gasEstimate: bigint;
  approvalAddress: string | null;  // if non-null, must approve before execute
  tx: any;              // raw transaction payload (EvmSwapTx | SolanaSwapTx)
  chainId: string | number;
}

export interface YieldAdapter {
  readonly id: string;
  readonly chainId: string | number;
  readonly type: 'liquid-staking' | 'lending';

  /** Detect if this address holds a staked/lent position for this protocol */
  detectPosition(address: string): Promise<YieldPosition | null>;

  /** Get a quote for staking (underlying → yield token) */
  quoteStake(amount: bigint, fromAddress: string): Promise<YieldQuote>;

  /** Get a quote for unstaking (yield token → underlying) */
  quoteUnstake(amount: bigint, fromAddress: string): Promise<YieldQuote>;
}
