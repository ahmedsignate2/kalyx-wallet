/**
 * Adapter EVM (Ethereum / BNB Chain / Polygon / testnets).
 *
 * Un seul adapter paramétré par la ChainConfig couvre tous les réseaux EVM.
 * Les opérations hors-ligne (dérivation, construction, signature) sont
 * déterministes et testées ; les opérations réseau (solde, frais, broadcast)
 * passent par un JsonRpcProvider ethers.
 */
import {
  JsonRpcProvider,
  Wallet,
  Transaction,
  FetchRequest,
  Interface,
} from 'ethers';
import type {
  Account,
  Balance,
  ChainAdapter,
  ChainConfig,
  TransferIntent,
  TransferParams,
  UnsignedTx,
} from './types';
import type { TxSummary } from './types';
import { deriveEvmAccount } from '../../crypto/hd';
import { normalizeEvmAddress } from '../validation/address';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout } from './net';
import { parseTxList } from './etherscan';
import { ETHERSCAN_V2_API, EXPLORER_API_KEY } from './configs';

// Limite de gas d'un transfert natif simple (pas d'appel de contrat).
const NATIVE_TRANSFER_GAS = 21_000n;

// Délai max par RPC avant de passer au suivant.
const RPC_TIMEOUT_MS = 8_000;

export class EvmChainAdapter implements ChainAdapter {
  readonly config: ChainConfig;
  private providers?: JsonRpcProvider[];

  constructor(config: ChainConfig) {
    if (config.family !== 'evm' || config.evmChainId === undefined) {
      throw new Error(`Config non-EVM passée à EvmChainAdapter: ${config.id}`);
    }
    this.config = config;
  }

  /** Un provider par URL RPC (créés une fois). */
  private getProviders(): JsonRpcProvider[] {
    if (!this.providers) {
      this.providers = this.config.rpcUrls.map((url) => {
        const req = new FetchRequest(url);
        req.timeout = RPC_TIMEOUT_MS;
        return new JsonRpcProvider(req, this.config.evmChainId, { staticNetwork: true });
      });
    }
    return this.providers;
  }

  /** Exécute `op` en essayant chaque RPC dans l'ordre (timeout + fallback). */
  private call<T>(op: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    return tryInOrder(this.getProviders(), op, { timeoutMs: RPC_TIMEOUT_MS });
  }

  deriveAccount(seed: Uint8Array, index = 0): Account {
    const { address, path } = deriveEvmAccount(seed, index);
    return { chain: this.config.id, address, index, path };
  }

  async getBalance(address: string): Promise<Balance> {
    const addr = normalizeEvmAddress(address);
    const raw = await this.call((p) => p.getBalance(addr));
    return {
      raw,
      decimals: this.config.nativeDecimals,
      symbol: this.config.nativeSymbol,
    };
  }

  async getHistory(address: string): Promise<TxSummary[]> {
    const owner = normalizeEvmAddress(address);
    try {
      const url =
        `${ETHERSCAN_V2_API}?chainid=${this.config.evmChainId}` +
        `&module=account&action=txlist&address=${owner}` +
        `&startblock=0&endblock=99999999&page=1&offset=25&sort=desc` +
        (EXPLORER_API_KEY ? `&apikey=${EXPLORER_API_KEY}` : '');
      const res = await withTimeout(fetch(url), RPC_TIMEOUT_MS, () => new Error('timeout'));
      return parseTxList(await res.json(), owner);
    } catch {
      // Historique = confort : ne jamais bloquer ni faire échouer l'app.
      return [];
    }
  }

  buildTransfer(params: TransferParams): TransferIntent {
    const to = normalizeEvmAddress(params.to);
    const { raw } = parseAmount(params.amount, this.config.nativeDecimals);
    return { to, value: raw, evmChainId: this.config.evmChainId! };
  }

