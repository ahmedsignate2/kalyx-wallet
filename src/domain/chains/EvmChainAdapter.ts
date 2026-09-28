import { fetchAnkrHistory } from './ankr';
import { parseAlchemyHistory, alchemyTransfersBody } from './alchemy';
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
  type TransactionResponse,
  type FeeData,
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
import type { TxParsed, TxSummary } from './types';
import { deriveEvmAccount } from '../../crypto/hd';
import { APPROVAL_TOPIC, addressTopic, spendersFromLogs, type ApprovalItem, type ApprovalCandidate } from '../approvals/approvals';
import { normalizeEvmAddress } from '../validation/address';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout, withRetry } from './net';
import { parseTxList } from './etherscan';
import { computeFeeTiers, type FeeOptions } from './gas';
import { ETHERSCAN_V2_API, EXPLORER_API_KEY, COVALENT_API_KEY, ALCHEMY_KEY } from './configs';
import { parseCovalentTxList } from './covalent';
import { technicalLogger } from '../../../lib/technicalLogger';

// Limite de gas d'un transfert natif simple (pas d'appel de contrat).
const NATIVE_TRANSFER_GAS = 21_000n;

// Délai max par RPC avant de passer au suivant.
/**
 * Réessais pour une LECTURE d'historique.
 *
 * Deux tentatives et 300 ms d'attente, là où le défaut de `withRetry` en fait
 * trois avec un repli exponentiel à partir d'une seconde. Ce défaut est juste
 * pour une DIFFUSION de transaction, où abandonner coûte un envoi perdu. Pour une
 * lecture, il transformait un fournisseur muet en vingt-sept secondes d'attente —
 * et l'adaptateur en essaie jusqu'à quatre à la suite, ce qui dépassait la
 * minute. Une lecture qui échoue n'a rien perdu : le cache garde la valeur
 * précédente, et le prochain rafraîchissement retentera.
 */
const READ_RETRIES = 2;
const READ_BACKOFF_MS = 300;

const RPC_TIMEOUT_MS = 8_000;

