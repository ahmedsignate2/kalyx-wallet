/** Petit hook data-fetching partagé par les panneaux du dashboard web. */
import { useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Charge une donnée asynchrone.
 *
 * DEUX LISTES DE DÉPENDANCES, et c'est la correction d'un vrai défaut.
 *
 *  - `identity` décrit CE QUE LA DONNÉE DÉCRIT : le réseau, l'adresse, la devise.
 *    Quand elle change, l'ancienne valeur ne parle plus du même sujet, donc on
 *    l'oublie. Avant, elle était conservée : changer de réseau affichait le solde
 *    et les tokens du réseau PRÉCÉDENT sous le nom du nouveau, aussi longtemps que
 *    le RPC mettait à répondre. Dans un portefeuille, quelques secondes de chiffres
 *    faux valent moins qu'un squelette.
 *  - `refresh` déclenche un rechargement SANS rien effacer : le compteur de
 *    révision WalletConnect, le tirer-pour-rafraîchir. Le sujet est le même, la
 *    valeur affichée reste valable en attendant la suivante — sinon chaque event
 *    du téléphone ferait clignoter tout l'écran en squelettes.
 */
export function useAsync<T>(fn: () => Promise<T>, identity: DependencyList, refresh: DependencyList = []): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true });
  // Sérialisation de l'identité : on compare des valeurs, pas des références.
  const key = JSON.stringify(identity.map((d) => (typeof d === 'bigint' ? String(d) : d)));
  const lastKey = useRef(key);
  // Le sujet a changé : on oublie la valeur AVANT le rendu, pas dans un effet,
  // sinon l'écran montre une fois la donnée de l'ancien sujet.
  if (lastKey.current !== key) {
    lastKey.current = key;
    if (state.data !== null || !state.loading) setState({ data: null, loading: true });
  }
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((d) => { if (alive) setState({ data: d, loading: false }); })
      .catch(() => { if (alive) setState((s) => ({ data: s.data, loading: false })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...refresh]);
  return state;
}
