/**
 * Interface de chaîne, version 2.
 *
 * POURQUOI LA REFAIRE. La v1 est modelée sur l'EVM : elle impose
 * `prepareTransfer` / `signTransaction` / `broadcast` avec un `UnsignedTx` qui
 * parle de nonce et de gaz. Bitcoin et Solana ne peuvent pas l'honorer — les
 * trois méthodes y lèvent `NOT_SUPPORTED` — et passent par des méthodes maison
 * (`sendBitcoinDetailed`, `sendSolana`, `sendSplToken`). Résultat : `walletStore`
 * aiguille sur `instanceof`, et chaque chaîne ajoutée rallonge ce branchement.
 *
 * CE QUE LA MATRICE DE COUVERTURE MONTRE (docs/09) : le PIPELINE est universel —
 * préparer, signer, diffuser, confirmer — mais la CHARGE UTILE ne l'est pas. Un
 * objet de transaction et un nonce en EVM ; une sélection d'UTXO et un PSBT en
 * Bitcoin ; un message et un blockhash en Solana. TON ajoutera un `seqno` et des
 * cellules, Cosmos un `SignDoc` avec numéro de compte et séquence.
 *
 * D'où la forme retenue : pipeline typé, charge utile OPAQUE. L'interface
 * transporte ce dont l'écran a besoin pour décider — montant, frais, avertis-
 * sements, péremption — et laisse le reste dans un `payload` que seule la chaîne
 * comprend.
 *
 * La v1 reste en place pendant la migration : EVM d'abord, puis Solana, puis
 * Bitcoin. À aucun moment le portefeuille ne doit être à moitié converti sans
 * fonctionner.
 */
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
import type { ChainCapabilities } from './capabilities';
import type { ChainSigner, SignerCurve } from './signer';

/** Palier de rapidité choisi par l'utilisateur. */
export type SendSpeed = 'slow' | 'normal' | 'fast';

/**
 * Référence d'un actif transféré, ou `null` pour la pièce native.
 *
 * `id` est OPAQUE et propre à la chaîne : adresse de contrat en EVM, mint en
 * Solana, dénomination IBC en Cosmos, adresse du jetton maître en TON. L'écran
 * d'envoi n'a pas à savoir laquelle de ces formes il manipule — c'est ce qui lui
 * évite d'être recâblé à chaque chaîne.
 */
export interface TokenRef {
  id: string;
  symbol: string;
  decimals: number;
}

/** Solde d'un actif détenu. */
export interface TokenHolding extends TokenRef {
  /** Unités de base. */
  raw: bigint;
  name?: string;
  logo?: string;
}

/**
 * Avertissement attaché à un brouillon.
 *
 * Un CODE et des paramètres, jamais un texte : le message doit être traduit, et
 * un domaine pur n'a pas à connaître la langue de l'utilisateur. C'est
 * exactement l'erreur qui avait laissé la feuille de confirmation du scanner en
 * français quelle que soit la langue choisie.
 */
export interface DraftWarning {
  code:
    /** Le destinataire est un contrat / programme, pas un portefeuille. */
    | 'DESTINATION_NOT_WALLET'
    /** Le transfert créera et financera un compte chez le destinataire. */
    | 'ACTIVATES_DESTINATION'
    /** Le jeton lui-même prélève : le destinataire recevra moins. */
    | 'TOKEN_TRANSFER_FEE'
    /** Adresse jamais utilisée auparavant depuis ce portefeuille. */
    | 'NEW_DESTINATION'
    /** Le mémo est exigé par le destinataire et manque. */
    | 'MEMO_REQUIRED';
  severity: 'info' | 'warning' | 'danger';
  /** Valeurs à injecter dans le message traduit. */
  params?: Record<string, string>;
}

/** Ce que l'utilisateur demande. Identique sur toutes les chaînes. */
export interface SendRequest {
  to: string;
  /** Unités de base de l'actif envoyé. */
  amount: bigint;
  /** `null` = pièce native. */
  token?: TokenRef | null;
  speed?: SendSpeed;
  /**
   * Mémo / commentaire transporté avec le transfert.
   *
   * Présent dès maintenant alors qu'aucune chaîne actuelle ne l'utilise : les
   * plateformes d'échange l'EXIGENT sur Cosmos et sur TON pour créditer le bon
   * compte, et l'oublier fait perdre les fonds. L'ajouter après coup
   * obligerait à rouvrir tout le chemin d'envoi, de l'écran au signataire.
   */
  memo?: string;
}

