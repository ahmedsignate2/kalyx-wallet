/**
 * EVM sur l'interface v2 — première chaîne migrée.
 *
 * DÉLÈGUE à `EvmChainAdapter` (v1) au lieu de réimplémenter : tout ce que la v1
 * sait faire est déjà couvert par des tests et éprouvé en production. Ce qui
 * change ici, c'est la FORME — pipeline typé, charge utile opaque, capacités
 * déclarées — pas le comportement réseau. Une migration qui réécrirait la
 * logique en même temps qu'elle change l'interface rendrait impossible de savoir
 * lequel des deux a cassé quelque chose.
 *
 * La v1 reste en place et reste appelée par le reste de l'app. Cet adapter
 * n'est encore branché nulle part : c'est voulu, on migre chaîne par chaîne.
 */
import { Wallet } from 'ethers';
import { bytesToHex } from '@noble/hashes/utils';
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
import { EvmChainAdapter } from '../EvmChainAdapter';
import { isValidEvmAddress, normalizeEvmAddress } from '../../validation/address';
import { erc20TransferData } from '../../tokens/transfer';
import { getErc20Tokens } from '../../tokens/alchemyTokens';
import { WalletError } from '../../errors';
import {
  calculateReplacementGas,
  fetchOriginalEvmTx,
  type OriginalEvmTx,
} from '../../../services/transactions/replacementService';
import { capabilities, type ChainCapabilities } from './capabilities';
import { assertCurve, type ChainSigner, type SignerCurve } from './signer';
import type {
  BroadcastOutcome,
  ChainAdapterV2,
  FeeQuotes,
  PendingRef,
  SendDraft,
  SendRequest,
  SendSpeed,
  SignedSend,
  TokenHolding,
  TxState,
} from './types';

/**
 * Charge utile EVM : les champs d'une transaction non signée.
 *
 * Les frais sont exprimés SOIT en EIP-1559, SOIT en legacy (`gasPrice`), jamais
 * les deux — c'est ce qui décide du type signé, et signer en type 2 sur une
 * chaîne sans 1559 fait rejeter la transaction à la diffusion.
 */
export interface EvmPayload {
  to: string;
  value: bigint;
  data: string;
  nonce: number;
  gasLimit: bigint;
  chainId: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

/** Gaz d'un transfert de la pièce native vers un compte ordinaire. */
const NATIVE_TRANSFER_GAS = 21_000n;
/** Gaz d'un `transfer` ERC-20, avant estimation. */
const ERC20_TRANSFER_GAS = 65_000n;
export class EvmAdapterV2 implements ChainAdapterV2<EvmPayload> {
  readonly config: ChainConfig;
  readonly signerCurve: SignerCurve = 'secp256k1';
  readonly capabilities: ChainCapabilities = capabilities({
    tokens: true,
    tokenSend: true,
    feeTiers: true,
    accelerate: true,
    cancel: true,
    simulation: true,
    messageSigning: 'personal',
    customNetworks: true,
    // L'EVM ne transporte pas de mémo et n'active pas le compte destinataire :
    // ces deux notions existent pour Cosmos et TON.
    memo: false,
    activatesDestination: false,
  });

  /** Adapter v1, seul à parler au réseau. */
  private readonly v1: EvmChainAdapter;

