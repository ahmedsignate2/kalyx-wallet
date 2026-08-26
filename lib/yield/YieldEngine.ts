/**
 * YieldEngine — The single entry point for all Stake / Unstake operations.
 *
 * The UI calls:
 *   yieldEngine.stake(adapterId, amount, address, unlock)
 *   yieldEngine.unstake(adapterId, amount, address, unlock)
 *
 * The engine:
 *   1. Resolves the right YieldAdapter by ID
 *   2. Gets a quote (stake or unstake)
 *   3. If EVM + quote.approvalAddress → sends approve tx first
 *   4. Signs and submits the transaction
 *   5. WAITS for on-chain confirmation (receipt.status / meta.err)
 *   6. Returns { hash, success, error? }
 *
 * No chain-specific if/else exists outside this file and the adapters.
 */

import { YieldAdapter, YieldQuote, YieldPosition } from './YieldAdapter';
import { LifiYieldAdapter, LifiYieldConfig } from './LifiYieldAdapter';
import { getAdapter, EvmChainAdapter, SolanaChainAdapter } from '../../src';
import { NATIVE_TOKEN } from '../../src';
import type { Unlock } from '../walletStore';

// ─── PROTOCOL REGISTRY ────────────────────────────────────────────
// Each entry creates one adapter instance. Adding a new protocol =
// adding one entry here. Zero changes in earn.tsx.

const PROTOCOL_CONFIGS: LifiYieldConfig[] = [
  {
    id: 'jito', protocol: 'Jito', symbol: 'JitoSOL',
    underlyingAsset: 'SOL', chainId: 'solana', lifiChainId: 1151111081099710,
    yieldTokenAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    underlyingAddress: '11111111111111111111111111111111', decimals: 9,
  },
  {
    id: 'benqi-staked-avax', protocol: 'Benqi', symbol: 'sAVAX',
    underlyingAsset: 'AVAX', chainId: 43114, lifiChainId: 43114,
    yieldTokenAddress: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE',
    underlyingAddress: NATIVE_TOKEN, decimals: 18,
  },
  {
    id: 'lido', protocol: 'Lido', symbol: 'stETH',
    underlyingAsset: 'ETH', chainId: 1, lifiChainId: 1,
    yieldTokenAddress: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    underlyingAddress: NATIVE_TOKEN, decimals: 18,
  },
  {
    id: 'rocket-pool', protocol: 'Rocket Pool', symbol: 'rETH',
    underlyingAsset: 'ETH', chainId: 1, lifiChainId: 1,
    yieldTokenAddress: '0xae78736cd615f374d3085123a210448e74fc6393',
    underlyingAddress: NATIVE_TOKEN, decimals: 18,
  },
  {
    id: 'binance-staked-eth', protocol: 'Binance Staked BNB', symbol: 'BNBx',
    underlyingAsset: 'BNB', chainId: 56, lifiChainId: 56,
    yieldTokenAddress: '0x1bdd3Cf7F79cfB8EdbB955f20ad99211551BA275',
    underlyingAddress: NATIVE_TOKEN, decimals: 18,
  },
];

// ─── ENGINE ───────────────────────────────────────────────────────

function resolveAdapterName(chainId: string | number): string {
  if (chainId === 'solana') return 'solana';
  const map: Record<number, string> = {
    1: 'ethereum', 43114: 'avalanche', 56: 'bnb', 8453: 'base',
    137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 11155111: 'sepolia',
  };
  return map[chainId as number] || String(chainId);
}

export interface ExecutionResult {
  hash: string;
  success: boolean;
  error?: string;
}

class YieldEngine {
  private adapters: Map<string, YieldAdapter> = new Map();

  constructor() {
    for (const cfg of PROTOCOL_CONFIGS) {
      this.adapters.set(cfg.id, new LifiYieldAdapter(cfg));
    }
  }

  /** Get all registered adapter IDs */
  getProtocolIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Get adapter by ID */
  getAdapter(id: string): YieldAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Detect all staked positions for a given wallet address */
  async detectAllPositions(evmAddress: string, solAddress?: string): Promise<YieldPosition[]> {
    const positions: YieldPosition[] = [];
    const promises = Array.from(this.adapters.values()).map(async (adapter) => {
      const address = adapter.chainId === 'solana' ? solAddress : evmAddress;
      if (!address) return;
      const pos = await adapter.detectPosition(address);
      if (pos) positions.push(pos);
    });
    await Promise.allSettled(promises);
    return positions;
  }

  /**
   * Execute a STAKE operation.
   * 1. Quote via the adapter
   * 2. Approve if needed (EVM ERC-20)
   * 3. Sign & submit
   * 4. Wait for on-chain confirmation
   * 5. Return result with verified success/failure
   */
  async stake(
    adapterId: string,
    amount: bigint,
    fromAddress: string,
    unlock: Unlock,
    walletStore: any,
  ): Promise<ExecutionResult> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error(`Protocole inconnu : ${adapterId}`);