/**
 * Transaction prête à signer.
 *
 * `payload` est opaque au reste de l'app. Tout ce que l'interface doit montrer
 * ou vérifier est remonté à plat, pour qu'aucun écran n'ait à ouvrir la boîte.
 */
export interface SendDraft<P = unknown> {
  chainId: string;
  from: string;
  to: string;
  /** Montant envoyé, en unités de base de l'actif. */
  amount: bigint;
  token: TokenRef | null;
  /** Frais, TOUJOURS en pièce native de la chaîne. */
  fee: bigint;
  /**
   * Ce que le destinataire recevra, si ce n'est pas `amount`.
   *
   * Renseigné quand la chaîne ou le jeton prélève au passage (extension de
   * frais Token-2022). Sans ce champ, l'app annonce un montant et un autre
   * arrive, et l'utilisateur croit que le portefeuille a perdu la différence.
   */
  amountReceived?: bigint;
  warnings: DraftWarning[];
  /**
   * Instant au-delà duquel le brouillon n'est plus diffusable.
   *
   * Un blockhash Solana périme en une minute, un `timeout_height` Cosmos et un
   * `seqno` TON de même. En EVM il n'y a pas de péremption : le champ reste
   * vide. L'avoir dès maintenant évite qu'un écran affiche un brouillon mort.
   */
  expiresAt?: number;
  /** Charge utile propre à la chaîne. Personne d'autre ne l'ouvre. */
  payload: P;
}

/** Transaction signée, prête à diffuser. */
export interface SignedSend<P = unknown> {
  chainId: string;
  /** Forme filaire attendue par le réseau (hex, base64, selon la chaîne). */
  raw: string;
  /**
   * Identifiant connu AVANT diffusion, quand la chaîne le permet.
   *
   * Bitcoin et Solana le connaissent dès la signature ; l'EVM aussi. Le garder
   * ici permet de suivre une transaction même si la diffusion expire côté
   * réseau alors qu'elle a été acceptée.
   */
  txid?: string;
  draft: SendDraft<P>;
}

/** Résultat d'une diffusion. */
export interface BroadcastOutcome {
  txid: string;
  /** Au-delà, cesser d'attendre : la transaction ne sera plus incluse. */
  expiresAt?: number;
  /**
   * Repère de péremption propre à la chaîne, rendu tel quel à `waitForTx`.
   *
   * Une horloge ne suffit pas : Solana raisonne en HAUTEUR DE BLOC, et c'est la
   * seule preuve qu'une transaction non vue ne passera jamais — sinon on ne sait
   * pas distinguer « pas encore incluse » d'« abandonnée ». Cosmos aura son
   * `timeout_height`, TON son `seqno`. Sans ce champ, l'attente se terminait par
   * un simple délai, donc l'utilisateur restait une minute devant un écran qui
   * ne savait rien lui dire.
   */
  opaque?: unknown;
}

/** Ce que `waitForTx` reçoit en plus de l'identifiant. */
export interface TxWaitHint {
  expiresAt?: number;
  /** Le `opaque` rendu par `broadcastSend`. */
  opaque?: unknown;
}

/**
 * Désignation d'une transaction en attente, pour la remplacer.
 *
 * L'identifiant NE SUFFIT PAS partout. En EVM, l'adapter retrouve tout sur la
 * chaîne à partir du hash. En Bitcoin, non : un remplacement doit reprendre
 * exactement les mêmes entrées, or les UTXO dépensés disparaissent aussitôt de
 * l'ensemble des UTXO disponibles — ils sont irrécupérables après coup. C'est
 * donc l'appelant, qui les a conservés au moment de la diffusion, qui les
 * redonne ici.
 *
 * Cosmos et TON tomberont du même côté que l'EVM (numéro de séquence lisible
 * on-chain), mais le champ existe pour que ce ne soit pas une surprise.
 */
