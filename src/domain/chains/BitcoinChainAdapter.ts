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
  TxParsed,
  UnsignedTx,
} from './types';
import { deriveBtcAccount } from '../../crypto/btc';
import { isValidBtcAddress, normalizeBtcAddress, btcAddressKind } from '../validation/btcAddress';
import { parseAmount } from '../validation/amount';
import { WalletError } from '../errors';
import { tryInOrder, withTimeout } from './net';
import { selectUtxos, estimateVsize, dustThreshold, CHANGE_KIND, DUST_SATS, MAX_INPUTS, type Utxo, type CoinSelection } from './btcTx';
import { parseBtcFeeRates, bumpedRate, FALLBACK_RATES, type BtcFeeRates } from './btcFees';
import type { FeeSpeed } from './gas';

/**
 * Séquence marquant les entrées comme REMPLAÇABLES (BIP-125 : toute valeur
 * < 0xFFFFFFFE). btc-signer met 0xFFFFFFFF par défaut, ce qui rend la
 * transaction finale — donc impossible à accélérer si elle reste coincée.
 */
const RBF_SEQUENCE = 0xfffffffd;

/** Ce qu'il faut conserver d'un envoi pour pouvoir le remplacer plus tard. */
export interface BtcSendResult {
  txid: string;
  /** Destinataire, sous forme canonique. */
  to: string;
  /** Montant envoyé, en satoshis. */
  target: bigint;
  /** Taux payé (sat/vB) : le remplacement doit faire strictement mieux. */
  feeRate: number;
  /** Entrées dépensées : un remplacement doit reprendre les MÊMES. */
  inputs: Utxo[];
  /** Frais réellement payés, en satoshis. */
  fee: bigint;
}
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
    if (!isValidBtcAddress(address)) return [];
    const txs = (await this.fetchJson(`/address/${address}/txs`)) as BtcTxResponse[];
    if (!Array.isArray(txs)) return [];
    return txs
      .map((tx) => parseBtcTx(address, tx))
      .filter((x): x is TxParsed => x !== null)
      .map((tx) => ({ ...tx, chain: this.config.id }));
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

  /**
   * Trois paliers de frais (sat/vB) via mempool.space.
   *
   * Remplace la lecture d'une seule valeur (`halfHourFee`) avec repli `8` en
   * dur : l'utilisateur n'avait aucun choix de vitesse sur Bitcoin, alors que
   * l'EVM en propose trois, et un taux figé est soit du surpaiement soit des
   * heures d'attente selon le jour.
   */
  async getFeeRates(): Promise<BtcFeeRates> {
    try {
      return parseBtcFeeRates(await this.fetchJson('/v1/fees/recommended'));
    } catch {
      return FALLBACK_RATES;
    }
  }

  /** UTXO confirmés de l'adresse, prêts pour la sélection. */
  async confirmedUtxos(from: string): Promise<Utxo[]> {
    const raw = (await this.fetchJson(`/address/${from}/utxo`)) as RawUtxo[];
    return (raw ?? [])
      .filter((u) => u.status?.confirmed !== false)
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));
  }

  /**
   * Construit et SIGNE une transaction à partir d'entrées choisies, sans la
   * diffuser. Rend le hex filaire.
   *
   * Séparé de la diffusion pour que l'interface v2 puisse montrer à
   * l'utilisateur ce qu'il signe avant de l'envoyer : `signAndBroadcast`
   * enchaînait les deux, donc il n'existait aucun moment où la transaction
   * existait sans être déjà partie.
   */
  async buildSignedHex(
    from: string,
    dest: string,
    target: bigint,
    selection: CoinSelection,
    signer: { privateKey: Uint8Array; publicKey: Uint8Array },
  ): Promise<string> {
    // @scure/btc-signer est ESM pur : import dynamique (cf. jest.config).
    const btc = await import('@scure/btc-signer');

    // Construction P2WPKH (SegWit natif) côté ENTRÉES : c'est ce que Kalyx dérive.
    const p2wpkh = btc.p2wpkh(signer.publicKey);
    const tx = new btc.Transaction();
    for (const input of selection.inputs) {
      tx.addInput({
        txid: input.txid,
        index: input.vout,
        witnessUtxo: { script: p2wpkh.script, amount: BigInt(input.value) },
        /*
         * REMPLAÇABLE (BIP-125). La séquence par défaut de btc-signer est
         * 0xFFFFFFFF, qui marque la transaction comme FINALE : une transaction
         * coincée à taux trop faible l'était alors définitivement, sans aucun
         * moyen de l'accélérer — ni depuis Kalyx, ni par un service tiers.
         */
        sequence: RBF_SEQUENCE,
      });
    }
    tx.addOutputAddress(dest, target);
    if (selection.change > 0n) tx.addOutputAddress(from, selection.change);

    tx.sign(signer.privateKey);
    tx.finalize();
    return tx.hex;
  }

  /** État d'une transaction : confirmée, dans le mempool, ou inconnue. */
  async getTxStatus(txid: string): Promise<'confirmed' | 'pending' | 'unknown'> {
    try {
      const tx = (await this.fetchJson(`/tx/${txid}`)) as { status?: { confirmed?: boolean } };
      if (!tx || typeof tx !== 'object') return 'unknown';
      return tx.status?.confirmed ? 'confirmed' : 'pending';
    } catch {
      // Un nœud qui ne connaît pas la transaction répond en erreur : on ne sait
      // pas, et on ne prétend pas qu'elle a échoué.
      return 'unknown';
    }
  }

  /**
   * Construit, signe et diffuse une transaction à partir d'entrées CHOISIES.
   *
   * Isolé du choix des pièces pour que le remplacement (RBF) puisse réutiliser
   * exactement les mêmes entrées — c'est la condition d'un remplacement valide.
   */
  private async signAndBroadcast(
    from: string,
    dest: string,
    target: bigint,
    selection: CoinSelection,
    signer: { privateKey: Uint8Array; publicKey: Uint8Array },
  ): Promise<string> {
    return this.broadcastHex(await this.buildSignedHex(from, dest, target, selection, signer));
  }

  /**
   * ENVOI Bitcoin : récupère les UTXO confirmés, sélectionne les pièces (frais
   * inclus), construit + signe la tx avec @scure/btc-signer, diffuse le hex.
   * La clé privée transite mais n'est jamais stockée ni loggée.
   *
   * Renvoie de quoi REMPLACER cette transaction plus tard : les entrées et le
   * taux payé. Sans ces deux informations, une accélération est impossible —
   * les UTXO dépensés ne figurent plus dans l'ensemble des UTXO disponibles.
   */
  async sendBitcoinDetailed(
    from: string,
    to: string,
    amount: string,
    signer: { privateKey: Uint8Array; publicKey: Uint8Array },
    opts?: { speed?: FeeSpeed },
  ): Promise<BtcSendResult> {
    // Normalisation AVANT validation : le bech32 majuscule des QR doit passer,
    // et une adresse base58 doit traverser intacte (casse significative).
    const dest = normalizeBtcAddress(to);
    const destKind = btcAddressKind(dest);
    if (!destKind) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    const target = parseAmount(amount, this.config.nativeDecimals).raw;
    if (target <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    /*
     * Poussière : une sortie sous ce seuil rend la transaction NON STANDARD, et
     * aucun nœud ne la relaie. Sans ce contrôle, elle était construite, signée,
     * puis refusée à la diffusion avec un message de nœud incompréhensible — et
     * le seuil dépend du type d'adresse (546 en hérité, 294 en SegWit natif).
     */
    const dust = dustThreshold(destKind);
    if (target < dust) {
      throw new WalletError(
        'AMOUNT_TOO_SMALL',
        `Montant trop faible pour cette adresse : ${dust} satoshis minimum, sinon le réseau refuse la transaction.`,
      );
    }

    const [utxos, rates] = await Promise.all([this.confirmedUtxos(from), this.getFeeRates()]);
    const feeRate = rates[opts?.speed ?? 'normal'];

    // Le type de l'adresse destinataire entre dans le calcul des frais : une
    // sortie P2PKH ou Taproot est plus grosse qu'une P2WPKH.
    const selection = selectUtxos(utxos, target, feeRate, destKind);
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

    const txid = await this.signAndBroadcast(from, dest, target, selection, signer);
    return { txid, to: dest, target, feeRate, inputs: selection.inputs, fee: selection.fee };
  }

  /** Envoi Bitcoin ; renvoie le txid (cf. `sendBitcoinDetailed` pour le RBF). */
  async sendBitcoin(
    from: string,
    to: string,
    amount: string,
    signer: { privateKey: Uint8Array; publicKey: Uint8Array },
    opts?: { speed?: FeeSpeed },
  ): Promise<string> {
    return (await this.sendBitcoinDetailed(from, to, amount, signer, opts)).txid;
  }

  /**
   * ACCÉLÈRE une transaction en attente (remplacement BIP-125).
   *
   * Reprend EXACTEMENT les mêmes entrées et le même destinataire, au même
   * montant, mais à un taux plus élevé : la différence sort de la monnaie
   * rendue. Un remplacement doit payer strictement plus que l'original, sinon
   * les nœuds le rejettent (cf. `bumpedRate`).
   *
   * Si la monnaie ne suffit plus à couvrir la hausse, on refuse plutôt que de
   * rogner le montant envoyé : l'utilisateur a demandé à accélérer un paiement,
   * pas à en changer le montant.
   */
  async bumpBitcoinFee(
    from: string,
    previous: { to: string; target: bigint; feeRate: number; inputs: Utxo[] },
    signer: { privateKey: Uint8Array; publicKey: Uint8Array },
    opts?: { speed?: FeeSpeed },
  ): Promise<BtcSendResult> {
    const dest = normalizeBtcAddress(previous.to);
    const destKind = btcAddressKind(dest);
    if (!destKind) throw new WalletError('INVALID_ADDRESS', 'Adresse destinataire invalide');
    if (previous.inputs.length === 0) {
      throw new WalletError('NOT_SUPPORTED', 'Transaction non remplaçable : entrées inconnues.');
    }

    const rates = await this.getFeeRates();
    const feeRate = bumpedRate(previous.feeRate, rates[opts?.speed ?? 'fast']);
    if (feeRate === null) {
      throw new WalletError(
        'NOT_SUPPORTED',
        'Transaction déjà au taux maximal : impossible de l’accélérer davantage.',
      );
    }

    const total = previous.inputs.reduce((sum, u) => sum + BigInt(u.value), 0n);
    const vsize = estimateVsize(previous.inputs.length, [destKind, CHANGE_KIND]);
    const fee = BigInt(Math.ceil(vsize * feeRate));
    if (total < previous.target + fee) {
      throw new WalletError(
        'INSUFFICIENT_FUNDS',
        'Monnaie insuffisante pour accélérer sans réduire le montant envoyé.',
      );
    }
    let change = total - previous.target - fee;
    let selection: CoinSelection;
    if (change >= DUST_SATS) {
      selection = { inputs: previous.inputs, fee, change };
    } else {
      // Monnaie devenue poussière : elle part en frais, comme à l'envoi initial.
      const vsizeNoChange = estimateVsize(previous.inputs.length, [destKind]);
      const feeNoChange = BigInt(Math.ceil(vsizeNoChange * feeRate));
      if (total < previous.target + feeNoChange) {
        throw new WalletError(
          'INSUFFICIENT_FUNDS',
          'Monnaie insuffisante pour accélérer sans réduire le montant envoyé.',
        );
      }
      change = 0n;
      selection = { inputs: previous.inputs, fee: total - previous.target, change: 0n };
    }

    const txid = await this.signAndBroadcast(from, dest, previous.target, selection, signer);
    return { txid, to: dest, target: previous.target, feeRate, inputs: previous.inputs, fee: selection.fee };
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
