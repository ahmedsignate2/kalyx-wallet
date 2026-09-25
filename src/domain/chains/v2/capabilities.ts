/**
 * Ce qu'une chaîne sait faire, DÉCLARÉ plutôt que deviné.
 *
 * Aujourd'hui l'interface teste la classe concrète : `a instanceof
 * EvmChainAdapter` pour les paliers de frais, `instanceof SolanaChainAdapter`
 * pour les jetons SPL, `chain.family === 'evm'` pour le bouton Accélérer. Chaque
 * chaîne ajoutée oblige à retrouver ces tests un par un, dispersés dans les
 * écrans — et celui qu'on oublie ne casse rien, il fait juste disparaître un
 * bouton sans que personne ne s'en aperçoive.
 *
 * Une capacité déclarée inverse la charge : l'écran demande « sait-elle
 * accélérer ? », l'adapter répond, et une chaîne nouvelle est complète le jour
 * où elle remplit cet objet.
 *
 * RÈGLE : une capacité décrit ce que la chaîne PEUT faire, jamais ce qu'on a eu
 * le temps d'implémenter. Déclarer `accelerate: true` sans le code derrière
 * produit un bouton qui échoue — c'est pire que pas de bouton.
 */

/** Comment cette chaîne signe un message destiné à prouver la possession. */
export type MessageSigningKind =
  /** Aucune signature de message. */
  | 'none'
  /** `personal_sign` / EIP-191, style EVM. */
  | 'personal'
  /** BIP-137 et BIP-322, style Bitcoin. */
  | 'bitcoin'
  /** Signature ed25519 brute du message, style Solana. */
  | 'ed25519';

export interface ChainCapabilities {
  /** La chaîne porte des jetons fongibles distincts de la pièce native. */
  tokens: boolean;
  /** …et l'on sait les envoyer. Faux avec `tokens: true` = lecture seule. */
  tokenSend: boolean;
  /** Trois paliers de frais proposés à l'utilisateur. */
  feeTiers: boolean;
  /**
   * Une transaction en attente peut être remplacée par une version plus chère.
   *
   * Faux sur Solana, et ce n'est PAS un manque : une transaction non incluse
   * expire d'elle-même sans rien débiter, accélérer n'a pas de sens.
   */
  accelerate: boolean;
  /** Une transaction en attente peut être annulée (remplacement vers soi). */
  cancel: boolean;
  /** Une transaction peut être simulée avant signature. */
  simulation: boolean;
  /** Type de signature de message pris en charge. */
  messageSigning: MessageSigningKind;
  /** L'utilisateur peut ajouter un réseau de cette famille avec son RPC. */
  customNetworks: boolean;
  /**
   * La chaîne transporte un mémo / commentaire avec le transfert.
   *
   * Déclaré AVANT d'en avoir besoin : les plateformes d'échange exigent un mémo
   * sur Cosmos et sur TON pour créditer le bon compte, et l'oublier fait perdre
   * les fonds. Un champ absent de l'interface au moment d'ajouter ces chaînes
   * obligerait à rouvrir tout le chemin d'envoi.
   */
  memo: boolean;
  /**
   * Un transfert peut devoir ACTIVER le compte du destinataire, à ses frais.
   *
   * Vrai sur Solana (création du compte de jeton associé) et sur TON (portefeuille
   * non initialisé). L'interface doit pouvoir l'annoncer : le coût est réel et
   * il surprend.
   */
  activatesDestination: boolean;
}

/**
 * Toutes les capacités à `false`, pour qu'un adapter déclare uniquement ce
 * qu'il sait faire et que l'ajout d'une capacité ne casse pas les existants.
 */
export const NO_CAPABILITIES: ChainCapabilities = {
  tokens: false,
  tokenSend: false,
  feeTiers: false,
  accelerate: false,
  cancel: false,
  simulation: false,
  messageSigning: 'none',
  customNetworks: false,
  memo: false,
  activatesDestination: false,
};

/** Fabrique les capacités d'une chaîne, à partir du tout-faux. */
export function capabilities(over: Partial<ChainCapabilities>): ChainCapabilities {
  return { ...NO_CAPABILITIES, ...over };
}
