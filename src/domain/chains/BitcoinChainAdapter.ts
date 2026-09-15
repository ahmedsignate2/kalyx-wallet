/**
 * Adapter Bitcoin (mainnet, SegWit natif bc1...).
 *
 * Périmètre : dérivation d'adresse, validation, solde, historique, et envoi
 * via `sendBitcoin` (modèle UTXO : sélection d'UTXO + signature + diffusion).
 * Les méthodes génériques EVM (prepare/sign/broadcast) lèvent NOT_SUPPORTED
 * car l'envoi BTC passe par son chemin dédié.
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
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout } from './net';
import { selectUtxos, type Utxo } from './btcTx';
import { parseBtcTx, type BtcTxResponse } from './btcHistory';

const API_TIMEOUT_MS = 8_000;

interface RawUtxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed?: boolean };
}

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
      { timeoutMs: API_TIMEOUT_MS, key: `btc:${this.config.id}` },
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

  async getHistory(address: string): Promise<TxSummary[]> {
    if (!isValidBtcAddress(address)) return [];
    const txs = (await this.fetchJson(`/address/${address}/txs`)) as BtcTxResponse[];
    if (!Array.isArray(txs)) return [];
    return txs
      .map((tx) => parseBtcTx(address, tx))
      .filter((x): x is TxSummary => x !== null);
  }

  /**
   * Validation HORS-LIGNE d'un envoi BTC : adresse valide + montant > 0.
   * (Le modèle UTXO ne connaît ni nonce ni gaz : `value` est en satoshis,
   * `evmChainId` est à 0, non pertinent ici.)
   */
  buildTransfer(params: TransferParams): TransferIntent {
    if (!isValidBtcAddress(params.to)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse Bitcoin invalide');
    }
    const value = parseAmount(params.amount, this.config.nativeDecimals).raw;
    if (value <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');
    return { to: params.to, value, evmChainId: 0 };
  }

  // Les méthodes génériques prepare/sign/broadcast sont EVM-centrées ; l'envoi
  // BTC passe par `sendBitcoin` (appelé par walletStore selon la famille).
  async prepareTransfer(): Promise<UnsignedTx> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendBitcoin pour l’envoi Bitcoin');
  }
  async signTransaction(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendBitcoin pour l’envoi Bitcoin');
  }
  async broadcast(): Promise<string> {
    throw new WalletError('NOT_SUPPORTED', 'Utiliser sendBitcoin pour l’envoi Bitcoin');
  }

  /** Frais recommandés (sat/vB) via mempool.space ; repli prudent sinon. */
  private async feeRate(): Promise<number> {
    try {
      const fees = (await this.fetchJson('/v1/fees/recommended')) as { halfHourFee?: number };
      const r = Number(fees.halfHourFee);
      return Number.isFinite(r) && r > 0 ? r : 8;
    } catch {
      return 8; // sat/vB par défaut si l'API échoue
    }
  }

  /**
   * ENVOI Bitcoin (P2WPKH) : récupère les UTXO confirmés, sélectionne les
   * pièces (frais inclus), construit + signe la tx avec @scure/btc-signer,
   * diffuse le hex. Renvoie le txid. La clé privée transite mais n'est jamais
   * stockée ni loggée.
   */
  async sendBitcoin(from: string, to: string, amount: string, signer: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<string> {
    if (!isValidBtcAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    const target = parseAmount(amount, this.config.nativeDecimals).raw;
    if (target <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const [raw, feeRate] = await Promise.all([
      this.fetchJson(`/address/${from}/utxo`) as Promise<RawUtxo[]>,
      this.feeRate(),
    ]);
    const utxos: Utxo[] = (raw ?? [])
      .filter((u) => u.status?.confirmed !== false) // confirmés d'abord
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));

    const selection = selectUtxos(utxos, target, feeRate);
    if (!selection) throw new WalletError('INSUFFICIENT_FUNDS', 'Solde Bitcoin insuffisant (frais inclus).');

    // @scure/btc-signer est ESM pur (Jest ne le transforme pas) : import
    // dynamique ici → le module reste chargeable en test (envoi non exercé).
    const btc = await import('@scure/btc-signer');

    // Construction P2WPKH (SegWit natif).
    const p2wpkh = btc.p2wpkh(signer.publicKey);
    const tx = new btc.Transaction();
    for (const input of selection.inputs) {
      tx.addInput({
        txid: input.txid,
        index: input.vout,
        witnessUtxo: { script: p2wpkh.script, amount: BigInt(input.value) },
      });
    }
    tx.addOutputAddress(to, target);
    if (selection.change > 0n) tx.addOutputAddress(from, selection.change);

    tx.sign(signer.privateKey);
    tx.finalize();
    return this.broadcastHex(tx.hex);
  }

  /** Diffusion d'une transaction signée (hex brut) : POST mempool.space / blockstream, renvoie le txid. */
  async broadcastHex(hex: string): Promise<string> {
    return tryInOrder(
      this.config.rpcUrls,
      async (base) => {
        const res = await withTimeout(
          fetch(`${base}/tx`, { method: 'POST', body: hex }),
          API_TIMEOUT_MS,
          () => new Error('timeout'),
        );
        const text = (await res.text()).trim();
        if (!res.ok || !/^[0-9a-f]{64}$/i.test(text)) {
          throw new WalletError('BROADCAST_FAILED', text.slice(0, 120) || 'Diffusion refusée par le réseau');
        }
        return text;
      },
      { timeoutMs: API_TIMEOUT_MS, key: `btc:${this.config.id}` },
    );
  }
}
