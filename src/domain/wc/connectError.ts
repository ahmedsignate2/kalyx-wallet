/**
 * Échec de connexion d'une dApp, porteur d'un CODE.
 *
 * Ces refus étaient rédigés en français au milieu du magasin WalletConnect. Ils
 * ressortaient donc en français quelle que soit la langue — la même faute que
 * dans le magasin de Pay, dans l'humanisation de l'historique et dans le
 * contrôle des requêtes de transaction Solana. Un module qui ne fait pas
 * d'interface n'écrit pas de phrase : il rend un code, et l'écran le traduit.
 *
 * Le `detail` porte le message technique de la bibliothèque. Il est affiché
 * derrière la phrase traduite, tronqué : sans lui, « réseau non supporté » ne
 * dit pas LEQUEL, et c'est justement l'information qui fait gagner des heures.
 */
export type WcConnectCode =
  /** Aucun compte utilisable dans le portefeuille. */
  | 'NO_ACCOUNT'
  /** La dApp EXIGE un réseau ou une méthode que Kalyx ne fournit pas. */
  | 'UNSUPPORTED_REQUEST'
  /** La dApp ne demande aucun réseau que nous sachions servir. */
  | 'NO_COMPATIBLE_CHAIN'
  /** La proposition a expiré avant l'approbation. */
  | 'PROPOSAL_EXPIRED'
  /** Le relais WalletConnect a refusé l'approbation. */
  | 'REJECTED_BY_RELAY';

export class WcConnectError extends Error {
  constructor(
    readonly code: WcConnectCode,
    readonly detail?: string,
  ) {
    super(`wc connect failed: ${code}`);
    this.name = 'WcConnectError';
  }
}

/** Reconnaissance sûre après un passage de frontière de module. */
export function isWcConnectError(e: unknown): e is WcConnectError {
  return e instanceof WcConnectError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'WcConnectError');
}
