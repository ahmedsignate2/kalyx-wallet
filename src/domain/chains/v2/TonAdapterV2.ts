/**
 * TON (The Open Network) — adaptateur v2, sur TON Center.
 *
 * Toujours enregistré NULLE PART : aucune configuration TON n'existe dans
 * `configs`, et le registre v1 ferait planter l'app au démarrage si l'on en
 * ajoutait une sans traiter la famille `'ton'` (cf. docs/10-TON.md §12). Cet
 * adaptateur est complet pour le test ; l'activation est une étape à part.
 *
 * Ce qu'il fait, et d'où viennent ses règles :
 *
 * - LECTURE : état du compte (actif / non déployé / contrat), solde, seqno et
 *   version du contrat, par TON Center (`tonCenter.ts` — formes de réponse
 *   relevées en direct, pas supposées).
 * - REBOND : la règle de Tonkeeper, relue dans son code
 *   (`userInputAddressIsBounceable`) — une adresse `UQ…` ne rebondit jamais ;
 *   sinon, rebond si et seulement si le destinataire est ACTIF. Vers un compte
 *   pas encore déployé, un transfert rebondissant reviendrait à l'envoyeur.
 * - SIGNATURE : `buildTonTransfer`, identique octet pour octet à `@ton/ton`. La
 *   version du contrat est retrouvée en comparant l'adresse d'envoi à celles que
 *   donne la clé du signataire : un signataire qui ne possède pas l'adresse
 *   affichée ne signe rien.
 * - SUIVI : par le hachage NORMALISÉ du message (TEP-467), vérifié contre le
 *   `hash_norm` que TON Center indexe pour une transaction réelle. Pas de
 *   « diffusé donc réussi » : on attend la transaction, et on lit ses phases.
 *
 * La réflexion complète est dans `docs/10-TON.md`.
 */
import { base64, hex } from '@scure/base';
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
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
  SignedSend,
  TokenHolding,
  TxState,
  TxWaitHint,
} from './types';
import { formatTonAddress, isValidTonAddress, parseRawTonAddress, parseTonAddress, toRawTonAddress } from '../ton/tonAddress';
import { TonCenterClient, type TonAccountState, type TonCenterTx } from '../ton/tonCenter';
import { buildTonTransfer, tonTransferBodyForEstimate, TON_SEND_MODE_DEFAULT } from '../ton/tonTransfer';
import { tonWalletAddress, TON_IMPORT_WALLET_VERSIONS, type TonWalletVersion } from '../ton/tonWallet';

/**
 * Charge utile d'un envoi TON, figée à la préparation.
 *
 * Plus de `boc` ni de `validUntil` ici, contrairement au squelette : le BOC
 * appartient à `SignedSend.raw`, et l'échéance est fixée À LA SIGNATURE. TON ne
 * lie pas un message à un bloc récent : fixer l'échéance à la préparation ferait
 * expirer un envoi dont l'utilisateur a pris son temps pour confirmer.
 */
export interface TonPayload {
  /** Compteur du contrat au moment de la préparation. */
  seqno: number;
  /** Premier envoi d'un compte jamais déployé : le message embarque l'état initial. */
  deploys: boolean;
  /** Version lue sur la chaîne pour un compte actif ; absente sinon (retrouvée à la signature). */
  version?: TonWalletVersion;
  /** Rebond, décidé d'après l'état RÉEL du destinataire. */
  bounce: boolean;
  /** Commentaire — les plateformes d'échange l'exigent pour attribuer un dépôt. */
  comment?: string;
  sendMode: number;
  /** Adresse du portefeuille de jeton à débiter, pour un transfert de jeton (à venir). */
  jettonWallet?: string;
}

/** Échéance d'un message, en secondes après la signature. */
const VALIDITY_SECONDS = 300;
/**
 * Marge par message sortant : `estimateFee` n'inclut pas les frais
 * d'acheminement de l'action (relevé : `fwd_fee` à 0, alors qu'une transaction
 * réelle en a payé 540 668 nanotons). 0,001 TON couvre un transfert commenté.
 */
const FORWARD_FEE_MARGIN = 1_000_000n;
/**
 * Premier envoi d'un compte non déployé : l'estimation par le nœud exigerait
 * l'état initial, donc la clé publique, que la préparation n'a pas. Estimation
 * PRUDENTE et fixe, à remplacer par l'émulation TonAPI en production.
 */
