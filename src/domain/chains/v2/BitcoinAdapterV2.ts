/**
 * Bitcoin sur l'interface v2 — troisième et dernière chaîne migrée.
 *
 * C'est la plus éloignée de la forme d'origine, et c'est elle qui a révélé le
 * dernier manque de l'interface : un modèle UTXO n'a ni compte ni nonce, et
 * surtout un remplacement doit reprendre EXACTEMENT les mêmes entrées, alors
 * que les UTXO dépensés disparaissent aussitôt de l'ensemble disponible. Un
 * identifiant de transaction ne suffit donc pas à reconstruire un remplacement
 * — d'où le `opaque` de `PendingRef`, que l'appelant conserve depuis la
 * diffusion.
 *
 * Comme pour les deux précédentes : DÉLÈGUE à `BitcoinChainAdapter` (v1) pour
 * le réseau et la signature. La forme change, le comportement non.
 */
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
import { BitcoinChainAdapter } from '../BitcoinChainAdapter';
import { btcAddressKind, isValidBtcAddress, normalizeBtcAddress } from '../../validation/btcAddress';
import {
  selectUtxos,
  estimateVsize,
  dustThreshold,
  CHANGE_KIND,
  DUST_SATS,
  MAX_INPUTS,
  type CoinSelection,
  type Utxo,
} from '../btcTx';
import { bumpedRate } from '../btcFees';
import { WalletError } from '../../errors';
import { capabilities, type ChainCapabilities } from './capabilities';
import { assertCurve, type ChainSigner, type SignerCurve } from './signer';
import type {
  BroadcastOutcome,
  ChainAdapterV2,
  DraftWarning,
  FeeQuotes,
  PendingRef,
  SendDraft,
  SendRequest,
  SendSpeed,
  SignedSend,
  TxState,
} from './types';

/**
 * Charge utile Bitcoin : les pièces choisies et le taux payé.
 *
 * `inputs` et `feeRate` ne sont pas décoratifs : ce sont EXACTEMENT les deux
 * informations sans lesquelles un remplacement est impossible à construire.
 * L'appelant les conserve après diffusion et les redonne via `PendingRef`.
 */
export interface BitcoinPayload {
  /** Destinataire sous forme canonique. */
  dest: string;
  /** Montant envoyé, en satoshis. */
  target: bigint;
  selection: CoinSelection;
  /** Taux payé, en sat/vB. */
  feeRate: number;
}

/** Contexte à conserver pour pouvoir remplacer une transaction. */
export interface BitcoinPendingContext {
  dest: string;
  target: bigint;
  feeRate: number;
  inputs: Utxo[];
}

export class BitcoinAdapterV2 implements ChainAdapterV2<BitcoinPayload> {
  readonly config: ChainConfig;
  readonly signerCurve: SignerCurve = 'secp256k1';
  readonly capabilities: ChainCapabilities = capabilities({
    // Bitcoin ne porte pas de jetons fongibles dans le périmètre de Kalyx.
    tokens: false,
    tokenSend: false,
    feeTiers: true,
    accelerate: true,
    cancel: true,
    /*
     * Pas de simulation : il n'existe pas d'équivalent simple à `eth_call` sur
     * un modèle UTXO. Les contrôles qui comptent — poussière, solde frais
     * compris, format d'adresse, nombre d'entrées — sont faits dans
     * `prepareSend`, donc avant toute signature.
     */
    simulation: false,
    messageSigning: 'bitcoin',
    // Retiré volontairement : les adresses testnet sont refusées, un réseau
    // Bitcoin personnalisé serait donc une impasse (cf. docs/08 §23).
    customNetworks: false,
    memo: false,
    activatesDestination: false,
  });

  private readonly v1: BitcoinChainAdapter;

