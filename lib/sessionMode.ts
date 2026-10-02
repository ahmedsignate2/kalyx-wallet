/**
 * Mode de la session déverrouillée — sans dépendance, lisible de partout.
 *
 * LEURRE : ouverte avec le CODE DE CONTRAINTE. L'app montre un portefeuille
 * leurre et rien d'autre ; tout ce qui pourrait trahir l'existence des vrais
 * portefeuilles (contacts, notifications, conversations avec l'assistant,
 * liste blanche) est masqué, et rien de ce qui est fait pendant la session
 * n'est écrit par-dessus les vraies données. Aucun indice visible à l'écran.
 */
let decoy = false;
const listeners = new Set<(on: boolean) => void>();

export const isDecoySession = () => decoy;

export function setDecoySession(on: boolean): void {
  if (decoy === on) return;
  decoy = on;
  for (const l of listeners) l(on);
}

/** Pour les magasins qui doivent se vider (entrée) ou se recharger (sortie). */
export function onDecoyChange(l: (on: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
