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
import { formatInputAmount } from '../../validation/format';
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
import { TonApiClient, type TonApiEvent, type TonEmulation } from '../ton/tonApi';
import type { DappTransaction } from '../../tonconnect/requests';
import { TON_PROXY_URL } from '../ton/tonProxy';
import { buildTonTransfer, tonExternalForEstimate, tonTransferBodyForEstimate, TON_SEND_MODE_DEFAULT, type TonTransferMessage } from '../ton/tonTransfer';
import { tonWalletAddress, TON_IMPORT_WALLET_VERSIONS, type TonWalletVersion } from '../ton/tonWallet';
import type { TonNft } from '../ton/tonNfts';
import { TONSTAKERS_POOL, type TonstakersPool } from '../ton/tonstakers';
import { jettonTransferBody, rawJettonAddress, JETTON_TRANSFER_TON, type TonJettonBalance } from '../ton/tonJettons';

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
  /** Adresse (brute) de NOTRE portefeuille de jeton : présente = transfert de jetton. */
  jettonWallet?: string;
  /** Échéance imposée par une facture (secondes) : le message expire au plus tard à ce moment. */
  expiresAt?: number;
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

/** Brouillon d'une transaction de dApp : état du compte et ce qu'elle ferait. */
export interface DappDraft {
  from: string;
  tx: DappTransaction;
  seqno: number;
  deploys: boolean;
  version?: TonWalletVersion;
  balance: bigint;
  /** Émulation TonAPI ; null si indisponible (compte non déployé, TonAPI muet). */
  emulation: TonEmulation | null;
}

