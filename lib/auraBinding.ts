/**
 * Branchement de l'Aura sur les états RÉELS de l'app (docs/08 §3).
 *
 * Séparation nette, et c'est tout l'intérêt du moteur :
 *
 *  - l'AMBIANCE est un état DÉRIVÉ. Elle se calcule ici, en un seul endroit, à
 *    partir des stores. Aucun écran, aucun store ne la « pousse » : trois
 *    appelants qui écrivent la même variable finissent toujours par se
 *    contredire, et le halo se met à clignoter entre deux vérités.
 *  - les IMPULSIONS sont des ÉVÉNEMENTS. Elles ne se déduisent d'aucun état
 *    (rien dans le portefeuille ne dit « une réception vient d'avoir lieu »),
 *    donc elles sont émises à la source, au moment où la chose se produit.
 *
 * Ce fichier est le seul à connaître à la fois les stores métier et le halo.
 */
import { useEffect } from 'react';
import { useAura } from './aura';
import { useNetwork, startNetworkWatch } from './networkStore';
import { usePortfolioStore } from './portfolio/portfolioStore';

/**
 * À monter UNE fois, au niveau du layout racine.
 *
 * Ordre de priorité : le hors-ligne l'emporte sur tout le reste — quand il n'y
 * a plus de réseau, « Kalyx travaille » serait un mensonge.
 */
export function useAuraBinding() {
  const online = useNetwork((s) => s.online);
  const loading = usePortfolioStore((s) => s.loading);
  const setAmbient = useAura((s) => s.setAmbient);

  useEffect(startNetworkWatch, []);

  useEffect(() => {
    setAmbient(!online ? 'offline' : loading ? 'sync' : 'rest');
  }, [online, loading, setAmbient]);
}
