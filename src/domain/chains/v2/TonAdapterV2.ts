/**
 * TON (The Open Network) — SQUELETTE. Rien ne fonctionne encore.
 *
 * Chaque opération refuse explicitement, en nommant ce qui manque. Ce n'est pas
 * une politesse : un adapter à moitié écrit qui rend des valeurs plausibles est
 * bien plus dangereux qu'un adapter qui refuse, parce qu'on ne s'en aperçoit
 * qu'une fois les fonds partis.
 *
 * Il n'est enregistré NULLE PART (`v2/registry` ne le fabrique pas, aucune
 * configuration TON n'existe dans `configs`), et ses capacités sont toutes à
 * faux — conformément à la règle posée dans `capabilities.ts` : une capacité
 * décrit ce que la chaîne PEUT faire, jamais ce qu'on a eu le temps
 * d'implémenter. Les capacités VISÉES sont exportées séparément, comme
 * documentation exécutable.
 *
 * Ce fichier sert à deux choses : geler la forme de la charge utile, qui est la
 * vraie décision de conception, et rendre visibles les points d'extension. La
 * réflexion complète est dans `docs/10-TON.md` — à lire avant d'y toucher, il y
 * a trois particularités qui font perdre des fonds.
 */
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
import { WalletError } from '../../errors';
import { capabilities, type ChainCapabilities } from './capabilities';
import type { SignerCurve } from './signer';
import type {
  BroadcastOutcome,
  ChainAdapterV2,
  FeeQuotes,
  PendingRef,
  SendDraft,
  SendRequest,
  SignedSend,
  TokenHolding,
  TxState,
} from './types';

/**
 * Charge utile TON : le message externe et sa fenêtre de validité.
 *
 * `seqno` remplace le nonce, et `validUntil` la péremption — les deux existent
 * déjà dans l'interface v2 (`BroadcastOutcome.opaque` et `SendDraft.expiresAt`),
 * ajoutés en migrant Solana et Bitcoin. Ils n'ont pas été inventés pour TON,
 * mais ils l'attendaient.
 */
export interface TonPayload {
  /** Message externe sérialisé (BOC), en base64. */
  boc: string;
  /** Compteur du contrat de portefeuille au moment de la préparation. */
  seqno: number;
  /** Instant (epoch ms) au-delà duquel le réseau refuse le message. */
  validUntil: number;
  /**
   * Le message embarque-t-il l'état initial du contrat ?
   *
   * Un portefeuille TON n'existe on-chain qu'une fois déployé, et c'est le
   * premier message sortant qui le déploie — à nos frais.
   */
  deploys: boolean;
  /** Adresse du portefeuille de jeton à débiter, pour un transfert de jeton. */
  jettonWallet?: string;
}

/**
 * Capacités VISÉES, une fois l'adapter écrit.
 *
 * Exportées pour servir de cible vérifiable, et parce qu'elles disent des choses
 * non évidentes : TON n'a ni paliers de frais — le réseau les calcule et les
 * prélève, il n'y a rien à négocier — ni accélération ni annulation, un message
 * non inclus avant son `validUntil` expirant sans rien débiter. C'est la même
 * situation que Solana.
 *
 * `memo` et `activatesDestination` sont à VRAI, et ce sont les deux qui comptent :
 * les plateformes d'échange exigent le commentaire pour attribuer un dépôt, et
 * un transfert de jeton déploie le portefeuille de jeton du destinataire.
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

/**
 * Ce qui manque, pour que le refus dise quoi faire plutôt que « non ».
 *
 * Les méthodes qui promettent un `Promise` sont `async` : une méthode déclarée
 * asynchrone mais qui lève de façon SYNCHRONE échappe à tout `.catch()` posé
 * dessus, et fait remonter l'erreur là où personne ne l'attend. La distinction
 * n'a l'air de rien sur un squelette ; elle compte le jour où un écran appelle.
 */
function notYet(what: string): never {
  throw new WalletError(
    'NOT_SUPPORTED',
    `TON : ${what} n'est pas encore implémenté (cf. docs/10-TON.md).`,
  );
}

export class TonAdapterV2 implements ChainAdapterV2<TonPayload> {
  readonly config: ChainConfig;
  /** ed25519, comme Solana — mais PAS la même dérivation (cf. docs/10-TON.md §1). */
  readonly signerCurve: SignerCurve = 'ed25519';

  /**
   * Toutes à faux tant que rien n'est implémenté.
   *
   * Déclarer une capacité sans son code produirait un bouton qui échoue, ce qui
   * est pire que pas de bouton. La cible est dans `TON_TARGET_CAPABILITIES`.
   */
  readonly capabilities: ChainCapabilities = capabilities({});

  constructor(config: ChainConfig) {
    if (config.family !== 'ton') {
      throw new Error(`Config non-TON passée à TonAdapterV2 : ${config.id}`);
    }
    this.config = config;
  }

