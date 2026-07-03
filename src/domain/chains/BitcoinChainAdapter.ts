/**
 * Adapter Bitcoin (mainnet, SegWit natif bc1...).
 *
 * PÉRIMÈTRE ACTUEL : réception uniquement — dérivation d'adresse, validation,
 * solde, historique. L'ENVOI n'est PAS encore supporté (Bitcoin est un modèle
 * UTXO, très différent des comptes EVM : il mérite son propre chantier).
 * Les méthodes d'envoi lèvent donc NOT_SUPPORTED de façon explicite.
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
import { deriveBtcAccount } from '../../crypto/btc';
import { isValidBtcAddress } from '../validation/btcAddress';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout } from './net';

const API_TIMEOUT_MS = 8_000;

interface AddressStats {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

export class BitcoinChainAdapter implements ChainAdapter {
  readonly config: ChainConfig;

  constructor(config: ChainConfig) {
    if (config.family !== 'bitcoin') {
      throw new Error(`Config non-Bitcoin passée à BitcoinChainAdapter: ${config.id}`);
    }
    this.config = config;
  }

  deriveAccount(seed: Uint8Array, index = 0): Account {
    const { address, path } = deriveBtcAccount(seed, index);
    return { chain: this.config.id, address, index, path };
  }

  /** Essaie chaque API (mempool.space, blockstream…) avec timeout + fallback. */
  private async fetchJson(pathSuffix: string): Promise<unknown> {
    return tryInOrder(
      this.config.rpcUrls,
      async (base) => {
        const res = await withTimeout(
          fetch(`${base}${pathSuffix}`),
          API_TIMEOUT_MS,
          () => new Error('timeout'),
        );
        return res.json();
      },
      { timeoutMs: API_TIMEOUT_MS },
    );
  }

  async getBalance(address: string): Promise<Balance> {
    if (!isValidBtcAddress(address)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse Bitcoin invalide');
    }
    const stats = (await this.fetchJson(`/address/${address}`)) as AddressStats;
    const funded = BigInt(stats.chain_stats?.funded_txo_sum ?? 0);
    const spent = BigInt(stats.chain_stats?.spent_txo_sum ?? 0);
    return {
      raw: funded - spent, // solde confirmé en satoshis
      decimals: this.config.nativeDecimals,
      symbol: this.config.nativeSymbol,
    };
  }

  async getHistory(): Promise<TxSummary[]> {
    // Réception seulement pour l'instant : historique BTC branché plus tard.
    return [];
  }

  // --- Envoi : pas encore supporté (UTXO, chantier dédié) ---

  buildTransfer(_params: TransferParams): TransferIntent {
    throw new WalletError('NOT_SUPPORTED', "L'envoi Bitcoin n'est pas encore disponible");
  }

  async prepareTransfer(): Promise<UnsignedTx> {
    throw new WalletError('NOT_SUPPORTED', "L'envoi Bitcoin n'est pas encore disponible");
  }

  async signTransaction(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', "L'envoi Bitcoin n'est pas encore disponible");
  }

  async broadcast(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', "L'envoi Bitcoin n'est pas encore disponible");
  }
}