    const quote = await adapter.quoteStake(amount, fromAddress);
    return this.executeQuote(quote, unlock, walletStore);
  }

  /**
   * Execute an UNSTAKE operation.
   * Same flow as stake but with inverted tokens.
   * Critical: for EVM, approve the yield token (sAVAX, stETH) first.
   */
  async unstake(
    adapterId: string,
    amount: bigint,
    fromAddress: string,
    unlock: Unlock,
    walletStore: any,
  ): Promise<ExecutionResult> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error(`Protocole inconnu : ${adapterId}`);

    const quote = await adapter.quoteUnstake(amount, fromAddress);
    return this.executeQuote(quote, unlock, walletStore);
  }

  /**
   * Core execution: handles approve → sign → submit → confirm.
   * This is the ONLY place where chain-specific tx logic lives.
   */
  private async executeQuote(
    quote: YieldQuote,
    unlock: Unlock,
    walletStore: any,
  ): Promise<ExecutionResult> {
    const isSolana = quote.chainId === 'solana';
    const chainName = resolveAdapterName(quote.chainId);

    if (isSolana) {
      return this.executeSolana(quote, unlock, walletStore);
    } else {
      return this.executeEvm(quote, chainName, unlock, walletStore);
    }
  }

  // ─── EVM EXECUTION (Ethereum, Avalanche, BNB, etc.) ────────────

  private async executeEvm(
    quote: YieldQuote,
    chainName: string,
    unlock: Unlock,
    walletStore: any,
  ): Promise<ExecutionResult> {
    const adapter = getAdapter(chainName) as EvmChainAdapter;

    // STEP 1: Approve if needed (this is what was missing for Benqi unstake)
    if (quote.approvalAddress && quote.fromToken !== NATIVE_TOKEN) {
      console.log(`[YieldEngine] Approving ${quote.fromToken} for ${quote.approvalAddress}`);
      const approveData = adapter.buildApproveData(quote.approvalAddress, quote.fromAmount);
      const approveTx = {
        type: 'evm' as const,
        to: quote.fromToken,
        data: approveData,
        value: 0n,
        chainId: (adapter as any).config.evmChainId || adapter.config.id,
      };
      const approveHash = await walletStore.sendRawTxOn(unlock, chainName, approveTx);
      // Wait for approve to confirm before proceeding
      try { await adapter.waitForTx(approveHash); } catch (e) {
        return { hash: approveHash, success: false, error: "L'approbation a échoué. Réessayez." };
      }
    }

    // STEP 2: Execute the swap transaction
    const txHash = await walletStore.sendRawTxOn(unlock, chainName, quote.tx);

    // STEP 3: Wait for on-chain confirmation
    // waitForTx() returns void — if it doesn't throw, tx is confirmed
    try {
      await adapter.waitForTx(txHash);
      return { hash: txHash, success: true };
    } catch (e: any) {
      // waitForTx threw — transaction reverted or timed out
      return { hash: txHash, success: false, error: e.message || 'Transaction échouée on-chain' };
    }
  }

  // ─── SOLANA EXECUTION ──────────────────────────────────────────

  private async executeSolana(
    quote: YieldQuote,
    unlock: Unlock,
    walletStore: any,
  ): Promise<ExecutionResult> {
    const solAdapter = getAdapter('solana') as SolanaChainAdapter;

    // STEP 1: Sign the transaction (LI.FI returns base64)
    const signedTxStr = await walletStore.signSolanaTransaction(
      unlock, (quote.tx as any).data, true
    );

    // STEP 2: ALWAYS simulate first (for BOTH stake and unstake)
    const sim = await (solAdapter as any).rpc('simulateTransaction', [
      signedTxStr, { encoding: 'base64' }
    ]);

    if (sim?.value?.err) {
      const logsStr = JSON.stringify(sim.value.logs || []);
      const errStr = JSON.stringify(sim.value.err);

      // Parse specific Solana errors into human-readable messages
      const lamportMatch = logsStr.match(/insufficient lamports (\d+), need (\d+)/);
      if (lamportMatch) {
        const missing = (Number(lamportMatch[2]) - Number(lamportMatch[1])) / 1e9;
        return {
          hash: '', success: false,
          error: `Solde insuffisant. Il manque ${missing.toFixed(6)} SOL.`,
        };
      }
      if (errStr.includes('InsufficientFundsForRent')) {
        return {
          hash: '', success: false,
          error: `Solde SOL insuffisant pour le Rent Exemption. Gardez au moins 0.003 SOL.`,
        };
      }

      console.error('[YieldEngine] Solana simulation failed:', sim.value.err);
      console.error('[YieldEngine] Logs:', logsStr);
      return {
        hash: '', success: false,
        error: `Simulation échouée: ${errStr.substring(0, 120)}`,
      };
    }

    // STEP 3: Submit the transaction
    const hash = await (solAdapter as any).rpc('sendTransaction', [
      signedTxStr, { encoding: 'base64' }
    ]);

    if (!hash) {
      return { hash: '', success: false, error: 'Transaction refusée par le RPC' };
    }

    // STEP 4: Wait and verify on-chain
    // Poll for confirmation (Solana doesn't have waitForTx like EVM)
    let confirmed = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await (solAdapter as any).rpc('getSignatureStatuses', [[hash]]);
        const result = status?.value?.[0];
        if (result) {
          if (result.err) {
            return {
              hash, success: false,
              error: `Transaction échouée on-chain: ${JSON.stringify(result.err)}`,
            };
          }
          if (result.confirmationStatus === 'confirmed' || result.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      } catch { /* retry */ }
    }

    return { hash, success: confirmed, error: confirmed ? undefined : 'Confirmation timeout (30s)' };
  }
}

// Singleton export
export const yieldEngine = new YieldEngine();
