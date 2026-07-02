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
import { deriveEvmAccount } from '../../crypto/hd';
import { normalizeEvmAddress } from '../validation/address';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';

// Limite de gas d'un transfert natif simple (pas d'appel de contrat).
const NATIVE_TRANSFER_GAS = 21_000n;

export class EvmChainAdapter implements ChainAdapter {
  readonly config: ChainConfig;
  private provider?: JsonRpcProvider;

  constructor(config: ChainConfig) {
    if (config.family !== 'evm' || config.evmChainId === undefined) {
      throw new Error(`Config non-EVM passée à EvmChainAdapter: ${config.id}`);
    }
    this.config = config;
  }

  private getProvider(): JsonRpcProvider {
    if (!this.provider) {
      const req = new FetchRequest(this.config.rpcUrls[0]);
      this.provider = new JsonRpcProvider(req, this.config.evmChainId, {
        staticNetwork: true,
      });
    }
    return this.provider;
  }

  deriveAccount(seed: Uint8Array, index = 0): Account {
    const { address, path } = deriveEvmAccount(seed, index);
    return { chain: this.config.id, address, index, path };
  }

  async getBalance(address: string): Promise<Balance> {
    const raw = await this.getProvider().getBalance(normalizeEvmAddress(address));
    return {
      raw,
      decimals: this.config.nativeDecimals,
      symbol: this.config.nativeSymbol,
    };
  }

  buildTransfer(params: TransferParams): TransferIntent {
    const to = normalizeEvmAddress(params.to);
    const { raw } = parseAmount(params.amount, this.config.nativeDecimals);
    return { to, value: raw, evmChainId: this.config.evmChainId! };
  }

  async prepareTransfer(from: string, params: TransferParams): Promise<UnsignedTx> {
    const intent = this.buildTransfer(params);
    const provider = this.getProvider();
    const sender = normalizeEvmAddress(from);

    const [nonce, fee] = await Promise.all([
      provider.getTransactionCount(sender, 'pending'),
      provider.getFeeData(),
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
    const res = await this.getProvider().broadcastTransaction(rawSignedTx);
    return res.hash ?? parsed.hash!;
  }
}
