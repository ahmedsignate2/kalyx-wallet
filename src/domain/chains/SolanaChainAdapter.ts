/**
 * Adapter Solana (mainnet-beta, adresses base58 ed25519).
 *
 * Périmètre : dérivation d'adresse, solde, historique, tokens SPL, et envoi
 * (SOL natif via `sendSolana`, tokens SPL via `sendSplToken`). L'envoi Solana
 * repose sur un modèle de compte + transaction ed25519 propre à Solana ; les
 * méthodes génériques EVM (prepare/sign/broadcast) lèvent donc NOT_SUPPORTED.
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
import { tryInOrder, withTimeout, withRetry } from './net';
import { buildTransferMessage, signAndSerialize } from './solTx';
import { parseSolanaTx, type SolTxResponse } from './solHistory';
import { parseTokenAccounts, SPL_TOKEN_PROGRAM, type SplToken } from '../tokens/splTokens';
import { fetchSplMetadata } from '../tokens/splMetadata';
import { buildSplTransferMessage } from './solSpl';

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
        if (json.error) throw new Error(json.error.message ?? 'Erreur RPC Solana');
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

  async getHistory(address: string): Promise<TxSummary[]> {
    if (!isValidSolanaAddress(address)) return [];
    
    const HELIUS_KEY = process.env.EXPO_PUBLIC_HELIUS_KEY;
    if (HELIUS_KEY) {
      try {
        return await withRetry(async () => {
          const res = await withTimeout(
            fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}`),
            API_TIMEOUT_MS,
            () => new Error('timeout')
          );
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) {
              return json.map((tx: any) => {
                const isOut = tx.feePayer === address || (tx.tokenTransfers && tx.tokenTransfers.some((t: any) => t.fromUserAccount === address));
                const nativeTransfers = Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [];
                const received = nativeTransfers
                  .filter((t: any) => t.toUserAccount === address)
                  .reduce((sum: bigint, t: any) => sum + BigInt(t.amount || 0), 0n);
                const sent = nativeTransfers
                  .filter((t: any) => t.fromUserAccount === address)
                  .reduce((sum: bigint, t: any) => sum + BigInt(t.amount || 0), 0n);
                const nativeValue = isOut ? sent : received;
                return {
                  hash: tx.signature,
                  timestamp: tx.timestamp,
                  from: isOut ? address : tx.feePayer,
                  to: isOut ? (tx.tokenTransfers?.[0]?.toUserAccount || nativeTransfers.find((t: any) => t.toUserAccount !== address)?.toUserAccount || 'Unknown') : address,
                  value: nativeValue,
                  status: tx.transactionError ? 'failed' : 'success',
                  direction: isOut ? 'out' : 'in',
                  type: tx.type,
                  description: tx.description
                };
              });
            }
          }
          throw new Error('Helius invalid format');
        }, 3, 1000);
      } catch (e) {
        // Fallback to RPC if Helius fails
      }
    }

    // 1) Dernières signatures de l'adresse.
    const sigs = await this.rpc<Array<{ signature: string }>>('getSignaturesForAddress', [address, { limit: 15 }]);
    if (!Array.isArray(sigs) || sigs.length === 0) return [];
    // 2) Détail de chaque tx (jsonParsed) → TxSummary via le parseur pur.
    const txs = await Promise.all(
      sigs.map((s) =>
        this.rpc<SolTxResponse>('getTransaction', [
          s.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]).catch(() => null),
      ),
    );
    return txs
      .map((tx) => (tx ? parseSolanaTx(address, tx) : null))
      .filter((x): x is TxSummary => x !== null);
  }

  /** Tokens SPL détenus par l'adresse (solde + mint), triés par solde. */
  async getSplTokens(address: string): Promise<SplToken[]> {
    if (!isValidSolanaAddress(address)) return [];
    const res = await this.rpc<{ value?: unknown[] }>('getTokenAccountsByOwner', [
      address,
      { programId: SPL_TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ]);
    const tokens = parseTokenAccounts((res?.value ?? []) as never);
    // Enrichit les mints hors table curée (nom/symbole/logo réels via Jupiter).
    // Best-effort : si le réseau échoue, les tokens gardent leur mint tronqué.
    const meta = await fetchSplMetadata(tokens.map((t) => t.mint));
    if (Object.keys(meta).length === 0) return tokens;
    return tokens.map((t) => {
      const m = meta[t.mint];
      return m ? { ...t, symbol: m.symbol, name: m.name, logo: t.logo ?? m.logo } : t;
    });
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

  /**
   * ENVOI SOL natif : récupère un blockhash récent, construit + signe la
   * transaction (transfert System Program), la diffuse en base64. Renvoie la
   * signature (= identifiant de tx Solana). La clé transite, n'est jamais stockée.
   */

  async sendSolana(
    from: string,
    to: string,
    amount: string,
    signer: { secretKey: Uint8Array; publicKey: Uint8Array },
  ): Promise<string> {
    if (!isValidSolanaAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    const lamports = parseAmount(amount, this.config.nativeDecimals).raw;
    if (lamports <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const latest = await this.rpc<{ value?: { blockhash?: string } }>('getLatestBlockhash', [
      { commitment: 'finalized' },
    ]);
    const blockhash = latest?.value?.blockhash;
    if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');

    const message = buildTransferMessage({ from, to, lamports, recentBlockhash: blockhash });
    const wireTx = signAndSerialize(message, signer.secretKey);

    const sig = await this.rpc<string>('sendTransaction', [wireTx, { encoding: 'base64' }]);
    if (!sig) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');
    return sig;
  }

  /**
   * ENVOI d'un token SPL : crée l'ATA du destinataire si besoin (idempotent)
   * puis transfère `amount` (unités brutes du token). Renvoie la signature.
   */
  async sendSplToken(
    from: string,
    to: string,
    amount: bigint,
    mint: string,
    decimals: number,
    signer: { secretKey: Uint8Array; publicKey: Uint8Array },
  ): Promise<string> {
    if (!isValidSolanaAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    if (!isValidSolanaAddress(mint)) throw new WalletError('INVALID_ADDRESS', 'Mint invalide');
    if (amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const latest = await this.rpc<{ value?: { blockhash?: string } }>('getLatestBlockhash', [
      { commitment: 'finalized' },
    ]);
    const blockhash = latest?.value?.blockhash;
    if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');

    const message = buildSplTransferMessage({ from, to, mint, amount, decimals, recentBlockhash: blockhash });
    const wireTx = signAndSerialize(message, signer.secretKey);

    const sig = await this.rpc<string>('sendTransaction', [wireTx, { encoding: 'base64' }]);
    if (!sig) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');
    return sig;
  }

  /**
   * Simule/décode une transaction Solana avant signature via Helius.
   * Utile pour la sécurité (WalletConnect/Browser dApp).
   */
  async simulateTransaction(base64Tx: string): Promise<any> {
    const HELIUS_KEY = process.env.EXPO_PUBLIC_HELIUS_KEY;
    if (!HELIUS_KEY) throw new WalletError('RPC_UNAVAILABLE', 'Clé Helius manquante pour la simulation');
    
    const res = await fetch(`https://api.helius.xyz/v0/transactions/simulate?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: [base64Tx],
        commitment: 'finalized'
      })
    });
    
    if (!res.ok) throw new WalletError('RPC_UNAVAILABLE', 'Erreur lors de la simulation Helius');
    return await res.json();
  }
}