  constructor(config: ChainConfig, v1?: BitcoinChainAdapter) {
    this.config = config;
    this.v1 = v1 ?? new BitcoinChainAdapter(config);
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  deriveAccount(seed: Uint8Array, index = 0): Account {
    return this.v1.deriveAccount(seed, index);
  }

  validateAddress(address: string): boolean {
    return isValidBtcAddress(address);
  }

  getBalance(address: string): Promise<Balance> {
    return this.v1.getBalance(address);
  }

  getHistory(address: string): Promise<TxSummary[]> {
    return this.v1.getHistory(address);
  }

  // ── Frais ──────────────────────────────────────────────────────────────────

  async quoteFees(from: string, request: SendRequest): Promise<FeeQuotes> {
    const [rates, utxos] = await Promise.all([this.v1.getFeeRates(), this.v1.confirmedUtxos(from)]);
    const kind = btcAddressKind(normalizeBtcAddress(request.to)) ?? 'p2wpkh';

    /*
     * Le coût dépend du NOMBRE D'ENTRÉES retenues, donc du montant et du taux :
     * on fait une vraie sélection par palier. Annoncer un coût calculé sur une
     * entrée alors que le paiement en demandera cinq tromperait de 4 × 68 vB.
     */
    const quote = (speed: SendSpeed) => {
      const feeRate = rates[speed];
      const sel = selectUtxos(utxos, request.amount, feeRate, kind);
      const cost = sel
        ? sel.fee
        : // Solde insuffisant à ce palier : on annonce au moins le coût d'une
          // transaction minimale, pour que l'écran ait une valeur à montrer.
          BigInt(Math.ceil(estimateVsize(1, [kind, CHANGE_KIND]) * feeRate));
      return { cost, opaque: feeRate };
    };

    return { slow: quote('slow'), normal: quote('normal'), fast: quote('fast') };
  }

  // ── Envoi ──────────────────────────────────────────────────────────────────

  async prepareSend(from: string, request: SendRequest): Promise<SendDraft<BitcoinPayload>> {
    if (request.token) throw new WalletError('NOT_SUPPORTED', 'Bitcoin ne porte pas de jetons');

    const dest = normalizeBtcAddress(request.to);
    const destKind = btcAddressKind(dest);
    if (!destKind) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    if (request.amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    /*
     * POUSSIÈRE. Une sortie sous ce seuil rend la transaction non standard et
     * aucun nœud ne la relaie : sans ce contrôle, elle était construite, signée,
     * puis refusée à la diffusion avec un message incompréhensible. Le seuil
     * dépend du type d'adresse — 546 en hérité, 294 en SegWit natif.
     */
    const dust = dustThreshold(destKind);
    if (request.amount < dust) {
      throw new WalletError(
        'AMOUNT_TOO_SMALL',
        `Montant trop faible pour cette adresse : ${dust} satoshis minimum, sinon le réseau refuse la transaction.`,
      );
    }

    const [utxos, rates] = await Promise.all([this.v1.confirmedUtxos(from), this.v1.getFeeRates()]);
    const feeRate = rates[request.speed ?? 'normal'];

    const selection = selectUtxos(utxos, request.amount, feeRate, destKind);
    if (!selection) {
      // `selectUtxos` refuse aussi au-delà de MAX_INPUTS : le distinguer évite
      // d'annoncer un solde insuffisant à quelqu'un qui a les fonds.
      const spendable = utxos.filter((u) => BigInt(u.value) > BigInt(68 * feeRate)).length;
      if (spendable > MAX_INPUTS) {
        throw new WalletError(
          'NOT_SUPPORTED',
          'Trop de petites pièces à rassembler pour une seule transaction. Envoie un montant plus faible.',
        );
      }
      throw new WalletError('INSUFFICIENT_FUNDS', 'Solde Bitcoin insuffisant (frais inclus).');
    }

    return {
      chainId: this.config.id,
      from,
      to: dest,
      amount: request.amount,
      token: null,
      fee: selection.fee,
      warnings: [],
      payload: { dest, target: request.amount, selection, feeRate },
    };
  }

  async signSend(draft: SendDraft<BitcoinPayload>, signer: ChainSigner): Promise<SignedSend<BitcoinPayload>> {
    assertCurve(signer, 'secp256k1');
    const p = draft.payload;
    const raw = await this.v1.buildSignedHex(draft.from, p.dest, p.target, p.selection, {
      privateKey: signer.privateKey,
      publicKey: signer.publicKey,
    });
    return { chainId: draft.chainId, raw, draft };
  }

  async broadcastSend(signed: SignedSend<BitcoinPayload>): Promise<BroadcastOutcome> {
    const txid = await this.v1.broadcastHex(signed.raw);
    /*
     * Le contexte de remplacement part avec le résultat : sans les entrées et
     * le taux payé, aucune accélération ne sera constructible plus tard, les
     * UTXO dépensés ayant disparu de l'ensemble disponible.
     */
    const context: BitcoinPendingContext = {
      dest: signed.draft.payload.dest,
      target: signed.draft.payload.target,
      feeRate: signed.draft.payload.feeRate,
      inputs: signed.draft.payload.selection.inputs,
    };
    return { txid, opaque: context };
  }

  /**
   * Suit une transaction Bitcoin.
   *
   * Pas d'état « échouée » : une transaction Bitcoin est incluse ou ne l'est
   * pas, elle ne peut pas être incluse ET rejetée. Une transaction inconnue du
   * nœud reste `pending` — on ne sait pas, et on ne prétend pas qu'elle a
   * échoué.
   */
  async waitForTx(txid: string): Promise<TxState> {
    const status = await this.v1.getTxStatus(txid);
    return status === 'confirmed' ? { status: 'confirmed' } : { status: 'pending' };
  }

  // ── Remplacement (BIP-125) ────────────────────────────────────────────────

  /** Contexte de remplacement fourni par l'appelant, validé. */
  private contextOf(pending: PendingRef): BitcoinPendingContext {
    const c = pending.opaque as BitcoinPendingContext | undefined;
    if (!c || !Array.isArray(c.inputs) || c.inputs.length === 0) {
      throw new WalletError(
        'NOT_SUPPORTED',
        'Transaction non remplaçable : ses entrées ne sont pas connues.',
      );
    }
    return c;
  }

  /**
   * Brouillon de remplacement, aux MÊMES entrées.
   *
   * `toSelf` distingue les deux usages : accélérer renvoie le même montant au
   * même destinataire en payant plus ; annuler renvoie tout à soi-même, ce qui
   * dépense les mêmes entrées et rend l'originale caduque.
   */
  private async prepareReplacement(
    from: string,
    pending: PendingRef,
    speed: SendSpeed | undefined,
    toSelf: boolean,
  ): Promise<SendDraft<BitcoinPayload>> {
    const previous = this.contextOf(pending);
    const dest = toSelf ? normalizeBtcAddress(from) : normalizeBtcAddress(previous.dest);
    const destKind = btcAddressKind(dest);
    if (!destKind) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');

    const rates = await this.v1.getFeeRates();
    const feeRate = bumpedRate(previous.feeRate, rates[speed ?? 'fast']);
    if (feeRate === null) {
      throw new WalletError(
        'NOT_SUPPORTED',
        'Transaction déjà au taux maximal : impossible de l’accélérer davantage.',
      );
    }

    const total = previous.inputs.reduce((sum, u) => sum + BigInt(u.value), 0n);

    /*
     * ANNULER : tout revient à soi, sans sortie de monnaie. Le montant
     * « envoyé » est donc ce qui reste après les frais — l'opération ne
     * transfère rien, elle consomme les entrées pour invalider l'originale.
     */
    if (toSelf) {
      const fee = BigInt(Math.ceil(estimateVsize(previous.inputs.length, [CHANGE_KIND]) * feeRate));
      const target = total - fee;
      if (target < DUST_SATS) {
        throw new WalletError(
          'INSUFFICIENT_FUNDS',
          'Les frais d’annulation dépasseraient le montant récupérable.',
        );
      }
      const selection: CoinSelection = { inputs: previous.inputs, fee, change: 0n };
      return {
        chainId: this.config.id,
        from,
        to: dest,
        amount: target,
        token: null,
        fee,
        warnings: [],
        payload: { dest, target, selection, feeRate },
      };
    }

    // ACCÉLÉRER : même destinataire, même montant, la hausse sort de la monnaie.
    const vsize = estimateVsize(previous.inputs.length, [destKind, CHANGE_KIND]);
    const fee = BigInt(Math.ceil(vsize * feeRate));
    const insufficient = () =>
      new WalletError(
        'INSUFFICIENT_FUNDS',
        'Monnaie insuffisante pour accélérer sans réduire le montant envoyé.',
      );
    if (total < previous.target + fee) throw insufficient();

    let selection: CoinSelection;
    const change = total - previous.target - fee;
    if (change >= DUST_SATS) {
      selection = { inputs: previous.inputs, fee, change };
    } else {
      // Monnaie devenue poussière : elle part en frais, comme à l'envoi initial.
      const feeNoChange = BigInt(Math.ceil(estimateVsize(previous.inputs.length, [destKind]) * feeRate));
      if (total < previous.target + feeNoChange) throw insufficient();
      selection = { inputs: previous.inputs, fee: total - previous.target, change: 0n };
    }

    return {
      chainId: this.config.id,
      from,
      to: dest,
      amount: previous.target,
      token: null,
      fee: selection.fee,
      warnings: [],
      payload: { dest, target: previous.target, selection, feeRate },
    };
  }

  prepareAcceleration(from: string, pending: PendingRef, speed?: SendSpeed): Promise<SendDraft<BitcoinPayload>> {
    return this.prepareReplacement(from, pending, speed, false);
  }

  prepareCancellation(from: string, pending: PendingRef, speed?: SendSpeed): Promise<SendDraft<BitcoinPayload>> {
    return this.prepareReplacement(from, pending, speed, true);
  }

  /**
   * Signature de message.
   *
   * `variant` vaut `bip322` pour la forme moderne, tout le reste donne BIP-137.
   * Un défaut BIP-137 et non l'inverse : c'est la forme que comprennent les
   * vérificateurs anciens, et se tromper de protocole produit une preuve que le
   * site d'en face ne sait pas lire.
   */
  async signMessage(message: string, signer: ChainSigner, variant?: string): Promise<string> {
    assertCurve(signer, 'secp256k1');
    const { signBip137Message, signBip322Message } = await import('../btcSign');
    return variant === 'bip322'
      ? signBip322Message(message, { privateKey: signer.privateKey, publicKey: signer.publicKey })
      : signBip137Message(message, signer.privateKey);
  }
}
