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
/** Identifiants dont les clés de stockage restent inscriptibles en session leurre (le coffre du leurre). */
let writable: string[] = [];
const listeners = new Set<(on: boolean) => void>();

export const isDecoySession = () => decoy;

export function setDecoySession(on: boolean, writableIds: string[] = []): void {
  writable = on ? writableIds : [];
  if (decoy === on) return;
  decoy = on;
  for (const l of listeners) l(on);
}

/**
 * PARE-FEU D'ÉCRITURE : en session leurre, seule une clé du leurre (son coffre,
 * ses comptes, sa description) peut être écrite. Tout le reste — réglages,
 * contacts, liste blanche, réseau actif, historiques — reste tel quel sur le
 * disque ; le leurre ne vit qu'en mémoire, et l'app redémarre en sortant.
 */
/**
 * PARE-FEU DE LECTURE : en session leurre, le trousseau ne rend que le leurre,
 * les réglages et le compteur de tentatives. Tout le reste (sessions de dApps,
 * contacts, historiques, liste blanche…) se lit VIDE — un module chargé
 * pendant la session ne peut pas y faire remonter de vraies données.
 */
export function decoyMayRead(key: string): boolean {
  if (!decoy) return true;
  return key === 'nova.settings' || key === 'nova.lockState' || decoyMayWrite(key);
}

export function decoyMayWrite(key: string): boolean {
  if (!decoy) return true;
  return key === 'kalyx.duress' || writable.some((id) => key.includes(id));
}

/** Pour les magasins qui doivent se vider (entrée) ou se recharger (sortie). */
export function onDecoyChange(l: (on: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