  async prepareTransfer(from: string, params: TransferParams): Promise<UnsignedTx> {
    const intent = this.buildTransfer(params);
    const sender = normalizeEvmAddress(from);

    const [nonce, fee] = await Promise.all([
      this.call((p) => p.getTransactionCount(sender, 'pending')),
      this.call((p) => p.getFeeData()),
    ]);

    if (fee.maxFeePerGas == null || fee.maxPriorityFeePerGas == null) {
      throw new WalletError('INVALID_AMOUNT', 'Frais réseau indisponibles (EIP-1559)');
    }

    return {
      ...intent,
      nonce,
      gasLimit: NATIVE_TRANSFER_GAS,
      maxFeePerGas: fee.maxFeePerGas,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
    };
  }

  async signTransaction(tx: UnsignedTx, privateKey: string): Promise<string> {
    // Signature 100 % hors-ligne : aucun provider requis.
    const wallet = new Wallet(privateKey);
    return wallet.signTransaction({
      type: 2, // EIP-1559
      to: tx.to,
      value: tx.value,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      chainId: tx.evmChainId,
    });
  }

  async broadcast(rawSignedTx: string): Promise<string> {
    const parsed = Transaction.from(rawSignedTx);
    const res = await this.call((p) => p.broadcastTransaction(rawSignedTx));
    return res.hash ?? parsed.hash!;
  }

  // --- Support des transactions de contrat (swap/approbation ERC-20) ---

  /** Allowance ERC-20 (combien `spender` peut dépenser des tokens de `owner`). */
  async getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
    const data = ERC20.encodeFunctionData('allowance', [owner, spender]);
    const result = await this.call((p) => p.call({ to: token, data }));
    try {
      return BigInt(result);
    } catch {
      return 0n;
    }
  }

  /** Data d'un `approve(spender, amount)` ERC-20. */
  buildApproveData(spender: string, amount: bigint): string {
    return ERC20.encodeFunctionData('approve', [spender, amount]);
  }

  /**
   * Signe et diffuse une transaction quelconque (vers un contrat, avec data).
   * Utilisée pour l'approbation et le swap LI.FI. Remplit nonce/gaz au besoin.
   */
  async sendContractTx(req: RawTxRequest, from: string, privateKey: string): Promise<string> {
    const wallet = new Wallet(privateKey);
    const needFee = !req.gasPrice && !req.maxFeePerGas;
    const [nonce, feeData] = await Promise.all([
      this.call((p) => p.getTransactionCount(from, 'pending')),
      needFee ? this.call((p) => p.getFeeData()) : Promise.resolve(null),
    ]);

    let gasLimit = req.gasLimit;
    if (!gasLimit) {
      const est = await this.call((p) =>
        p.estimateGas({ from, to: req.to, data: req.data ?? '0x', value: req.value ?? 0n }),
      );
      gasLimit = (est * 12n) / 10n; // +20 % de marge
    }

    const common = {
      to: req.to,
      data: req.data ?? '0x',
      value: req.value ?? 0n,
      nonce,
      gasLimit,
      chainId: req.chainId,
    };

    let txReq;
    if (req.gasPrice) {
      txReq = { ...common, type: 0 as const, gasPrice: req.gasPrice };
    } else if (req.maxFeePerGas) {
      txReq = {
        ...common,
        type: 2 as const,
        maxFeePerGas: req.maxFeePerGas,
        maxPriorityFeePerGas: req.maxPriorityFeePerGas ?? req.maxFeePerGas,
      };
    } else if (feeData?.maxFeePerGas) {
      txReq = {
        ...common,
        type: 2 as const,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? feeData.maxFeePerGas,
      };
    } else {
      txReq = { ...common, type: 0 as const, gasPrice: feeData?.gasPrice ?? 0n };
    }

    const raw = await wallet.signTransaction(txReq);
    const res = await this.call((p) => p.broadcastTransaction(raw));
    return res.hash;
  }

  /** Attend la confirmation d'une transaction (1 bloc). */
  async waitForTx(hash: string): Promise<void> {
    await this.call((p) => p.waitForTransaction(hash, 1, 120_000));
  }
}

export interface RawTxRequest {
  to: string;
  data?: string;
  value?: bigint;
  chainId: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

const ERC20 = new Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
