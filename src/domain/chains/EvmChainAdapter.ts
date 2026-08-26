import { fetchAnkrHistory } from './ankr';
import { parseAlchemyTransfers } from './alchemy';
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
import { APPROVAL_TOPIC, addressTopic, spendersFromLogs, type ApprovalItem } from '../approvals/approvals';
import { normalizeEvmAddress } from '../validation/address';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout, withRetry } from './net';
import { parseTxList } from './etherscan';
import { computeFeeTiers, type FeeOptions } from './gas';
import { ETHERSCAN_V2_API, EXPLORER_API_KEY, COVALENT_API_KEY, ALCHEMY_KEY } from './configs';
import { parseCovalentTxList } from './covalent';

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

    // 0. Alchemy (si supporté)
    const alchemyNetworks: Record<string, string> = {
      ethereum: 'eth-mainnet',
      base: 'base-mainnet',
      polygon: 'polygon-mainnet',
      arbitrum: 'arb-mainnet',
      optimism: 'opt-mainnet',
    };
    

    const alchemyNet = alchemyNetworks[this.config.id];
    if (ALCHEMY_KEY && alchemyNet) {
      try {
        const alchemyTxs = await withRetry(async () => {
          const res = await withTimeout(
            fetch(`https://${alchemyNet}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [{
                  fromBlock: '0x0',
                  toBlock: 'latest',
                  toAddress: owner,
                  category: ['external', 'erc20'],
                  withMetadata: true,
                }],
              }),
            }),
            RPC_TIMEOUT_MS,
            () => new Error('timeout')
          );
          const json = await res.json();
          if (json && json.result) {
            const received = parseAlchemyTransfers(json, owner);
            
            // Fetch sent transfers too
            const resSent = await fetch(`https://${alchemyNet}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'alchemy_getAssetTransfers',
                params: [{
                  fromBlock: '0x0',
                  toBlock: 'latest',
                  fromAddress: owner,
                  category: ['external', 'erc20'],
                  withMetadata: true,
                }],
              }),
            });
            const jsonSent = await resSent.json();
            const sent = jsonSent && jsonSent.result ? parseAlchemyTransfers(jsonSent, owner) : [];
            
            const allTxs = [...received, ...sent].sort((a, b) => b.timestamp - a.timestamp);
            const unique = [];
            const seen = new Set();
            for (const tx of allTxs) {
              if (!seen.has(tx.hash)) {
                seen.add(tx.hash);
                unique.push(tx);
              }
            }
            return unique;
          }
          throw new Error('Alchemy invalid format');
        }, 2, 1000);
        return alchemyTxs;
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
        }, 3, 1000);
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
      }, 3, 1000);
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
        }, 3, 1000);
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

  /** Paliers de frais Lent/Normal/Rapide pour un `gasLimit` (défaut = transfert natif). */
  async getFeeOptions(gasLimit: bigint = NATIVE_TRANSFER_GAS): Promise<FeeOptions> {
    const fee = await this.call((p) => p.getFeeData());
    return computeFeeTiers(fee, gasLimit);
  }

  async prepareTransfer(
    from: string,
    params: TransferParams,
    gas?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  ): Promise<UnsignedTx> {
    const intent = this.buildTransfer(params);
    const sender = normalizeEvmAddress(from);

    const [nonce, fee] = await Promise.all([
      this.call((p) => p.getTransactionCount(sender, 'pending')),
      gas ? Promise.resolve(null) : this.call((p) => p.getFeeData()),
    ]);

    // Frais choisis par l'utilisateur (palier) sinon suggestion du réseau (EIP-1559).
    const maxFeePerGas = gas?.maxFeePerGas ?? fee?.maxFeePerGas ?? null;
    const maxPriorityFeePerGas = gas?.maxPriorityFeePerGas ?? fee?.maxPriorityFeePerGas ?? null;
    if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
      throw new WalletError('INVALID_AMOUNT', 'Frais réseau indisponibles (EIP-1559)');
    }

    return { ...intent, nonce, gasLimit: NATIVE_TRANSFER_GAS, maxFeePerGas, maxPriorityFeePerGas };
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

  /**
   * Approbations ERC-20 ACTIVES pour `owner`, parmi les `tokens` fournis (ceux
   * détenus, via getErc20Tokens). Pour chaque token : logs Approval de cet
   * owner → spenders uniques → allowance actuelle ; on ne garde que > 0.
   *
   * NB : couvre les tokens DÉTENUS (les seuls qui peuvent être vidés). Une
   * couverture exhaustive (tokens à solde nul) demanderait un indexeur.
   */
  async getApprovals(
    owner: string,
    tokens: { contract: string; symbol: string; decimals: number; logo?: string }[],
  ): Promise<ApprovalItem[]> {
    const addr = normalizeEvmAddress(owner);
    const ownerT = addressTopic(addr);
    const results: ApprovalItem[] = [];

    await Promise.all(
      tokens.map(async (tk) => {
        try {
          const logs = await this.call((p) =>
            p.getLogs({ address: tk.contract, topics: [APPROVAL_TOPIC, ownerT], fromBlock: 0, toBlock: 'latest' }),
          );
          const spenders = spendersFromLogs(logs).slice(0, 20); // borne de sûreté
          for (const spender of spenders) {
            try {
              const data = ERC20.encodeFunctionData('allowance', [addr, spender]);
              const ret = await this.call((p) => p.call({ to: tk.contract, data }));
              const allowance = ERC20.decodeFunctionResult('allowance', ret)[0] as bigint;
              if (allowance > 0n) {
                results.push({ token: tk.contract, symbol: tk.symbol, decimals: tk.decimals, logo: tk.logo, spender, allowance });
              }
            } catch {
              /* spender ignoré (appel échoué) */
            }
          }
        } catch {
          /* token ignoré (limite de plage getLogs du RPC, etc.) */
        }
      }),
    );
    // Illimitées d'abord, puis par montant décroissant.
    return results.sort((a, b) => (b.allowance > a.allowance ? 1 : b.allowance < a.allowance ? -1 : 0));
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
  'function balanceOf(address owner) view returns (uint256)',
]);