  /**
   * DÉRIVATION — le point le plus coûteux, et il ne tient pas dans cette classe.
   *
   * TON dérive sa clé de la PHRASE, pas de la graine BIP-39 : un PBKDF2-SHA512
   * avec le sel `TON default seed`, sans chemin de dérivation. `signerFromSeed`
   * reçoit une graine et ne peut donc pas convenir — il faudra un chemin qui
   * remonte jusqu'à `walletStore`, seul détenteur de la phrase.
   *
   * Et l'adresse ne se calcule PAS depuis la clé publique : c'est le hachage de
   * l'état initial du contrat de portefeuille, donc elle dépend de la version
   * choisie (v3R2, v4R2, W5). La même clé donne des adresses différentes.
   */
  deriveAccount(): Account {
    return notYet('la dérivation de compte');
  }

  /**
   * VALIDATION — deux écritures, toutes deux valides.
   *
   * Une adresse TON porte un drapeau « rebondissante » : `EQ…` fait revenir les
   * fonds si le destinataire n'existe pas ou refuse, `UQ…` les laisse sur place.
   * Vérifier seulement le CRC laisserait passer les deux sans rien dire, alors
   * que se tromper de forme fait rebondir un paiement — ou pire.
   *
   * Un drapeau testnet vit dans le même octet : comme pour Bitcoin, une adresse
   * testnet doit être refusée sur le réseau principal.
   */
  validateAddress(): boolean {
    return false;
  }

  async getBalance(): Promise<Balance> {
    return notYet('la lecture du solde');
  }

  async getHistory(): Promise<TxSummary[]> {
    return notYet('l’historique');
  }

  /**
   * JETONS — chaque détenteur a son propre contrat de portefeuille de jeton,
   * dont l'adresse se résout par une méthode `get` sur le contrat maître. Comme
   * le programme d'un mint Token-2022 sur Solana : à lire on-chain, jamais à
   * deviner.
   */
  async listTokens(): Promise<TokenHolding[]> {
    return notYet('la lecture des jetons');
  }

  /**
   * PRÉPARATION. Ce qui devra s'y trouver, et qu'on ne peut pas ajouter après :
   *
   * — le `seqno` lu sur le contrat, et un `validUntil` ;
   * — le commentaire (`request.memo`), qu'une plateforme d'échange EXIGE pour
   *   attribuer un dépôt — sans lui, les fonds arrivent sans propriétaire ;
   * — l'avertissement de déploiement quand le compte du destinataire, ou son
   *   portefeuille de jeton, n'existe pas encore et sera créé à nos frais ;
   * — pour un jeton, le TON attaché pour payer le message : un solde de jeton
   *   sans TON est intransférable, et il faut le dire AVANT.
   */
  async prepareSend(_from: string, _request: SendRequest): Promise<SendDraft<TonPayload>> {
    return notYet('la préparation d’un envoi');
  }

  async signSend(): Promise<SignedSend<TonPayload>> {
    return notYet('la signature');
  }

  async broadcastSend(): Promise<BroadcastOutcome> {
    return notYet('la diffusion');
  }

  /**
   * CONFIRMATION — TON ne rend pas d'identifiant de transaction à la signature.
   *
   * On dispose du hachage du message envoyé ; la transaction qui en résulte
   * porte le sien, connu seulement après inclusion. Deux voies : suivre le
   * `seqno`, ou retrouver la transaction par le hachage du message. La seconde
   * est plus précise et plus bavarde.
   *
   * Ce n'est pas un détail : c'est le seul moyen de ne pas retomber dans
   * « diffusé donc réussi », l'hypothèse qui faisait afficher « envoyé » sur
   * Solana pour une transaction que le réseau avait abandonnée.
   */
  async waitForTx(): Promise<TxState> {
    return notYet('le suivi de transaction');
  }

  /*
   * Volontairement ABSENTS, et ce ne sont pas des oublis :
   *
   * — `quoteFees` : les frais TON ne se négocient pas, le réseau les calcule et
   *   les prélève sur le montant attaché. Il n'y a pas de palier à proposer.
   * — `prepareAcceleration` / `prepareCancellation` : un message non inclus
   *   avant son `validUntil` expire sans rien débiter. Il n'y a rien à
   *   accélérer, rien à annuler.
   * — `simulate` : à réétudier une fois l'émulation de messages en place.
   */
  readonly quoteFees?: (from: string, request: SendRequest) => Promise<FeeQuotes> = undefined;
  readonly prepareAcceleration?: (from: string, pending: PendingRef) => Promise<SendDraft<TonPayload>> =
    undefined;
  readonly prepareCancellation?: (from: string, pending: PendingRef) => Promise<SendDraft<TonPayload>> =
    undefined;
}