export interface PendingRef {
  txid: string;
  /** Contexte conservé par l'appelant depuis la diffusion. */
  opaque?: unknown;
}

/** État d'une transaction diffusée. */
export type TxState =
  | { status: 'pending' }
  | { status: 'confirmed'; at?: number }
  /** Incluse puis rejetée à l'exécution. */
  | { status: 'failed'; reason?: string }
  /** Jamais incluse et plus incluable. Les fonds n'ont pas bougé. */
  | { status: 'expired' };

/** Frais proposés pour un palier. */
export interface FeeQuote {
  /** Coût estimé, en pièce native. */
  cost: bigint;
  /**
   * Paramètre de frais propre à la chaîne (sat/vB, gasPrice, µlamports/CU).
   * Rendu tel quel à `prepareSend` pour que le choix soit honoré à l'identique.
   */
  opaque: unknown;
}

export type FeeQuotes = Record<SendSpeed, FeeQuote>;

/**
 * Adapter de chaîne, version 2.
 *
 * Les méthodes OBLIGATOIRES sont celles que les trois chaînes actuelles savent
 * toutes faire — donc celles qu'une chaîne nouvelle doit fournir pour être
 * utilisable. Tout le reste est optionnel ET annoncé par `capabilities` : une
 * méthode présente sans sa capacité déclarée ne sera jamais appelée, une
 * capacité déclarée sans sa méthode est un bogue que le typage attrape.
 */
export interface ChainAdapterV2<P = unknown> {
  readonly config: ChainConfig;
  readonly capabilities: ChainCapabilities;
  /**
   * Courbe attendue du signataire.
   *
   * C'est ce que `walletStore` lit pour savoir quoi dériver : lui seul détient
   * la seed, et il ne passe à l'adapter que le matériel de signature.
   */
  readonly signerCurve: SignerCurve;

  // ── Lecture ────────────────────────────────────────────────────────────────
  deriveAccount(seed: Uint8Array, index?: number): Account;
  validateAddress(address: string): boolean;
  getBalance(address: string): Promise<Balance>;
  getHistory(address: string): Promise<TxSummary[]>;

  // ── Envoi : préparer → signer → diffuser → confirmer ───────────────────────
  /**
   * Construit un brouillon SANS rien signer ni envoyer.
   *
   * C'est ici que se font tous les refus : adresse invalide, montant sous le
   * seuil de poussière, solde insuffisant frais compris. Refuser avant la
   * signature, c'est refuser avant que l'utilisateur engage quoi que ce soit.
   */
  prepareSend(from: string, request: SendRequest): Promise<SendDraft<P>>;
  /** Signe un brouillon. Le signataire est effacé par l'appelant, pas ici. */
  signSend(draft: SendDraft<P>, signer: ChainSigner): Promise<SignedSend<P>>;
  broadcastSend(signed: SignedSend<P>): Promise<BroadcastOutcome>;
  /**
   * Suit une transaction jusqu'à son issue.
   *
   * Obligatoire, y compris là où « diffusée » a longtemps valu « réussie » :
   * c'est précisément l'hypothèse qui faisait afficher « envoyé » sur Solana
   * pour une transaction abandonnée par le réseau.
   */
  waitForTx(txid: string, hint?: TxWaitHint): Promise<TxState>;

  // ── Optionnels, gouvernés par `capabilities` ───────────────────────────────
  /** `capabilities.feeTiers` */
  quoteFees?(from: string, request: SendRequest): Promise<FeeQuotes>;
  /** `capabilities.tokens` */
  listTokens?(address: string): Promise<TokenHolding[]>;
  /** `capabilities.accelerate` */
  prepareAcceleration?(from: string, pending: PendingRef, speed?: SendSpeed): Promise<SendDraft<P>>;
  /** `capabilities.cancel` */
  prepareCancellation?(from: string, pending: PendingRef, speed?: SendSpeed): Promise<SendDraft<P>>;
  /** `capabilities.messageSigning !== 'none'` */
  signMessage?(message: string, signer: ChainSigner, variant?: string): Promise<string>;
  /** `capabilities.simulation` */
  simulate?(draft: SendDraft<P>): Promise<{ ok: boolean; reason?: string }>;
}
