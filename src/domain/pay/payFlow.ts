/**
 * WalletConnect Pay — que faire d'une réponse « zéro option ».
 *
 * Pur et testable, et séparé du magasin pour une raison précise : c'est ici
 * qu'était la boucle. Le service renvoie `collectData` pour DÉCRIRE les
 * informations que le paiement requiert, et il peut le faire à chaque réponse —
 * ce champ ne dit pas qu'elles manquent encore. Rouvrir le formulaire dès qu'il
 * est présent ramenait donc l'utilisateur sur le même écran, indéfiniment :
 * saisie, envoi, même écran.
 *
 * La règle tient en une phrase : on ne traverse le formulaire QU'UNE FOIS.
 */

/** Ce que l'app fait d'une réponse sans option. */
export type NoOptionAction =
  /** Ouvrir le formulaire hébergé, puis redemander les options. */
  | { kind: 'collect'; url: string }
  /** S'arrêter : le service ne propose rien, et on n'a rien demandé à remplir. */
  | { kind: 'stop'; reason: 'NO_OPTION' }
  /** S'arrêter : le formulaire a été envoyé et ça ne change rien. */
  | { kind: 'stop'; reason: 'INFO_NOT_ENOUGH' };

export interface NoOptionInput {
  /** URL du formulaire exigé au niveau de la DEMANDE, si le service en donne. */
  rootCollectUrl?: string | null;
  /** Ce chargement suit-il un envoi de formulaire ? */
  afterInfo: boolean;
}

/**
 * Décide de la suite quand le service ne propose aucune option.
 *
 * `afterInfo` est le seul rempart contre la boucle : une fois le formulaire
 * envoyé, la présence de `collectData` dans la réponse suivante ne doit plus
 * rien déclencher. L'utilisateur a fait sa part ; le lui redemander serait à la
 * fois inutile et incompréhensible.
 */
export function decideNoOption({ rootCollectUrl, afterInfo }: NoOptionInput): NoOptionAction {
  if (afterInfo) return { kind: 'stop', reason: 'INFO_NOT_ENOUGH' };
  const url = (rootCollectUrl ?? '').trim();
  if (url) return { kind: 'collect', url };
  return { kind: 'stop', reason: 'NO_OPTION' };
}

/**
 * Faut-il encore faire remplir le formulaire pour cette option ?
 *
 * Le `collectData` d'une option NE DISPARAÎT PAS après l'envoi : le service le
 * renvoie à l'identique. S'y fier seul avait deux conséquences — un badge
 * « informations requises » qui restait affiché pour toujours, et un formulaire
 * qui se rouvrait dès qu'on retouchait l'option déjà renseignée.
 *
 * La mémoire de ce qui a été envoyé est donc du côté de l'app, et c'est elle qui
 * tranche.
 */
export function needsCollect(
  option: { id: string; collectData?: { url?: string } | null } | null | undefined,
  collectedIds: readonly string[],
): boolean {
  if (!option?.collectData?.url) return false;
  return !collectedIds.includes(option.id);
}

/**
 * Option à présélectionner dans une liste, ou `null`.
 *
 * La PREMIÈRE qui ne réclame rien : présélectionner une option qui exige des
 * informations ouvrirait un formulaire que l'utilisateur n'a pas demandé. Sans
 * présélection, le bouton de paiement n'apparaissait qu'après un appui, et
 * l'écran semblait attendre sans dire quoi.
 */
export function preselectOption<T extends { id: string; collectData?: { url?: string } | null }>(
  options: readonly T[],
  collectedIds: readonly string[] = [],
): T | null {
  return options.find((o) => !needsCollect(o, collectedIds)) ?? null;
}
