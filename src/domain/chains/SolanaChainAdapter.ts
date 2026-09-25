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
  TxParsed,
  UnsignedTx,
} from './types';
import { deriveSolanaAccount, isValidSolanaAddress } from '../../crypto/solana';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout, withRetry } from './net';
import { buildTransferMessage, signAndSerialize } from './solTx';
import { parseSolanaTx, type SolTxResponse } from './solHistory';
import {
  parseTokenAccounts,
  mergeTokenAccounts,
  SPL_TOKEN_PROGRAM,
  SPL_TOKEN_2022_PROGRAM,
  type SplToken,
} from '../tokens/splTokens';
import { fetchSplMetadata } from '../tokens/splMetadata';
import { parseTransferFeeConfig, type TransferFeeConfig } from '../tokens/token2022';
import { buildSplTransferMessage } from './solSpl';
import {
  priorityInstructions,
  pickPriorityFee,
  CU_SOL_TRANSFER,
  CU_SPL_TRANSFER,
} from './solPriority';
import { technicalLogger } from '../../../lib/technicalLogger';

const API_TIMEOUT_MS = 12_000;

/**
 * Commitment pour récupérer le blockhash d'une transaction à émettre.
 *
 * `confirmed` et non `finalized` : le blockhash finalisé a une douzaine de
 * secondes de retard, prises directement sur les ~60 s de validité. On partait
 * donc avec un quart de la fenêtre déjà consommé, pour rien — `finalized` ne
 * sert qu'à LIRE un état définitif, pas à préparer un envoi.
 */
const SEND_COMMITMENT = 'confirmed';

/** Intervalle entre deux relevés d'état d'une transaction émise. */
const CONFIRM_POLL_MS = 1_500;

/**
 * Au-delà, on arrête d'attendre. ~60 s correspond à la durée de validité d'un
 * blockhash : passé ce délai, la transaction ne peut plus être incluse, donc
 * continuer à interroger ne renseignerait sur rien.
 */
const CONFIRM_TIMEOUT_MS = 60_000;

/**
 * Compléments Solana Pay portés par un transfert.
 *
 * `references` sont des comptes en lecture seule non signataires, sans effet
 * sur le transfert : c'est le seul moyen pour le marchand de retrouver CETTE
 * transaction. `memo` est inscrit on-chain via le programme SPL Memo.
 */