const DEPLOY_FEE_ESTIMATE = 10_000_000n;
/** Délai entre deux sondages du suivi (TON Center sans clé : une requête par seconde). */
const POLL_MS = 3_000;
/** Retard toléré de l'indexeur après l'échéance, avant de conclure à l'expiration. */
const INDEXER_GRACE_MS = 60_000;

/**
 * Capacités VISÉES, une fois l'adaptateur complet (jetons compris).
 *
 * TON n'a ni paliers de frais — le réseau les calcule et les prélève — ni
 * accélération ni annulation : un message non inclus avant son échéance expire
 * sans rien débiter. `memo` et `activatesDestination` sont les deux qui
 * comptent : les plateformes exigent le commentaire, et un transfert de jeton
 * déploie le portefeuille de jeton du destinataire.
 */
export const TON_TARGET_CAPABILITIES: ChainCapabilities = capabilities({
  tokens: true,
  tokenSend: true,
  feeTiers: false,
  accelerate: false,
  cancel: false,
  simulation: false,
  messageSigning: 'ed25519',
  customNetworks: true,
  memo: true,
  activatesDestination: true,
});

function notYet(what: string): never {
  throw new WalletError('NOT_SUPPORTED', `TON : ${what} n'est pas encore implémenté (cf. docs/10-TON.md).`);
}

/** Adresse lue, conviviale ou brute, ou `null`. */
function rawOf(address: string): string | null {
  const a = parseTonAddress(address) ?? parseRawTonAddress(address);
  return a ? toRawTonAddress(a) : null;
}

export class TonAdapterV2 implements ChainAdapterV2<TonPayload> {
  readonly config: ChainConfig;
  /** ed25519, comme Solana — mais PAS la même dérivation (cf. docs/10-TON.md §1). */
  readonly signerCurve: SignerCurve = 'ed25519';

  /**
   * Ce qui fonctionne VRAIMENT, et rien d'autre : le commentaire. Les jetons, la
   * signature de message et les réseaux personnalisés viendront avec leur code —
   * une capacité déclarée sans son code produirait un bouton qui échoue.
   */
  readonly capabilities: ChainCapabilities = capabilities({ memo: true });

