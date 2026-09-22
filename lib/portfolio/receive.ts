/**
 * « Une réception a-t-elle eu lieu ? » — règle métier isolée (docs/08 §8).
 *
 * Extraite du store pour être testable sans monter AsyncStorage ni le réseau,
 * et parce que c'est la nuance la plus facile à casser de tout le moteur.
 */
import type { Holding } from './portfolioStore';

/**
 * Une réception s'est-elle produite entre deux instantanés ?
 *
 * On compare les QUANTITÉS (`raw`, en unités indivisibles), jamais le total en
 * fiat : un total qui monte peut venir du marché, et §8 est catégorique — une
 * variation de cours ne déclenche rien, ni impulsion ni couleur. Seule une
 * quantité qui augmente, ou un jeton vérifié qui apparaît, est un encaissement.
 *
 * Les jetons NON vérifiés sont ignorés : l'empoisonnement d'adresse consiste
 * précisément à envoyer de la poussière pour se faire remarquer. On ne va pas
 * célébrer une tentative d'arnaque.
 */
export function didReceive(before: Holding[], after: Holding[]): boolean {
  if (before.length === 0) return false; // premier chargement : rien à comparer
  const prev = new Map(before.map((h) => [h.id, h.raw]));
  for (const h of after) {
    if (!h.verified) continue;
    const was = prev.get(h.id);
    if (was === undefined ? h.raw > 0n : h.raw > was) return true;
  }
  return false;
}
