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
import { TonApiClient, type TonApiEvent } from '../ton/tonApi';
import { TON_PROXY_URL } from '../ton/tonProxy';
import { buildTonTransfer, tonExternalForEstimate, tonTransferBodyForEstimate, TON_SEND_MODE_DEFAULT } from '../ton/tonTransfer';
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
 * Marge par message sortant, par PRUDENCE — et voici exactement ce qu'on sait.
 *
 * Mesuré sur nos propres envois réels (réseau de test, 26/09, mode 3) : le coût
 * réel pour l'envoyeur (frais de transaction + acheminement du message sortant)
 * était de 526 870 nanotons, et l'estimation du nœud tombait juste à 0,1 % près
 * — alors que son champ `fwd_fee` affiche 0. Ce qu'on ne peut PAS mesurer sans
 * envoyer sur le réseau principal : si l'estimation y reste aussi juste, alors
 * que l'acheminement y coûte environ HUIT fois plus (540 668 nanotons relevés
 * sur une transaction réelle, contre 66 667 sur le réseau de test).
 *
 * 0,001 TON couvre cet écart éventuel. Surestimer ne coûte qu'un peu de marge
 * au bouton « Max » ; sous-estimer ferait échouer un envoi. L'émulation TonAPI
 * donnera le chiffre exact en production.
 */