/** Réseaux OP Stack : frais L1 en plus du gaz (voir `l1FeeUpperBound`). */
const OP_STACK_CHAINS = new Set(['base', 'optimism', 'mode', 'zora', 'ink', 'soneium', 'unichain', 'worldchain', 'lisk', 'fraxtal', 'superseed', 'swell', 'blast', 'bob', 'base-sepolia']);
const OP_GAS_ORACLE = '0x420000000000000000000000000000000000000F';
const GAS_ORACLE_IFACE = new Interface(['function getL1FeeUpperBound(uint256) view returns (uint256)']);

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
  private async call<T>(op: (provider: JsonRpcProvider) => Promise<T>, methodName = 'eth_rpc'): Promise<T> {
    const started = Date.now();
    try {
      const res = await tryInOrder(this.getProviders(), op, { timeoutMs: RPC_TIMEOUT_MS, key: `evm:${this.config.id}` });
      technicalLogger.logRpc(methodName, 200, undefined, { chain: this.config.name, elapsedMs: Date.now() - started });
      return res;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      technicalLogger.logRpc(methodName, 500, errorMsg, { chain: this.config.name, elapsedMs: Date.now() - started });
      throw err;
    }
  }

  deriveAccount(seed: Uint8Array, index = 0): Account {
    const { address, path } = deriveEvmAccount(seed, index);
    return { chain: this.config.id, address, index, path };
  }

  async getBalance(address: string): Promise<Balance> {
    const addr = normalizeEvmAddress(address);
    const raw = await this.call((p) => p.getBalance(addr), 'eth_getBalance');
    return {
      raw,
      decimals: this.config.nativeDecimals,
      symbol: this.config.nativeSymbol,
    };
  }

  async getCode(address: string): Promise<string> {
    const addr = normalizeEvmAddress(address);
    return this.call((p) => p.getCode(addr), 'eth_getCode');
  }

  async getTransaction(hash: string): Promise<TransactionResponse | null> {
    return this.call((p) => p.getTransaction(hash), 'eth_getTransactionByHash');
  }

  /**
   * Reçu d'une transaction, SANS attendre : `null` tant qu'elle n'est pas dans
   * un bloc. Donne ce que l'écran de suivi affichait en « ~ » : les frais
   * RÉELLEMENT payés (gaz consommé × prix effectif), et le verdict d'exécution.
   */
  async getReceiptInfo(hash: string): Promise<{ status: 'success' | 'failed'; fee: bigint; blockNumber: number; timestamp?: number } | null> {
    const r = await this.call((p) => p.getTransactionReceipt(hash), 'eth_getTransactionReceipt');
    if (!r) return null;
    const fee = r.fee ?? r.gasUsed * (r.gasPrice ?? 0n);
    const block = await this.call((p) => p.getBlock(r.blockNumber), 'eth_getBlockByNumber').catch(() => null);
    return { status: r.status === 0 ? 'failed' : 'success', fee, blockNumber: r.blockNumber, ...(block ? { timestamp: block.timestamp } : {}) };
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

  /** Historique brut : Alchemy, puis Etherscan V2, puis les clones. */
  private async fetchHistory(address: string): Promise<TxParsed[]> {
    const owner = normalizeEvmAddress(address);

    /*
     * 0. Alchemy, sur TOUT réseau servi par Alchemy (son URL est en tête des
     * RPC quand la clé existe) — et non plus sur une liste figée de cinq. Un
     * réseau qui ne connaît pas `getAssetTransfers` répond par une erreur, et
     * l'on passe aux replis.
     */
    const alchemyUrl = this.config.rpcUrls.find((u) => u.includes('.g.alchemy.com/v2/'));
    if (alchemyUrl) {
      try {
        return await withRetry(async () => {
          const ask = async (side: 'from' | 'to', id: number) => {
            const res = await withTimeout(
              fetch(alchemyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: alchemyTransfersBody(owner, side, this.config.id, id) }),
              RPC_TIMEOUT_MS,
              () => new Error('timeout'),
            );
            const json = await res.json();
            if (!json?.result) throw new Error(`Alchemy: ${json?.error?.message ?? res.status}`);
            return json;
          };
          const [received, sent] = await Promise.all([ask('to', 1), ask('from', 2)]);
          return parseAlchemyHistory([received, sent], owner);
        }, 2, 1000);
      } catch (e) {
        console.warn('Alchemy fallback:', e);
      }
    }

    // 0.5. Ankr Advanced API (Universal Multichain Fallback)
    const ankrNetworks: Record<string, string> = {
      bnb: 'bsc',
      avalanche: 'avalanche',
      ethereum: 'eth',
      polygon: 'polygon',
      base: 'base',
      arbitrum: 'arbitrum',
      optimism: 'optimism',
      fantom: 'fantom',
      celo: 'celo',
      gnosis: 'gnosis',
      scroll: 'scroll',
      linea: 'linea',
      zksync: 'zksync_era',
      'polygon-zkevm': 'polygon_zkevm',
      moonbeam: 'moonbeam',
      syscoin: 'syscoin',
      flare: 'flare',
      harmony: 'harmony',
      blast: 'blast',
      core: 'core',
      xlayer: 'xlayer'
    };
    
    const ankrNet = ankrNetworks[this.config.id];
    if (ankrNet) {
       try {
         const ankrTxs = await fetchAnkrHistory(owner, ankrNet);
         if (ankrTxs && ankrTxs.length > 0) return ankrTxs;
       } catch (e) {
         console.warn('Ankr fallback failed:', e);
       }
    }


    const query =
      `module=account&action=txlist&address=${owner}` +
      `&startblock=0&endblock=99999999&page=1&offset=25&sort=desc`;
      
    // 1. Covalent Primary
    if (COVALENT_API_KEY) {
      try {
        return await withRetry(async () => {
          const url = `https://api.covalenthq.com/v1/${this.config.evmChainId}/address/${owner}/transactions_v3/page/0/?no-logs=true`;
          const res = await withTimeout(
            fetch(url, { headers: { Authorization: `Bearer ${COVALENT_API_KEY}` } }),
            RPC_TIMEOUT_MS,
            () => new Error('timeout')
          );
          const json = await res.json();
          if (json && json.data && Array.isArray(json.data.items)) {
            return parseCovalentTxList(json, owner);
          }
          throw new Error('Covalent invalid format');
        }, READ_RETRIES, READ_BACKOFF_MS);
      } catch {
        // Ignorer et essayer le suivant
      }
    }

    // 1.5. Tenter l'API unifiée Etherscan V2 avec retry
    try {
      return await withRetry(async () => {
        const url =
          `${ETHERSCAN_V2_API}?chainid=${this.config.evmChainId}&${query}` +
          (EXPLORER_API_KEY ? `&apikey=${EXPLORER_API_KEY}` : '');
        const res = await withTimeout(fetch(url), RPC_TIMEOUT_MS, () => new Error('timeout'));
        const json = (await res.json()) as { result?: unknown };
        if (Array.isArray(json?.result)) return parseTxList(json, owner);
        throw new Error('Etherscan V2 invalid format');
      }, READ_RETRIES, READ_BACKOFF_MS);
    } catch {
      // Échec ou timeout (pas de clé, ou réseau non supporté), on passe aux fallbacks
    }

    // 2. Déduire les APIs de fallback (Blockscout ou clones Etherscan)
    const apisToTry = [];
    if (this.config.explorerApi) {
      apisToTry.push(this.config.explorerApi);
    } else if (this.config.explorerUrl) {
      apisToTry.push(`${this.config.explorerUrl}/api`);
      const host = this.config.explorerUrl.replace(/^https?:\/\//, '');
      apisToTry.push(`https://api.${host}/api`);
    }

    // 3. Tenter les fallbacks un par un
    for (const apiUrl of apisToTry) {
      try {
        return await withRetry(async () => {
          const fb = await withTimeout(
            fetch(`${apiUrl}?${query}`),
            RPC_TIMEOUT_MS,
            () => new Error('timeout'),
          );
          const fbJson = await fb.json() as { result?: unknown };
          if (Array.isArray(fbJson?.result)) {
            return parseTxList(fbJson, owner);
          }
          throw new Error('Blockscout invalid format');
        }, READ_RETRIES, READ_BACKOFF_MS);
      } catch {
        // Ignorer et essayer le suivant
      }
    }

    return [];
  }

  buildTransfer(params: TransferParams): TransferIntent {
    const to = normalizeEvmAddress(params.to);
    const { raw } = parseAmount(params.amount, this.config.nativeDecimals);
    return { to, value: raw, evmChainId: this.config.evmChainId! };
  }

  /** Données de frais brutes du réseau (EIP-1559 ou legacy). */
  async getFeeData(): Promise<{ maxFeePerGas: bigint | null; maxPriorityFeePerGas: bigint | null; gasPrice: bigint | null }> {
    const fee = await this.call((p) => p.getFeeData());
    return { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas, gasPrice: fee.gasPrice };
  }

  /** Paliers de frais Lent/Normal/Rapide pour un `gasLimit` (défaut = transfert natif). */
  async getFeeOptions(gasLimit: bigint = NATIVE_TRANSFER_GAS): Promise<FeeOptions> {
    const [fee, l1] = await Promise.all([
      this.call((p) => p.getFeeData()),
      // Taille approximative d'une transaction signée : envoi natif, ou appel de jeton.
      this.l1FeeUpperBound(gasLimit > NATIVE_TRANSFER_GAS ? 180 : 120),
    ]);
    const tiers = computeFeeTiers(fee, gasLimit);
    if (l1 === 0n) return tiers;
    return {
      slow: { ...tiers.slow, costWei: tiers.slow.costWei + l1 },
      normal: { ...tiers.normal, costWei: tiers.normal.costWei + l1 },
      fast: { ...tiers.fast, costWei: tiers.fast.costWei + l1 },
    };
  }

  /**
   * FRAIS L1 d'un rollup OP Stack (Base, Optimism…) : la publication de la
   * transaction sur Ethereum, prélevée EN PLUS du gaz. Ils n'étaient comptés
   * nulle part : « Max » sur Base proposait tout le solde moins le gaz, et le
   * nœud refusait la transaction faute de quoi payer ces frais. Plafond fourni
   * par l'oracle du réseau ; 0 hors OP Stack ou si l'oracle ne répond pas.
   */
  async l1FeeUpperBound(txBytes: number): Promise<bigint> {
    if (!OP_STACK_CHAINS.has(this.config.id)) return 0n;
    try {
      const data = GAS_ORACLE_IFACE.encodeFunctionData('getL1FeeUpperBound', [txBytes]);
      const ret = await this.call((p) => p.call({ to: OP_GAS_ORACLE, data }));
      return GAS_ORACLE_IFACE.decodeFunctionResult('getL1FeeUpperBound', ret)[0] as bigint;
    } catch {
      return 0n;
    }
  }

  /**
   * Limite de gaz d'un transfert de la pièce native.
   *
   * ESTIMÉE, plus figée à 21 000. C'est exact pour un transfert vers un compte
   * ordinaire, et faux partout ailleurs : une adresse de contrat avec un
   * `receive()` consomme davantage, et les rollups facturent en plus la
   * composante calldata L1. La transaction partait alors avec trop peu de gaz et
   * échouait après diffusion, frais perdus. Le chemin dApp estimait déjà (cf.
   * `sendContractTx`) ; seul l'envoi propre du portefeuille ne le faisait pas.
   *
   * Un échec d'estimation ne bloque PAS l'envoi : il arrive pour une raison
   * bénigne (RPC qui refuse `eth_estimateGas`, solde insuffisant au moment de la
   * simulation) et on retombe alors sur le minimum protocolaire.
   */
  private async nativeGasLimit(from: string, intent: TransferIntent): Promise<bigint> {
    try {
      const est = await this.call((p) => p.estimateGas({ from, to: intent.to, value: intent.value }));
      // Marge de 25 % : l'estimation est faite sur l'état courant, et il bouge.
      const withMargin = (est * 125n) / 100n;
      return withMargin > NATIVE_TRANSFER_GAS ? withMargin : NATIVE_TRANSFER_GAS;
    } catch {
      return NATIVE_TRANSFER_GAS;
    }
  }

  async prepareTransfer(
    from: string,
    params: TransferParams,
    gas?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  ): Promise<UnsignedTx> {
    const intent = this.buildTransfer(params);
    const sender = normalizeEvmAddress(from);

    /*
     * `getFeeData` est lu MÊME quand un palier est fourni : c'est lui qui dit si
     * la chaîne propose l'EIP-1559. Sans cette lecture, on signait en type 2 sur
     * une chaîne legacy — qui rejette la transaction — parce que les paliers de
     * `computeFeeTiers` remplissent `maxFeePerGas` dans les deux modes.
     */
    const [nonce, fee, gasLimit] = await Promise.all([
      this.call((p) => p.getTransactionCount(sender, 'pending')),
      this.call((p) => p.getFeeData()),
      this.nativeGasLimit(sender, intent),
    ]);

    const supports1559 = fee?.maxFeePerGas != null && fee?.maxPriorityFeePerGas != null;

    if (supports1559) {
      const maxFeePerGas = gas?.maxFeePerGas ?? fee!.maxFeePerGas!;
      const maxPriorityFeePerGas = gas?.maxPriorityFeePerGas ?? fee!.maxPriorityFeePerGas!;
      return { ...intent, nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas };
    }

    /*
     * Chaîne legacy. Le palier choisi par l'utilisateur reste honoré : sur cette
     * branche `computeFeeTiers` a mis le gasPrice modulé dans `maxFeePerGas`, on
     * le relit donc là. Sinon, le gasPrice du réseau.
     */
    const gasPrice = gas?.maxFeePerGas ?? fee?.gasPrice ?? null;
    if (gasPrice == null) {
      throw new WalletError('RPC_UNAVAILABLE', 'Frais réseau indisponibles sur cette chaîne');
    }
    return { ...intent, nonce, gasLimit, gasPrice };
  }

  async signTransaction(tx: UnsignedTx, privateKey: string): Promise<string> {
    // Signature 100 % hors-ligne : aucun provider requis.
    const wallet = new Wallet(privateKey);
    const common = {
      to: tx.to,
      value: tx.value,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      chainId: tx.evmChainId,
    };

    /*
     * Le TYPE suit les frais préparés, il n'est plus fixé à 2. Signer en type 2
     * une transaction destinée à une chaîne sans EIP-1559 la fait rejeter au
     * moment de la diffusion, avec un message du RPC que personne ne peut
     * interpréter.
     */
    if (tx.gasPrice != null) {
      return wallet.signTransaction({ ...common, type: 0, gasPrice: tx.gasPrice });
    }
    if (tx.maxFeePerGas == null || tx.maxPriorityFeePerGas == null) {
      throw new WalletError('INVALID_AMOUNT', 'Frais manquants : transaction non signable');
    }
    return wallet.signTransaction({
      ...common,
      type: 2, // EIP-1559
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
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

  /** Solde d'un token ERC-20 pour une adresse. */
  async getTokenBalance(token: string, owner: string): Promise<bigint> {
    const data = ERC20.encodeFunctionData('balanceOf', [owner]);
    const result = await this.call((p) => p.call({ to: token, data }));
    try {
      return BigInt(result);
    } catch {
      return 0n;
    }
  }

  /**
   * Attend que l'allowance `owner → spender` soit ≥ `min` sur le RPC (poll).
   * Après un approve confirmé, un nœud public en retard d'un bloc peut encore
   * renvoyer l'ancienne allowance → l'estimateGas de la tx suivante revert.
   * Renvoie true si vue à temps, false sinon (l'appelant décide).
   */
  async waitForAllowance(token: string, owner: string, spender: string, min: bigint, timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if ((await this.getAllowance(token, owner, spender)) >= min) return true;
      } catch {
        /* RPC muet : on réessaie */
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    return false;
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
      req.nonce != null ? Promise.resolve(req.nonce) : this.call((p) => p.getTransactionCount(from, 'pending')),
      needFee ? this.call((p) => p.getFeeData()) : Promise.resolve(null),
    ]);

    // SIMULATION SYSTÉMATIQUE (estimateGas) avant diffusion : une tx qui revert
    // n'est jamais envoyée (sinon l'utilisateur paie le gas d'un échec). Si le
    // RPC est muet (pas un revert) et qu'un gasLimit est fourni, on continue.
    let gasLimit = req.gasLimit;
    const estimate = () =>
      this.call((p) => p.estimateGas({ from, to: req.to, data: req.data ?? '0x', value: req.value ?? 0n }));
    let lastErr: unknown;
    // Jusqu'à 3 essais : un revert « missing revert data » juste après un approve
    // vient souvent d'un nœud en retard (allowance pas encore visible), pas du contrat.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const est = await estimate();
        const withMargin = (est * 12n) / 10n; // +20 % de marge
        gasLimit = gasLimit && gasLimit > withMargin ? gasLimit : withMargin;
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        const code = (e as { code?: string })?.code;
        const msg = String((e as { message?: string })?.message ?? '').toLowerCase();
        // Manque de fonds : inutile de réessayer, message clair tout de suite.
        if (code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds')) {
          throw new WalletError('INSUFFICIENT_FUNDS', `Solde en ${this.config.nativeSymbol} insuffisant pour payer les frais réseau.`);
        }
        const isRevert = code === 'CALL_EXCEPTION' || msg.includes('revert') || msg.includes('exceeds allowance') || msg.includes('transfer amount exceeds');
        if (!isRevert && gasLimit) {
          lastErr = undefined; // RPC muet, gasLimit fourni : on continue avec.
          break;
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (lastErr) {
      // Revert persistant. Si le provider (LI.FI/Relay) a fourni un gasLimit, il a
      // lui-même simulé la tx : on lui fait confiance plutôt que de bloquer sur un
      // nœud capricieux. Sinon on refuse d'envoyer une tx vouée à l'échec.
      if (!gasLimit) {
        throw new WalletError(
          'CALL_EXCEPTION',
          'La simulation a été refusée par le contrat (autorisation manquante, solde modifié ou devis expiré). Demande un nouveau devis.',
        );
      }
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
    const res = await this.call((p) => p.broadcastTransaction(raw), 'eth_sendRawTransaction');
    return res.hash;
  }

  /** L'adresse est-elle un CONTRAT (code non vide) ? Best-effort : false si RPC muet. */
  async isContract(address: string): Promise<boolean> {
    try {
      const code = await this.call((p) => p.getCode(address), 'eth_getCode');
      return !!code && code !== '0x';
    } catch {
      return false;
    }
  }

  /**
   * Lecture brute d'un contrat (`eth_call`) — renvoie le hex retourné.
   * `from`/`value` optionnels : simuler un appel payable (ex. `submit()` d'un
   * staking liquide pour connaître le montant reçu) sans rien signer.
   */
  async callContract(to: string, data: string, opts?: { from?: string; value?: bigint }): Promise<string> {
    return this.call((p) => p.call({ to, data, from: opts?.from, value: opts?.value }), 'eth_call');
  }

  /**
   * Estime le coût réseau d'un appel de contrat : `gasLimit` (+20 % de marge,
   * comme sendContractTx) et `feeWei` = gasLimit × maxFeePerGas (ou gasPrice).
   * Lève si la simulation échoue (revert) — l'appelant décide du repli.
   */
  async estimateContractGas(
    req: { to: string; data?: string; value?: bigint },
    from: string,
  ): Promise<{ gasLimit: bigint; feeWei: bigint }> {
    const [est, fee] = await Promise.all([
      this.call((p) => p.estimateGas({ from, to: req.to, data: req.data ?? '0x', value: req.value ?? 0n }), 'eth_estimateGas'),
      this.call((p) => p.getFeeData(), 'eth_feeHistory/feeData'),
    ]);
    const gasLimit = (est * 12n) / 10n;
    const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    return { gasLimit, feeWei: gasLimit * price };
  }

  /** Attend la confirmation d'une transaction (1 bloc). */
  async waitForTx(hash: string): Promise<void> {
    await this.call((p) => p.waitForTransaction(hash, 1, 120_000));
  }

  /**
   * Comme `waitForTx`, mais rend le reçu.
   *
   * Le reçu porte `status`, qui distingue une transaction INCLUSE ET REVERTÉE
   * d'une transaction réussie. Les frais sont payés dans les deux cas, mais
   * l'effet attendu n'a eu lieu que dans un — et `waitForTx`, qui ne rend rien,
   * ne permettait pas de faire la différence.
   */
  async waitForReceipt(hash: string): Promise<{ status: number | null } | null> {
    return this.call((p) => p.waitForTransaction(hash, 1, 120_000));
  }

  /**
   * Prochain nonce, en incluant les transactions encore en attente.
   *
   * `pending` et non `latest` : sans cela, deux envois successifs réutiliseraient
   * le même nonce et le second remplacerait le premier au lieu de le suivre.
   */
  async getNonce(address: string): Promise<number> {
    return this.call((p) => p.getTransactionCount(normalizeEvmAddress(address), 'pending'));
  }

  /**
   * Approbations ERC-20 ACTIVES pour `owner`, parmi les `tokens` fournis (ceux
   * détenus, via getErc20Tokens). Pour chaque token : logs Approval de cet
   * owner → spenders uniques → allowance actuelle ; on ne garde que > 0.
   *
   * NB : couvre les tokens DÉTENUS (les seuls qui peuvent être vidés). Une
   * couverture exhaustive (tokens à solde nul) demanderait un indexeur.
   */
  /**
   * Autorisations ACTIVES du propriétaire, avec un verdict d'exhaustivité.
   *
   * `candidates` (GoPlus) dit OÙ regarder ; à défaut, on fouille les logs
   * `Approval` token par token. Dans les deux cas le montant est RELU sur la
   * chaîne : une autorisation déjà révoquée ou consommée n'est pas montrée.
   *
   * `incomplete` : au moins une vérification n'a pas pu se faire (RPC qui
   * refuse la plage de `getLogs`, appel échoué). L'écran ne doit alors PAS
   * dire « aucune approbation » — c'est ce qu'il affirmait jusqu'ici, sans
   * avoir rien lu, sur la plupart des réseaux.
   */
  async getApprovalsReport(
    owner: string,
    tokens: { contract: string; symbol: string; decimals: number; logo?: string }[],
    candidates: ApprovalCandidate[] | null,
  ): Promise<{ items: ApprovalItem[]; incomplete: boolean }> {
    const addr = normalizeEvmAddress(owner);
    let incomplete = false;
    type Pair = { token: string; symbol: string; decimals: number; logo?: string; spender: string; spenderName?: string; risky?: boolean };
    const pairs: Pair[] = [];
    const logoOf = new Map(tokens.map((t) => [t.contract.toLowerCase(), t.logo]));
    if (candidates) {
      for (const c of candidates) pairs.push({ ...c, logo: logoOf.get(c.token.toLowerCase()) });
    } else {
      const ownerT = addressTopic(addr);
      await Promise.all(
        tokens.map(async (tk) => {
          try {
            const logs = await this.call((p) => p.getLogs({ address: tk.contract, topics: [APPROVAL_TOPIC, ownerT], fromBlock: 0, toBlock: 'latest' }));
            for (const spender of spendersFromLogs(logs).slice(0, 20)) pairs.push({ ...tk, token: tk.contract, spender });
          } catch {
            incomplete = true; // plage refusée par le RPC : ce token n'a pas été vérifié
          }
        }),
      );
    }
    const seen = new Set<string>();
    const results: ApprovalItem[] = [];
    await Promise.all(
      pairs.map(async (pr) => {
        const key = `${pr.token.toLowerCase()}:${pr.spender.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        try {
          const data = ERC20.encodeFunctionData('allowance', [addr, pr.spender]);
          const ret = await this.call((p) => p.call({ to: pr.token, data }));
          const allowance = ERC20.decodeFunctionResult('allowance', ret)[0] as bigint;
          if (allowance > 0n) {
            results.push({
              token: pr.token,
              symbol: pr.symbol,
              decimals: pr.decimals,
              logo: pr.logo,
              spender: pr.spender,
              allowance,
              ...(pr.spenderName ? { spenderName: pr.spenderName } : {}),
              ...(pr.risky ? { risky: true } : {}),
            });
          }
        } catch {
          incomplete = true;
        }
      }),
    );
    // Contrats douteux d'abord, puis illimitées, puis par montant décroissant.
    results.sort((a, b) => Number(!!b.risky) - Number(!!a.risky) || (b.allowance > a.allowance ? 1 : b.allowance < a.allowance ? -1 : 0));
    return { items: results, incomplete };
  }

  /** Compatibilité : la liste seule, par les logs. */
  async getApprovals(owner: string, tokens: { contract: string; symbol: string; decimals: number; logo?: string }[]): Promise<ApprovalItem[]> {
    return (await this.getApprovalsReport(owner, tokens, null)).items;
  }
}

export interface RawTxRequest {
  to: string;
  data?: string;
  value?: bigint;
  chainId: number;
  nonce?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

const ERC20 = new Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);
