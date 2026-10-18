/**
 * Fermeture de la fenêtre d'une demande de dApp (navigateur intégré).
 *
 * Une connexion validée LIBÈRE sa demande avant la fin de l'animation (pour
 * qu'une signature demandée aussitôt connecté ne reçoive pas « demande déjà en
 * cours »). La fermeture ne regardait que la demande en cours : libérée, elle ne
 * correspondait plus, la fenêtre « Connexion au site » restait — et revenait
 * après Face ID, en boucle.
 *
 * Règle : on ferme si rien n'a pris la place (demande libérée), ou si c'est
 * bien la même demande. Jamais une AUTRE demande arrivée entre-temps.
 */
export function shouldClosePending(current: { id: number; tabId: string } | null, done: { id: number; tabId: string }): boolean {
  return !current || (current.id === done.id && current.tabId === done.tabId);
}