  private readonly client: TonCenterClient;
  private readonly testnet: boolean;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    config: ChainConfig,
    deps: { client?: TonCenterClient; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    if (config.family !== 'ton') {
      throw new Error(`Config non-TON passée à TonAdapterV2 : ${config.id}`);
    }
    this.config = config;
    this.testnet = !!config.testnet;
    this.client = deps.client ?? new TonCenterClient(config.rpcUrls[0] ?? (this.testnet ? 'https://testnet.toncenter.com/api' : 'https://toncenter.com/api'));
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Pas de dérivation ici : la clé TON vient de la PHRASE (règle de Tonkeeper,
   * `resolveTonKey`), et l'adresse dépend de la version du contrat. C'est le
   * magasin, seul détenteur de la phrase, qui calcule le compte TON
   * (`tonPublicKey`) — cette méthode ne reçoit qu'une graine BIP-39.
   */
  deriveAccount(): Account {
    return notYet('la dérivation depuis une graine (le compte TON vient de la phrase, dans le magasin)');
  }

  validateAddress(address: string): boolean {
    return isValidTonAddress(address, { testnet: this.testnet });
  }

  async getBalance(address: string): Promise<Balance> {
    const s = await this.client.accountState(address);
    return { raw: s.balance, decimals: this.config.nativeDecimals, symbol: this.config.nativeSymbol };
  }

  /**
   * Historique, lu tel que TON Center le décrit.
   *
   * Un message ENTRANT interne est un reçu ; un message EXTERNE est un envoi de ce
   * portefeuille, et ses messages sortants disent à qui. Un dépôt reçu par un
   * compte pas encore déployé est marqué `aborted` par le réseau — sans code à
   * exécuter — alors que les fonds sont bien crédités : c'est un reçu réussi.
   */
  async getHistory(address: string): Promise<TxSummary[]> {
    const me = rawOf(address);
    const { transactions, addressBook } = await this.client.transactions(address);
    const friendly = (raw?: string | null) => {
      if (!raw) return '';
      const hit = addressBook[raw]?.user_friendly;
      if (hit) return hit;
      const a = parseRawTonAddress(raw.toLowerCase());
      return a ? formatTonAddress(a, { bounceable: false, testnet: this.testnet }) : raw;
    };
    const out: TxSummary[] = [];
    for (const tx of transactions) {
      const inm = tx.in_msg;
      const outs = tx.out_msgs ?? [];
      const hash = hex.encode(base64.decode(tx.hash)); // les explorateurs affichent l'hexadécimal
      const base = { chain: this.config.id, hash, timestamp: tx.now, asset: this.config.nativeSymbol, decimals: this.config.nativeDecimals };
      if (inm?.source) {
        const value = BigInt(inm.value ?? '0');
        if (value === 0n) continue; // notification sans valeur
        out.push({
          ...base,
          from: friendly(inm.source),
          to: address,
          value,
          direction: 'in',
          status: 'success',
          type: inm.bounced ? 'BOUNCE' : 'TRANSFER',
          description: inm.message_content?.decoded?.comment ?? undefined,
        });
      } else if (outs.length > 0) {
        const value = outs.reduce((s, m) => s + BigInt(m.value ?? '0'), 0n);
        const dest = outs[0].destination ?? '';
        out.push({
          ...base,
          from: address,
          to: friendly(dest),
          value,
          direction: me && rawOf(dest) === me ? 'self' : 'out',
          status: this.outcome(tx).status === 'confirmed' ? 'success' : 'failed',
          type: 'TRANSFER',
          description: outs[0].message_content?.decoded?.comment ?? undefined,
        });
      }
    }
    return out;
  }

  async listTokens(): Promise<TokenHolding[]> {
    return notYet('la lecture des jetons (prévue avec TonAPI)');
  }

  /**
   * Préparation : état des deux comptes, rebond, avertissements, frais, solde.
   */
  async prepareSend(from: string, request: SendRequest): Promise<SendDraft<TonPayload>> {
    if (request.token) notYet('l’envoi de jetons (prévu avec TonAPI)');
    if (!this.validateAddress(request.to)) throw new WalletError('INVALID_ADDRESS', 'Adresse TON invalide pour ce réseau');
    if (request.amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant nul');

    const sender = await this.client.accountState(from);
    if (sender.status === 'frozen') throw new WalletError('NOT_SUPPORTED', 'TON : compte gelé');
    if (sender.status === 'active' && !sender.version) {
      // Contrat actif que Kalyx ne sait pas signer : mieux vaut refuser que deviner.
      throw new WalletError('NOT_SUPPORTED', `TON : contrat de portefeuille non pris en charge (${sender.walletType ?? 'inconnu'})`);
    }
    const dest: TonAccountState = await this.client.accountState(request.to);

    const deploys = sender.status !== 'active';
    const seqno = sender.seqno ?? 0;
    const friendlyDest = parseTonAddress(request.to);
    const bounce = friendlyDest && !friendlyDest.bounceable ? false : dest.status === 'active';

    const warnings: DraftWarning[] = [];
    if (dest.status !== 'active') warnings.push({ code: 'ACTIVATES_DESTINATION', severity: 'info' });
    if (dest.notWallet) warnings.push({ code: 'DESTINATION_NOT_WALLET', severity: 'warning' });

    const comment = request.memo?.trim() || undefined;
    const fee = await this.estimateFee(from, sender, { seqno, to: request.to, amount: request.amount, bounce, comment });
    if (request.amount + fee > sender.balance) {
      throw new WalletError('INSUFFICIENT_FUNDS', 'Solde TON insuffisant pour le montant et les frais');
    }

    return {
      chainId: this.config.id,
      from,
      to: request.to,
      amount: request.amount,
      token: null,
      fee,
      warnings,
      payload: { seqno, deploys, version: sender.version, bounce, comment, sendMode: TON_SEND_MODE_DEFAULT },
    };
  }

  /**
   * Frais : estimation du nœud + marge d'acheminement pour un compte actif ;
   * estimation fixe et prudente pour un premier envoi. Si le nœud ne répond pas,
   * la marge prudente plutôt qu'un blocage : ce n'est qu'une estimation, le
   * réseau prélève le montant réel.
   */
  private async estimateFee(
    from: string,
    sender: TonAccountState,
    m: { seqno: number; to: string; amount: bigint; bounce: boolean; comment?: string },
  ): Promise<bigint> {
    if (sender.status !== 'active' || !sender.version) return DEPLOY_FEE_ESTIMATE;
    try {
      const body = tonTransferBodyForEstimate(sender.version, {
        seqno: m.seqno,
        validUntil: Math.floor(this.now() / 1000) + VALIDITY_SECONDS,
        messages: [{ to: m.to, amount: m.amount, bounce: m.bounce, comment: m.comment }],
        testnet: this.testnet,
      });
      return (await this.client.estimateFee(from, body)) + FORWARD_FEE_MARGIN;
    } catch {
      return DEPLOY_FEE_ESTIMATE;
    }
  }

  async signSend(draft: SendDraft<TonPayload>, signer: ChainSigner): Promise<SignedSend<TonPayload>> {
    assertCurve(signer, 'ed25519');
    const fromRaw = rawOf(draft.from);
    // La version dont l'adresse EST celle d'envoi, pour la clé du signataire.
    const candidates = draft.payload.version ? [draft.payload.version] : TON_IMPORT_WALLET_VERSIONS;
    const version = candidates.find((v) => toRawTonAddress(tonWalletAddress(signer.publicKey, v, { testnet: this.testnet })) === fromRaw);
    if (!version) throw new WalletError('NOT_SUPPORTED', 'TON : la clé de signature ne correspond pas à l’adresse d’envoi');

    const validUntil = Math.floor(this.now() / 1000) + VALIDITY_SECONDS;
    const built = buildTonTransfer(
      {
        version,
        seqno: draft.payload.seqno,
        validUntil,
        deploy: draft.payload.deploys,
        testnet: this.testnet,
        sendMode: draft.payload.sendMode,
        messages: [{ to: draft.to, amount: draft.amount, bounce: draft.payload.bounce, comment: draft.payload.comment }],
      },
      signer,
    );
    return {
      chainId: this.config.id,
      raw: built.boc,
      txid: built.normalizedHash,
      draft: { ...draft, expiresAt: validUntil * 1000 },
    };
  }

  async broadcastSend(signed: SignedSend<TonPayload>): Promise<BroadcastOutcome> {
    if (!signed.txid) throw new Error('TON : message signé sans hachage');
    await this.client.sendBoc(signed.raw);
    return { txid: signed.txid, expiresAt: signed.draft.expiresAt };
  }

  /**
   * Attend la transaction déclenchée par le message, et lit ses phases.
   *
   * Pas de « diffusé donc réussi ». Introuvable après l'échéance (plus le retard
   * de l'indexeur) : le réseau ne l'appliquera plus, rien n'a été débité.
   */
  async waitForTx(txid: string, hint?: TxWaitHint): Promise<TxState> {
    const deadline = (hint?.expiresAt ?? this.now() + VALIDITY_SECONDS * 1000) + INDEXER_GRACE_MS;
    for (;;) {
      const txs = await this.client.transactionsByMessage(txid).catch(() => null);
      if (txs && txs.length > 0) return this.outcome(txs[0]);
      if (this.now() > deadline) return { status: 'expired' };
      await this.sleep(POLL_MS);
    }
  }

  /**
   * Issue d'une transaction de NOTRE portefeuille. Échec si le calcul a échoué,
   * si l'action d'envoi n'a pas abouti, ou si des actions ont été SAUTÉES : avec
   * le mode `IGNORE_ERRORS`, un envoi sans fonds est ignoré en silence et la
   * phase se dit « réussie ».
   */
  private outcome(tx: TonCenterTx): TxState {
    const d = tx.description ?? {};
    const at = tx.now * 1000;
    if (d.compute_ph?.success === false) return { status: 'failed', reason: `calcul, code ${d.compute_ph.exit_code ?? '?'}` };
    if (d.aborted) return { status: 'failed', reason: 'transaction interrompue' };
    const a = d.action;
    if (a && (a.success === false || a.no_funds || (a.skipped_actions ?? 0) > 0 || (a.result_code ?? 0) !== 0)) {
      return { status: 'failed', reason: a.no_funds || (a.skipped_actions ?? 0) > 0 ? 'fonds insuffisants' : `action, code ${a.result_code ?? '?'}` };
    }
    return { status: 'confirmed', at };
  }

  /*
   * Volontairement ABSENTS, et ce ne sont pas des oublis :
   *
   * — `quoteFees` : les frais TON ne se négocient pas, il n'y a pas de palier.
   * — `prepareAcceleration` / `prepareCancellation` : un message non inclus avant
   *   son échéance expire sans rien débiter. Rien à accélérer, rien à annuler.
   * — `simulate` : à réétudier avec l'émulation TonAPI.
   */
  readonly quoteFees?: (from: string, request: SendRequest) => Promise<FeeQuotes> = undefined;
  readonly prepareAcceleration?: (from: string, pending: PendingRef) => Promise<SendDraft<TonPayload>> = undefined;
  readonly prepareCancellation?: (from: string, pending: PendingRef) => Promise<SendDraft<TonPayload>> = undefined;
}