export interface SolanaPayExtras {
  references?: string[];
  memo?: string;
}

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
    const started = Date.now();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    try {
      const result = await tryInOrder(
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
        { timeoutMs: API_TIMEOUT_MS, key: `sol:${this.config.id}` },
      );
      technicalLogger.logRpc(method, 200, undefined, { chain: this.config.name, elapsedMs: Date.now() - started });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      technicalLogger.logRpc(method, 500, errorMsg, { chain: this.config.name, elapsedMs: Date.now() - started });
      throw err;
    }
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

  /**
   * Historique du compte, chaque ligne ESTAMPILLÉE de sa chaîne.
   *
   * L'estampillage se fait ici et nulle part ailleurs : les analyseurs lisent la
   * réponse d'un indexeur et ignorent de quel réseau il s'agit, alors que
   * l'adaptateur ne parle que du sien. Un seul point de passage, donc aucune
   * liste ne peut ressortir sans sa chaîne — et l'accueil cesse de deviner les
   * décimales d'après le réseau affiché.
   */
  async getHistory(address: string): Promise<TxSummary[]> {
    return (await this.fetchHistory(address)).map((tx) => ({ ...tx, chain: this.config.id }));
  }

  /** Historique brut : Helius si disponible, sinon les signatures RPC. */
  private async fetchHistory(address: string): Promise<TxParsed[]> {
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
      .filter((x): x is TxParsed => x !== null);
  }

  /** Tokens SPL détenus par l'adresse (solde + mint), triés par solde. */
  /**
   * Programme propriétaire d'un mint : historique ou Token-2022.
   *
   * L'information est on-chain — c'est le `owner` du compte du mint — et elle
   * fait autorité. On ne la devine pas : se tromper de programme calcule un ATA
   * faux et vise la mauvaise instruction, donc un envoi qui échoue, ou pire,
   * qui part vers un compte que personne ne contrôle.
   */
  async getMintProgram(mint: string): Promise<string> {
    if (!isValidSolanaAddress(mint)) throw new WalletError('INVALID_ADDRESS', 'Mint invalide');
    const res = await this.rpc<{ value?: { owner?: string } | null }>('getAccountInfo', [
      mint,
      { encoding: 'jsonParsed' },
    ]);
    const owner = res?.value?.owner;
    if (owner === SPL_TOKEN_PROGRAM || owner === SPL_TOKEN_2022_PROGRAM) return owner;
    if (!owner) throw new WalletError('INVALID_ADDRESS', 'Mint introuvable sur ce réseau');
    throw new WalletError('NOT_SUPPORTED', `Programme de jeton non géré : ${owner}`);
  }

  /**
   * Frais de transfert d'un mint Token-2022, ou null s'il n'en prélève pas.
   *
   * Sert à ne pas MENTIR sur le montant reçu : le programme retient un
   * pourcentage à l'arrivée, donc le destinataire reçoit moins que ce qu'on
   * envoie. Ne lève jamais — un mint sans extension, un RPC muet ou un réseau
   * qui ne connaît pas Token-2022 valent tous « pas de frais connus ».
   */
  async getTransferFeeConfig(mint: string): Promise<TransferFeeConfig | null> {
    if (!isValidSolanaAddress(mint)) return null;
    try {
      const [info, epoch] = await Promise.all([
        this.rpc<unknown>('getAccountInfo', [mint, { encoding: 'jsonParsed' }]),
        this.rpc<{ epoch?: number }>('getEpochInfo', []).then((e) => e?.epoch ?? 0),
      ]);
      return parseTransferFeeConfig(info, epoch);
    } catch {
      return null;
    }
  }

  async getSplTokens(address: string): Promise<SplToken[]> {
    if (!isValidSolanaAddress(address)) return [];

    /*
     * LES DEUX programmes. On n'interrogeait que l'historique, si bien que tout
     * jeton Token-2022 — PYUSD en tête, et une part croissante des nouveaux
     * mints — était purement INVISIBLE : l'utilisateur ne voyait pas un solde
     * qu'il détenait bel et bien.
     *
     * Les deux appels sont indépendants : si l'un échoue, l'autre reste utile,
     * et mieux vaut une liste partielle qu'un portefeuille vide.
     */
    const query = async (programId: string): Promise<SplToken[]> => {
      try {
        const res = await this.rpc<{ value?: unknown[] }>('getTokenAccountsByOwner', [
          address,
          { programId },
          { encoding: 'jsonParsed' },
        ]);
        return parseTokenAccounts((res?.value ?? []) as never, programId);
      } catch {
        return [];
      }
    };

    const tokens = mergeTokenAccounts(
      ...(await Promise.all([query(SPL_TOKEN_PROGRAM), query(SPL_TOKEN_2022_PROGRAM)])),
    );

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

  /**
   * Prix de priorité à appliquer, en micro-lamports par unité de calcul.
   *
   * Interroge les frais récemment observés sur le réseau et retient le centile
   * 75 (cf. solPriority). Ne lève JAMAIS : un RPC muet ne doit pas empêcher
   * d'envoyer, il fait simplement retomber sur le plancher.
   */
  private async priorityFee(): Promise<bigint> {
    try {
      const samples = await this.rpc<unknown>('getRecentPrioritizationFees', [[]]);
      return pickPriorityFee(samples);
    } catch {
      return pickPriorityFee(null);
    }
  }

  /** Blockhash récent + hauteur de bloc au-delà de laquelle il expire. */
  private async recentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight?: number }> {
    const latest = await this.rpc<{
      value?: { blockhash?: string; lastValidBlockHeight?: number };
    }>('getLatestBlockhash', [{ commitment: SEND_COMMITMENT }]);
    const blockhash = latest?.value?.blockhash;
    if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');
    return { blockhash, lastValidBlockHeight: latest?.value?.lastValidBlockHeight };
  }

  /**
   * Attend qu'une transaction émise soit RÉELLEMENT prise en compte.
   *
   * Sans cette étape, `sendSolana` rendait une signature et on en déduisait que
   * l'envoi avait réussi. Or sur Solana une transaction acceptée par un RPC
   * n'est pas une transaction incluse : elle peut être abandonnée en silence si
   * elle n'a pas assez de priorité, ou échouer à l'exécution. L'utilisateur
   * voyait « envoyé », l'argent n'avait pas bougé, et rien dans l'app ne le
   * contredisait jamais.
   *
   * Lève `TX_FAILED` si la chaîne rejette la transaction, `TX_EXPIRED` si le
   * blockhash périme sans inclusion.
   */
  async confirmSignature(signature: string, lastValidBlockHeight?: number): Promise<void> {
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;

    for (;;) {
      try {
        const res = await this.rpc<{
          value?: ({ err?: unknown; confirmationStatus?: string } | null)[];
        }>('getSignatureStatuses', [[signature], { searchTransactionHistory: false }]);
        const status = res?.value?.[0];
        if (status) {
          if (status.err) {
            throw new WalletError(
              'TX_FAILED',
              `Transaction rejetée par le réseau : ${JSON.stringify(status.err).slice(0, 120)}`,
            );
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return;
          }
        }
      } catch (e) {
        // Une erreur de lecture n'est pas un échec de la transaction : on
        // retentera. Seul un `err` explicite de la chaîne est définitif.
        if (e instanceof WalletError && e.code === 'TX_FAILED') throw e;
      }

      if (Date.now() >= deadline) break;

      /*
       * Le blockhash a-t-il expiré ? C'est la seule preuve qu'une transaction
       * non vue ne passera JAMAIS — sinon on ne saurait pas distinguer « pas
       * encore incluse » de « abandonnée ».
       */
      if (lastValidBlockHeight !== undefined) {
        try {
          const height = await this.rpc<number>('getBlockHeight', [{ commitment: SEND_COMMITMENT }]);
          if (typeof height === 'number' && height > lastValidBlockHeight) {
            throw new WalletError(
              'TX_EXPIRED',
              'Transaction abandonnée par le réseau (blockhash expiré). Les fonds n\'ont pas bougé.',
            );
          }
        } catch (e) {
          if (e instanceof WalletError && e.code === 'TX_EXPIRED') throw e;
        }
      }

      await new Promise((r) => setTimeout(r, CONFIRM_POLL_MS));
    }

    throw new WalletError(
      'TX_EXPIRED',
      'Transaction non confirmée dans le délai imparti. Vérifie l\'explorateur avant de réessayer.',
    );
  }

  async sendSolana(
    from: string,
    to: string,
    amount: string,
    signer: { secretKey: Uint8Array; publicKey: Uint8Array },
    opts?: SolanaPayExtras,
  ): Promise<string> {
    if (!isValidSolanaAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    const lamports = parseAmount(amount, this.config.nativeDecimals).raw;
    if (lamports <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const [{ blockhash, lastValidBlockHeight }, microLamports] = await Promise.all([
      this.recentBlockhash(),
      this.priorityFee(),
    ]);

    const message = buildTransferMessage({
      from,
      to,
      lamports,
      recentBlockhash: blockhash,
      prefix: priorityInstructions(CU_SOL_TRANSFER, microLamports),
      references: opts?.references,
      memo: opts?.memo,
    });
    const wireTx = signAndSerialize(message, signer.secretKey);

    const sig = await this.rpc<string>('sendTransaction', [
      wireTx,
      { encoding: 'base64', preflightCommitment: SEND_COMMITMENT, maxRetries: 3 },
    ]);
    if (!sig) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');

    await this.confirmSignature(sig, lastValidBlockHeight);
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
    opts?: SolanaPayExtras,
  ): Promise<string> {
    if (!isValidSolanaAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    if (!isValidSolanaAddress(mint)) throw new WalletError('INVALID_ADDRESS', 'Mint invalide');
    if (amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const [{ blockhash, lastValidBlockHeight }, microLamports, tokenProgram] = await Promise.all([
      this.recentBlockhash(),
      this.priorityFee(),
      // Le programme du mint fait autorité on-chain : il entre dans les seeds
      // de l'ATA et dans l'instruction, on ne le devine pas.
      this.getMintProgram(mint),
    ]);

    const message = buildSplTransferMessage({
      from,
      to,
      mint,
      amount,
      decimals,
      recentBlockhash: blockhash,
      prefix: priorityInstructions(CU_SPL_TRANSFER, microLamports),
      tokenProgram,
      references: opts?.references,
      memo: opts?.memo,
    });
    const wireTx = signAndSerialize(message, signer.secretKey);

    const sig = await this.rpc<string>('sendTransaction', [
      wireTx,
      { encoding: 'base64', preflightCommitment: SEND_COMMITMENT, maxRetries: 3 },
    ]);
    if (!sig) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');

    await this.confirmSignature(sig, lastValidBlockHeight);
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