  constructor(config: ChainConfig, v1?: EvmChainAdapter) {
    this.config = config;
    this.v1 = v1 ?? new EvmChainAdapter(config);
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  deriveAccount(seed: Uint8Array, index = 0): Account {
    return this.v1.deriveAccount(seed, index);
  }

  validateAddress(address: string): boolean {
    return isValidEvmAddress(address);
  }

  getBalance(address: string): Promise<Balance> {
    return this.v1.getBalance(address);
  }

  getHistory(address: string): Promise<TxSummary[]> {
    return this.v1.getHistory(address);
  }

  async listTokens(address: string): Promise<TokenHolding[]> {
    const tokens = await getErc20Tokens(this.config, address);
    return tokens.map((t) => ({
      id: t.contract,
      symbol: t.symbol,
      decimals: t.decimals,
      raw: t.raw,
      name: t.name,
      logo: t.logo,
    }));
  }

  // ── Frais ──────────────────────────────────────────────────────────────────

  async quoteFees(from: string, request: SendRequest): Promise<FeeQuotes> {
    const gasLimit = request.token ? ERC20_TRANSFER_GAS : NATIVE_TRANSFER_GAS;
    const tiers = await this.v1.getFeeOptions(gasLimit);
    const quote = (s: SendSpeed) => ({
      cost: tiers[s].costWei,
      // Rendu tel quel à `prepareSend` : le palier choisi doit être honoré à
      // l'identique, pas recalculé depuis un réseau qui a bougé entre-temps.
      opaque: {
        maxFeePerGas: tiers[s].maxFeePerGas,
        maxPriorityFeePerGas: tiers[s].maxPriorityFeePerGas,
      },
    });
    void from;
    return { slow: quote('slow'), normal: quote('normal'), fast: quote('fast') };
  }

  // ── Envoi ──────────────────────────────────────────────────────────────────

  async prepareSend(from: string, request: SendRequest): Promise<SendDraft<EvmPayload>> {
    const sender = normalizeEvmAddress(from);
    if (!this.validateAddress(request.to)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse EVM invalide');
    }
    if (request.amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');
    const chainId = this.config.evmChainId;
    if (!chainId) throw new WalletError('NOT_SUPPORTED', 'Réseau EVM sans chainId');

    // Un transfert de jeton appelle le CONTRAT ; la pièce native va au
    // destinataire. `to` de la transaction diffère donc du destinataire réel.
    const isToken = !!request.token;
    const txTo = isToken ? request.token!.id : normalizeEvmAddress(request.to);
    const value = isToken ? 0n : request.amount;
    const data = isToken ? erc20TransferData(request.to, request.amount) : '0x';

    const [nonce, fee, gasLimit] = await Promise.all([
      this.v1.getNonce(sender),
      this.v1.getFeeData(),
      this.estimateGas(sender, txTo, value, data, isToken),
    ]);

    /*
     * Le palier choisi n'est appliqué QUE si la chaîne propose l'EIP-1559.
     * `computeFeeTiers` remplit `maxFeePerGas` dans les deux modes, donc suivre
     * le palier sans vérifier signerait en type 2 sur une chaîne legacy — que
     * le réseau rejette, avec un message de RPC illisible.
     */
    const supports1559 = fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null;
    const chosen = (request.speed ? await this.quoteFees(sender, request) : null)?.[request.speed ?? 'normal'];
    const picked = chosen?.opaque as { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined;

    let fees: Pick<EvmPayload, 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'gasPrice'>;
    if (supports1559) {
      fees = {
        maxFeePerGas: picked?.maxFeePerGas ?? fee.maxFeePerGas!,
        maxPriorityFeePerGas: picked?.maxPriorityFeePerGas ?? fee.maxPriorityFeePerGas!,
      };
    } else {
      const gasPrice = picked?.maxFeePerGas ?? fee.gasPrice;
      if (gasPrice == null) {
        throw new WalletError('RPC_UNAVAILABLE', 'Frais réseau indisponibles sur cette chaîne');
      }
      fees = { gasPrice };
    }

    const payload: EvmPayload = { to: txTo, value, data, nonce, gasLimit, chainId, ...fees };
    const feeCost = (fees.maxFeePerGas ?? fees.gasPrice ?? 0n) * gasLimit;

    const warnings: SendDraft<EvmPayload>['warnings'] = [];
    // Destinataire qui est un contrat : légitime (multisig, pont), mais assez
    // souvent une erreur pour mériter d'être dit.
    if (!isToken && (await this.v1.isContract(request.to).catch(() => false))) {
      warnings.push({ code: 'DESTINATION_NOT_WALLET', severity: 'warning' });
    }

    return {
      chainId: this.config.id,
      from: sender,
      to: normalizeEvmAddress(request.to),
      amount: request.amount,
      token: request.token ?? null,
      fee: feeCost,
      warnings,
      payload,
    };
  }

  /**
   * Limite de gaz estimée, jamais figée.
   *
   * 21 000 n'est exact que vers un compte ordinaire : une adresse de contrat
   * avec un `receive()` consomme davantage, et les rollups facturent en plus la
   * composante calldata L1. Un échec d'estimation ne bloque PAS l'envoi — il
   * survient pour des raisons bénignes — et retombe sur le minimum du cas.
   */
  private async estimateGas(
    from: string,
    to: string,
    value: bigint,
    data: string,
    isToken: boolean,
  ): Promise<bigint> {
    const floor = isToken ? ERC20_TRANSFER_GAS : NATIVE_TRANSFER_GAS;
    try {
      // `estimateContractGas` applique déjà sa propre marge : on ne la double
      // pas, une limite trop large se paie en frais réellement immobilisés.
      const { gasLimit } = await this.v1.estimateContractGas({ to, data, value }, from);
      return gasLimit > floor ? gasLimit : floor;
    } catch {
      return floor;
    }
  }

  async signSend(draft: SendDraft<EvmPayload>, signer: ChainSigner): Promise<SignedSend<EvmPayload>> {
    assertCurve(signer, 'secp256k1');
    const p = draft.payload;

    // ethers attend une clé hexadécimale ; on ne la fabrique qu'ici, au plus
    // près de l'usage, parce qu'une chaîne ne peut pas être effacée ensuite.
    const wallet = new Wallet(`0x${bytesToHex(signer.privateKey)}`);
    const common = { to: p.to, value: p.value, data: p.data, nonce: p.nonce, gasLimit: p.gasLimit, chainId: p.chainId };

    const raw =
      p.gasPrice != null
        ? await wallet.signTransaction({ ...common, type: 0, gasPrice: p.gasPrice })
        : await wallet.signTransaction({
            ...common,
            type: 2,
            maxFeePerGas: p.maxFeePerGas,
            maxPriorityFeePerGas: p.maxPriorityFeePerGas,
          });

    return { chainId: draft.chainId, raw, draft };
  }

  async broadcastSend(signed: SignedSend<EvmPayload>): Promise<BroadcastOutcome> {
    return { txid: await this.v1.broadcast(signed.raw) };
  }

  async waitForTx(txid: string): Promise<TxState> {
    const receipt = await this.v1.waitForReceipt(txid).catch(() => null);
    if (!receipt) return { status: 'pending' };
    // `status` 0 = incluse mais revertée : la distinction compte, les frais ont
    // été payés dans les deux cas mais l'effet attendu n'a eu lieu que dans un.
    return receipt.status === 0
      ? { status: 'failed', reason: 'Transaction rejetée à l’exécution' }
      : { status: 'confirmed' };
  }

  async simulate(draft: SendDraft<EvmPayload>): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.v1.estimateContractGas(
        { to: draft.payload.to, data: draft.payload.data, value: draft.payload.value },
        draft.from,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : undefined };
    }
  }

  // ── Remplacement d'une transaction en attente ──────────────────────────────

  /**
   * Brouillon de remplacement, au MÊME nonce.
   *
   * C'est le mécanisme EVM : une transaction n'est pas annulable, elle est
   * remplacée par une autre portant le même nonce et payant davantage. Les
   * mineurs retiennent la plus chère, l'autre devient caduque.
   *
   * `toSelf` distingue les deux usages : accélérer, c'est renvoyer la même
   * transaction plus cher ; annuler, c'est la remplacer par un envoi à
   * soi-même de valeur nulle, qui consomme le nonce sans rien faire.
   */
  private async prepareReplacement(
    from: string,
    pending: PendingRef,
    toSelf: boolean,
  ): Promise<SendDraft<EvmPayload>> {
    const sender = normalizeEvmAddress(from);
    /*
     * L'EVM retrouve tout sur la chaîne à partir du hash : le `opaque` de
     * `PendingRef` ne sert pas ici. Il existe pour Bitcoin, où les entrées
     * dépensées sont irrécupérables après coup.
     */
    const original: OriginalEvmTx | null = await fetchOriginalEvmTx(this.v1, pending.txid);
    if (!original) {
      throw new WalletError('NOT_SUPPORTED', 'Transaction introuvable : impossible de la remplacer.');
    }
    if (normalizeEvmAddress(original.from) !== sender) {
      throw new WalletError('NOT_SUPPORTED', 'Cette transaction vient d’un autre compte.');
    }

    const fee = await this.v1.getFeeData();
    // Une annulation ne fait rien : 21 000 suffisent, inutile de reprendre la
    // limite de l'originale, qui pouvait être bien plus grande.
    const gasLimit = toSelf ? NATIVE_TRANSFER_GAS : original.gasLimit;
    const gas = calculateReplacementGas(original, fee, gasLimit);

    const payload: EvmPayload = {
      to: toSelf ? sender : original.to,
      value: toSelf ? 0n : original.value,
      data: toSelf ? '0x' : original.data || '0x',
      // LE MÊME NONCE : c'est toute la mécanique. Un nonce différent créerait
      // une seconde transaction au lieu d'en remplacer une.
      nonce: original.nonce,
      gasLimit,
      chainId: original.chainId,
      maxFeePerGas: gas.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas ?? undefined,
      gasPrice: gas.gasPrice ?? undefined,
    };

    return {
      chainId: this.config.id,
      from: sender,
      to: payload.to,
      amount: payload.value,
      token: null,
      fee: (payload.maxFeePerGas ?? payload.gasPrice ?? 0n) * gasLimit,
      warnings: [],
      payload,
    };
  }

  prepareAcceleration(from: string, pending: PendingRef): Promise<SendDraft<EvmPayload>> {
    return this.prepareReplacement(from, pending, false);
  }

  prepareCancellation(from: string, pending: PendingRef): Promise<SendDraft<EvmPayload>> {
    return this.prepareReplacement(from, pending, true);
  }

  async signMessage(message: string, signer: ChainSigner): Promise<string> {
    assertCurve(signer, 'secp256k1');
    return new Wallet(`0x${bytesToHex(signer.privateKey)}`).signMessage(message);
  }
}