function dappMessages(tx: DappTransaction): TonTransferMessage[] {
  return tx.messages.map((m) => ({ to: m.to, amount: m.amount, bounce: m.bounce, payload: m.payload, init: m.init }));
}

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
   * Ce qui fonctionne VRAIMENT, et rien d'autre : le commentaire, et les jettons
   * quand TonAPI est là (TON Center ne décrit pas les soldes de jetons). La
   * signature de message et les réseaux personnalisés viendront avec leur code —
   * une capacité déclarée sans son code produirait un bouton qui échoue.
   */
  readonly capabilities: ChainCapabilities;

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
    this.capabilities = capabilities({ memo: true, tokens: !!this.api, tokenSend: !!this.api, activatesDestination: true });
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
      if (!sent.length && !received.length) {
        const row = this.jettonRow(address, me, e, show);
        if (row) out.push(row);
        continue;
      }
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

  /**
   * Transfert de jetton de l'événement, s'il concerne ce compte.
   *
   * Un jetton REÇU sans vérification (`none`) n'est pas montré : c'est la forme
   * des airdrops d'arnaque — le relevé contient un faux « Tethe USD » envoyé
   * ainsi. Un jetton ENVOYÉ l'est toujours : l'utilisateur doit voir ce qu'il a
   * fait. Un événement signalé comme arnaque, ou un jeton en liste noire,
   * jamais.
   */
  private jettonRow(address: string, me: string | null, e: TonApiEvent, show: (raw?: string) => string): TxSummary | null {
    if (e.is_scam) return null;
    for (const a of e.actions) {
      const j = a.type === 'JettonTransfer' ? a.JettonTransfer : undefined;
      if (!j?.jetton || !/^\d+$/.test(String(j.amount ?? ''))) continue;
      const verification = j.jetton.verification;
      if (verification === 'blacklist') continue;
      const out = rawOf(j.sender?.address ?? '') === me;
      const incoming = rawOf(j.recipient?.address ?? '') === me;
      if (!out && !incoming) continue;
      if (!out && verification !== 'whitelist') continue;
      const decimals = Number(j.jetton.decimals);
      if (!Number.isInteger(decimals)) continue;
      return {
        chain: this.config.id,
        hash: e.event_id,
        timestamp: e.timestamp,
        from: out ? address : show(j.sender?.address),
        to: incoming ? address : show(j.recipient?.address),
        value: BigInt(String(j.amount)),
        direction: out && incoming ? 'self' : out ? 'out' : 'in',
        status: e.in_progress ? 'pending' : a.status === 'ok' ? 'success' : 'failed',
        type: 'TRANSFER',
        asset: j.jetton.symbol ?? '?',
        decimals,
        ...(j.jetton.address ? { contract: String(j.jetton.address) } : {}),
        description: j.comment ?? undefined,
        messageHash: out ? e.ext_msg_hash?.toLowerCase() : undefined,
      };
    }
    return null;
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

  /** Soldes de jettons, prix dans `currency` ; listes noires déjà écartées. */
  async jettons(address: string, currency = 'usd'): Promise<TonJettonBalance[]> {
    if (!this.api) return notYet('la lecture des jetons sans TonAPI');
    return this.api.jettons(address, currency);
  }

  /** Tonstakers : pool (APY, minimum, tsTON) et valeur d'1 tsTON en TON. */
  async tonstakers(): Promise<{ pool: TonstakersPool; poolAddress: string; tsTonInTon: number | null }> {
    if (!this.api) return notYet('le staking sans TonAPI');
    const poolAddress = this.testnet ? TONSTAKERS_POOL.testnet : TONSTAKERS_POOL.mainnet;
    const pool = await this.api.stakingPool(poolAddress);
    return { pool, poolAddress, tsTonInTon: await this.api.priceInTon(pool.tsTonMaster).catch(() => null) };
  }

  /** Métadonnées d'un jetton (symbole, décimales, vérification), ou null. */
  async jettonInfo(master: string): Promise<{ symbol: string; decimals: number; verified: boolean } | null> {
    return this.api ? this.api.jettonInfo(master) : null;
  }

  /** NFT détenus, domaines .ton compris ; vide sans TonAPI. */
  async nfts(address: string): Promise<TonNft[]> {
    return this.api ? this.api.nfts(address) : [];
  }

  /** Nom .ton → adresse conviviale, ou null. Sans TonAPI : null (pas de résolveur de repli). */
  async resolveDomain(name: string): Promise<string | null> {
    return this.api ? this.api.resolveDomain(name, this.testnet) : null;
  }

  /** Portefeuille (brut) du jetton `master` DÉTENU par `owner`, lu dans ses soldes (TonAPI) ; null s'il n'en a pas. */
  async ownJettonWallet(owner: string, master: string): Promise<string | null> {
    if (!this.api) return null;
    const m = rawJettonAddress(master);
    const j = (await this.api.jettons(owner)).find((x) => x.master === m);
    return j ? rawJettonAddress(j.wallet) : null;
  }

  /** Portefeuille (brut) du jetton `master` de n'importe quel compte, lu sur la chaîne (vérification d'un tiers). */
  async jettonWalletOf(owner: string, master: string): Promise<string | null> {
    if (!this.api) return null;
    const a = await this.api.jettonWalletOf(owner, master);
    return a ? rawJettonAddress(a) : null;
  }

  async listTokens(address: string): Promise<TokenHolding[]> {
    return (await this.jettons(address)).map((j) => ({ id: j.master, symbol: j.symbol, decimals: j.decimals, raw: j.raw, name: j.name, logo: j.image }));
  }

  /**
   * Préparation : état des deux comptes, rebond, avertissements, frais, solde.
   */
  async prepareSend(from: string, request: SendRequest): Promise<SendDraft<TonPayload>> {
    if (request.token) return this.prepareJettonSend(from, request);
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
      throw new WalletError('INSUFFICIENT_FUNDS', 'Solde TON insuffisant pour le montant et les frais', {
        have: formatInputAmount(sender.balance, 9),
        fee: formatInputAmount(fee, 9),
        symbol: 'TON',
      });
    }

    return {
      chainId: this.config.id,
      from,
      to: request.to,
      amount: request.amount,
      token: null,
      fee,
      warnings,
      payload: { seqno, deploys, version: sender.version, bounce, comment, sendMode: TON_SEND_MODE_DEFAULT, expiresAt: request.expiresAt },
    };
  }

  /**
   * Envoi d'un jetton : un message à NOTRE portefeuille de jeton, qui débite et
   * transmet au destinataire (TEP-74, `tonJettons.ts`).
   *
   * Le montant du brouillon est en unités du JETON ; les frais, en TON. Le
   * message emporte JETTON_TRANSFER_TON pour le gaz ; l'excédent revient. Il
   * faut donc avoir ce TON-là, en plus des frais, même si le coût réel est
   * moindre — sinon le portefeuille de jeton rejette le transfert.
   */
  private async prepareJettonSend(from: string, request: SendRequest): Promise<SendDraft<TonPayload>> {
    const token = request.token!;
    if (!this.api) notYet('l’envoi de jetons sans TonAPI');
    if (!this.validateAddress(request.to)) throw new WalletError('INVALID_ADDRESS', 'Adresse TON invalide pour ce réseau');
    if (request.amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant nul');
    const master = rawJettonAddress(token.id);
    if (!master) throw new WalletError('INVALID_ADDRESS', 'TON : identifiant de jeton invalide');

    const [sender, dest, held] = await Promise.all([this.state(from), this.state(request.to), this.api!.jettons(from)]);
    const jetton = held.find((j) => j.master === master);
    if (!jetton || jetton.raw < request.amount) throw new WalletError('INSUFFICIENT_FUNDS', 'Solde de jeton insuffisant');
    // Montant brut calculé avec les décimales de l'écran : elles doivent être celles du jeton (voir EvmAdapterV2).
    if (token.decimals !== jetton.decimals) {
      throw new WalletError('INVALID_AMOUNT', `Décimales du jeton incohérentes (${token.decimals} ≠ ${jetton.decimals})`);
    }
    if (sender.status === 'frozen') throw new WalletError('NOT_SUPPORTED', 'TON : compte gelé');
    if (sender.status === 'active' && !sender.version) {
      throw new WalletError('NOT_SUPPORTED', `TON : contrat de portefeuille non pris en charge (${sender.walletType ?? 'inconnu'})`);
    }

    const warnings: DraftWarning[] = [];
    if (dest.notWallet) warnings.push({ code: 'DESTINATION_NOT_WALLET', severity: 'warning' });
    if (dest.memoRequired && !request.memo?.trim()) warnings.push({ code: 'MEMO_REQUIRED', severity: 'danger' });

    const deploys = sender.status !== 'active';
    const seqno = sender.seqno ?? 0;
    const comment = request.memo?.trim() || undefined;
    const payload = jettonTransferBody({ amount: request.amount, to: request.to, responseTo: from, comment, queryId: 0n, testnet: this.testnet });
    const message = { to: jetton.wallet, amount: JETTON_TRANSFER_TON, bounce: true, payload };

    // Frais : émulation (coût NET, excédent rendu compris) ; à défaut, tout le TON joint.
    let fee = JETTON_TRANSFER_TON;
    if (!deploys && sender.version) {
      try {
        const validUntil = Math.floor(this.now() / 1000) + VALIDITY_SECONDS;
        fee = await this.api!.emulateFee(tonExternalForEstimate(sender.version, from, { seqno, validUntil, messages: [message], testnet: this.testnet }));
      } catch {
        /* estimation prudente ci-dessus */
      }
    }
    const needed = JETTON_TRANSFER_TON + (deploys ? DEPLOY_FEE_ESTIMATE : FORWARD_FEE_MARGIN);
    if (sender.balance < needed) throw new WalletError('INSUFFICIENT_FUNDS', 'Pas assez de TON pour les frais du jeton');

    return {
      chainId: this.config.id,
      from,
      to: request.to,
      amount: request.amount,
      token: { id: master, symbol: jetton.symbol, decimals: jetton.decimals },
      fee,
      warnings,
      payload: { seqno, deploys, version: sender.version, bounce: true, comment, sendMode: TON_SEND_MODE_DEFAULT, jettonWallet: jetton.wallet, expiresAt: request.expiresAt },
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

    const nowS = Math.floor(this.now() / 1000);
    // Une facture expirée n'est pas signée ; sinon le message expire avec elle.
    if (draft.payload.expiresAt !== undefined && draft.payload.expiresAt <= nowS) {
      throw new WalletError('TX_EXPIRED', 'TON : la demande de paiement a expiré');
    }
    const validUntil = Math.min(nowS + VALIDITY_SECONDS, draft.payload.expiresAt ?? Infinity);
    const built = buildTonTransfer(
      {
        version,
        seqno: draft.payload.seqno,
        validUntil,
        deploy: draft.payload.deploys,
        testnet: this.testnet,
        sendMode: draft.payload.sendMode,
        messages: [this.outgoing(draft)],
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

  /** Message sortant du brouillon : TON au destinataire, ou transfert à notre portefeuille de jeton. */
  private outgoing(draft: SendDraft<TonPayload>) {
    const p = draft.payload;
    if (!p.jettonWallet) return { to: draft.to, amount: draft.amount, bounce: p.bounce, comment: p.comment };
    const payload = jettonTransferBody({
      amount: draft.amount,
      to: draft.to,
      responseTo: draft.from,
      comment: p.comment,
      // Identifiant de requête : l'heure, pour distinguer deux envois identiques.
      queryId: BigInt(this.now()),
      testnet: this.testnet,
    });
    return { to: p.jettonWallet, amount: JETTON_TRANSFER_TON, bounce: true, payload };
  }

  /**
   * Transaction demandée par une dApp (TON Connect), déjà validée par
   * `parseSendTransaction`. On lit l'état du compte, puis on ÉMULE le message
   * complet : l'utilisateur voit ce qui sort réellement du portefeuille, pas
   * ce que la dApp prétend.
   */
  async prepareDappTransfer(from: string, tx: DappTransaction): Promise<DappDraft> {
    const sender = await this.state(from);
    if (sender.status === 'frozen') throw new WalletError('NOT_SUPPORTED', 'TON : compte gelé');
    if (sender.status === 'active' && !sender.version) {
      throw new WalletError('NOT_SUPPORTED', `TON : contrat de portefeuille non pris en charge (${sender.walletType ?? 'inconnu'})`);
    }
    const deploys = sender.status !== 'active';
    const seqno = sender.seqno ?? 0;
    const draft: DappDraft = { from, tx, seqno, deploys, version: sender.version, balance: sender.balance, emulation: null };
    if (this.api && sender.version && !deploys) {
      try {
        const validUntil = Math.floor(this.now() / 1000) + VALIDITY_SECONDS;
        draft.emulation = await this.api.emulate(
          tonExternalForEstimate(sender.version, from, { seqno, validUntil, messages: dappMessages(tx), testnet: this.testnet }),
        );
      } catch {
        /* sans émulation : l'écran le dit, et montre les montants bruts */
      }
    }
    return draft;
  }

  /**
   * Signe la transaction d'une dApp. L'échéance est la plus proche entre celle
   * de la dApp et la nôtre (5 min) : ni un message valable indéfiniment, ni un
   * message qui survivrait à ce que la dApp a demandé.
   */
  async signDappTransfer(draft: DappDraft, signer: ChainSigner): Promise<{ boc: string; txid: string; expiresAt: number }> {
    assertCurve(signer, 'ed25519');
    const fromRaw = rawOf(draft.from);
    const candidates = draft.version ? [draft.version] : TON_IMPORT_WALLET_VERSIONS;
    const version = candidates.find((v) => toRawTonAddress(tonWalletAddress(signer.publicKey, v, { testnet: this.testnet })) === fromRaw);
    if (!version) throw new WalletError('NOT_SUPPORTED', 'TON : la clé de signature ne correspond pas à l’adresse d’envoi');
    const ours = Math.floor(this.now() / 1000) + VALIDITY_SECONDS;
    const validUntil = draft.tx.validUntil ? Math.min(draft.tx.validUntil, ours) : ours;
    const built = buildTonTransfer(
      { version, seqno: draft.seqno, validUntil, deploy: draft.deploys, testnet: this.testnet, sendMode: TON_SEND_MODE_DEFAULT, messages: dappMessages(draft.tx) },
      signer,
    );
    return { boc: built.boc, txid: built.normalizedHash, expiresAt: validUntil * 1000 };
  }

  /** Diffuse le BOC signé d'une transaction de dApp (mêmes replis qu'un envoi). */
  async broadcastDapp(signed: { boc: string; txid: string; expiresAt: number }): Promise<void> {
    await this.broadcastSend({ chainId: this.config.id, raw: signed.boc, txid: signed.txid, draft: { expiresAt: signed.expiresAt } as never });
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
