/**
 * Adapter Solana (mainnet-beta, adresses base58 ed25519).
 *
 * PÉRIMÈTRE ACTUEL : réception — dérivation d'adresse, validation, solde.
 * L'ENVOI passe par `sendSolana` (modèle de compte + transaction ed25519 propre
 * à Solana, très différent d'EVM) ; les méthodes génériques EVM lèvent
 * NOT_SUPPORTED. L'historique n'est pas encore branché (retourne []).
 */
import type {
  Account,
  Balance,
  ChainAdapter,
  ChainConfig,
  TransferIntent,
  TransferParams,
  TxSummary,
  UnsignedTx,
} from './types';
import { deriveSolanaAccount, isValidSolanaAddress } from '../../crypto/solana';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout } from './net';

const API_TIMEOUT_MS = 12_000;

export class SolanaChainAdapter implements ChainAdapter {
  readonly config: ChainConfig;

  constructor(config: ChainConfig) {
    if (config.family !== 'solana') {
      throw new Error(`Config non-Solana passée à SolanaChainAdapter: ${config.id}`);
    }
    this.config = config;
  }

  deriveAccount(seed: Uint8Array, index = 0): Account {
    const { address, path } = deriveSolanaAccount(seed, index);
    return { chain: this.config.id, address, index, path };
  }

  /** Appel JSON-RPC Solana avec timeout + repli sur les RPC de secours. */
  async rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    return tryInOrder(
      this.config.rpcUrls,
      async (base) => {
        const res = await withTimeout(
          fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
          API_TIMEOUT_MS,
          () => new Error('timeout'),
        );
        const json = (await res.json()) as { result?: T; error?: { message?: string } };
        if (json.error) throw new WalletError('RPC_UNAVAILABLE', json.error.message ?? 'Erreur RPC Solana');
        return json.result as T;
      },
      { timeoutMs: API_TIMEOUT_MS },
    );
  }

  async getBalance(address: string): Promise<Balance> {
    if (!isValidSolanaAddress(address)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse Solana invalide');
    }
    const result = await this.rpc<{ value?: number }>('getBalance', [address]);
    return {
      raw: BigInt(result?.value ?? 0), // lamports (1 SOL = 1e9 lamports)
      decimals: this.config.nativeDecimals,
      symbol: this.config.nativeSymbol,
    };
  }

  async getHistory(): Promise<TxSummary[]> {
    // Réception seulement pour l'instant : historique Solana branché plus tard.
    return [];
  }

  /** Validation HORS-LIGNE d'un envoi SOL : adresse base58 valide + montant > 0. */
  buildTransfer(params: TransferParams): TransferIntent {
    if (!isValidSolanaAddress(params.to)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse Solana invalide');
    }
    const value = parseAmount(params.amount, this.config.nativeDecimals).raw;
    if (value <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');
    return { to: params.to, value, evmChainId: 0 };
  }

  // Envoi Solana = `sendSolana` (appelé par walletStore selon la famille).
  async prepareTransfer(): Promise<UnsignedTx> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendSolana pour l’envoi Solana');
  }
  async signTransaction(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendSolana pour l’envoi Solana');
  }
  async broadcast(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendSolana pour l’envoi Solana');
  }
}