const FORWARD_FEE_MARGIN = 1_000_000n;
/**
 * Premier envoi d'un compte non déployé : l'estimation par le nœud exigerait
 * l'état initial, donc la clé publique, que la préparation n'a pas. Estimation
 * fixe et PRUDENTE : le déploiement réel a coûté 1 000 270 nanotons sur le réseau
 * de test (0,001 TON) ; le réseau principal achemine plus cher. À remplacer par
 * l'émulation TonAPI en production.
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
  /**
   * TonAPI par le proxy Kalyx : fournisseur PRINCIPAL. `null` = TON Center seul.
   * Chaque lecture retombe sur TON Center si TonAPI échoue : TON ne dépend
   * jamais d'un seul fournisseur.
   */
  private readonly api: TonApiClient | null;
  private readonly testnet: boolean;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    config: ChainConfig,
    deps: { client?: TonCenterClient; api?: TonApiClient | null; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    if (config.family !== 'ton') {
      throw new Error(`Config non-TON passée à TonAdapterV2 : ${config.id}`);
    }
    this.config = config;
    this.testnet = !!config.testnet;
    this.client = deps.client ?? new TonCenterClient(config.rpcUrls[0] ?? (this.testnet ? 'https://testnet.toncenter.com/api' : 'https://toncenter.com/api'));
    this.api = deps.api !== undefined ? deps.api : new TonApiClient(`${TON_PROXY_URL}/${this.testnet ? 'testnet' : 'mainnet'}`);
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

  /** État d'un compte : TonAPI d'abord, TON Center en repli. */
  private async state(address: string): Promise<TonAccountState & { memoRequired?: boolean }> {
    if (this.api) {
      try {
        return await this.api.accountState(address);
      } catch {
        /* repli ci-dessous */
      }
    }
    return this.client.accountState(address);
  }

  async getBalance(address: string): Promise<Balance> {
    const s = await this.state(address);
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
    if (this.api) {
      try {
        return this.historyFromEvents(address, await this.api.events(address));
      } catch {
        /* repli sur TON Center ci-dessous */
      }
    }
    return this.historyFromTonCenter(address);
  }

  /**
   * Historique TonAPI : des ÉVÉNEMENTS déjà décodés en actions.
   *
   * On retient les transferts de TON qui concernent ce compte. Un événement peut
   * en contenir dans les DEUX sens : c'est un REBOND quand l'argent entré repart
   * vers son expéditeur — relevé sur un vrai compte : un dépôt rebondissant
   * reçu avant le déploiement est renvoyé automatiquement. Le compter comme un
   * envoi affichait un « envoi » que l'utilisateur n'a jamais fait. On montre
   * alors le NET reçu, marqué `BOUNCE`.
   */
  private historyFromEvents(address: string, events: TonApiEvent[]): TxSummary[] {
    const me = rawOf(address);
    const show = (raw?: string) => {
      const a = raw ? parseRawTonAddress(raw.toLowerCase()) : null;
      return a ? formatTonAddress(a, { bounceable: false, testnet: this.testnet }) : raw ?? '';
    };
    const out: TxSummary[] = [];
    for (const e of events) {
      const transfers = e.actions.filter((a) => a.type === 'TonTransfer' && a.TonTransfer).map((a) => ({ ...a.TonTransfer!, ok: a.status === 'ok' }));
      const sent = transfers.filter((t) => rawOf(t.sender?.address ?? '') === me);
      const received = transfers.filter((t) => rawOf(t.recipient?.address ?? '') === me && rawOf(t.sender?.address ?? '') !== me);
      if (!sent.length && !received.length) continue;
      const sum = (l: typeof transfers) => l.reduce((s, t) => s + BigInt(String(t.amount ?? 0)), 0n);
      const inSenders = new Set(received.map((t) => rawOf(t.sender?.address ?? '')));
      const isBounce = received.length > 0 && sent.length > 0 && sent.every((t) => inSenders.has(rawOf(t.recipient?.address ?? '')));
      const base = {
        chain: this.config.id,
        hash: e.event_id,
        timestamp: e.timestamp,
        asset: this.config.nativeSymbol,
        decimals: this.config.nativeDecimals,
        status: (e.in_progress ? 'pending' : transfers.every((t) => t.ok) ? 'success' : 'failed') as TxSummary['status'],
      };
      if (isBounce || !sent.length) {
        const value = isBounce ? sum(received) - sum(sent) : sum(received);
        out.push({ ...base, from: show(received[0].sender?.address), to: address, value: value > 0n ? value : 0n, direction: 'in', type: isBounce ? 'BOUNCE' : 'TRANSFER', description: received[0].comment ?? undefined });
        continue;
      }
      const first = sent[0];
      out.push({
        ...base,
        from: address,
        to: show(first.recipient?.address),
        value: sum(sent),
        direction: rawOf(first.recipient?.address ?? '') === me ? 'self' : 'out',
        type: 'TRANSFER',
        description: first.comment ?? undefined,
        // L'identifiant rendu juste après l'envoi : le suivi le retrouve directement.
        messageHash: e.ext_msg_hash?.toLowerCase(),
      });
    }
    return out;
  }

  private async historyFromTonCenter(address: string): Promise<TxSummary[]> {
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
          messageHash: inm?.hash_norm ? hex.encode(base64.decode(inm.hash_norm)) : undefined,
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

    const sender = await this.state(from);
    if (sender.status === 'frozen') throw new WalletError('NOT_SUPPORTED', 'TON : compte gelé');
    if (sender.status === 'active' && !sender.version) {
      // Contrat actif que Kalyx ne sait pas signer : mieux vaut refuser que deviner.
      throw new WalletError('NOT_SUPPORTED', `TON : contrat de portefeuille non pris en charge (${sender.walletType ?? 'inconnu'})`);
    }
    const dest = await this.state(request.to);

    const deploys = sender.status !== 'active';
    const seqno = sender.seqno ?? 0;
    const friendlyDest = parseTonAddress(request.to);
    const bounce = friendlyDest && !friendlyDest.bounceable ? false : dest.status === 'active';

    const warnings: DraftWarning[] = [];
    if (dest.status !== 'active') warnings.push({ code: 'ACTIVATES_DESTINATION', severity: 'info' });
    if (dest.notWallet) warnings.push({ code: 'DESTINATION_NOT_WALLET', severity: 'warning' });
    // TonAPI sait quelles adresses EXIGENT un commentaire (plateformes d'échange) :
    // sans lui, le dépôt arriverait sans propriétaire.
    if (dest.memoRequired && !request.memo?.trim()) warnings.push({ code: 'MEMO_REQUIRED', severity: 'danger' });

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
    const validUntil = Math.floor(this.now() / 1000) + VALIDITY_SECONDS;
    const messages = [{ to: m.to, amount: m.amount, bounce: m.bounce, comment: m.comment }];
    // Frais EXACTS : émulation TonAPI (signature à zéro), sans marge.
    if (this.api) {
      try {
        return await this.api.emulateFee(tonExternalForEstimate(sender.version, from, { seqno: m.seqno, validUntil, messages, testnet: this.testnet }));
      } catch {
        /* repli : estimation TON Center + marge */
      }
    }
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
    if (this.api) {
      try {
        await this.api.sendBoc(signed.raw);
        return { txid: signed.txid, expiresAt: signed.draft.expiresAt };
      } catch (e) {
        // Un REFUS du message est définitif : il le serait ailleurs aussi. Seul
        // un proxy injoignable justifie de passer par TON Center — rediffuser le
        // même BOC est sans risque, le seqno empêche toute double exécution.
        if (!(e instanceof WalletError) || e.code !== 'RPC_UNAVAILABLE') throw e;
      }
    }
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
      const found = await this.lookupMessage(txid);
      if (found) return found.state;
      if (this.now() > deadline) return { status: 'expired' };
      await this.sleep(POLL_MS);
    }
  }

  /**
   * La transaction déclenchée par un message : TonAPI d'abord, TON Center en
   * repli. `null` tant qu'elle n'est pas indexée.
   */
  private async lookupMessage(msgHash: string): Promise<{ hash: string; state: TxState } | null> {
    if (this.api) {
      try {
        const t = await this.api.transactionByMessage(msgHash);
        if (!t) return null;
        return { hash: t.hash, state: t.ok ? { status: 'confirmed', at: t.utime * 1000 } : { status: 'failed', reason: t.reason } };
      } catch {
        /* repli ci-dessous */
      }
    }
    const txs = await this.client.transactionsByMessage(msgHash).catch(() => null);
    if (!txs?.length) return null;
    return { hash: hex.encode(base64.decode(txs[0].hash)), state: this.outcome(txs[0]) };
  }

  /**
   * Hachage de la TRANSACTION déclenchée par un message — pour l'écran de suivi,
   * qui reçoit juste après un envoi le hachage du message et cherche ensuite la
   * transaction dans l'historique. `null` tant qu'elle n'est pas indexée.
   */
  async transactionHashForMessage(msgHash: string): Promise<string | null> {
    return (await this.lookupMessage(msgHash))?.hash ?? null;
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
