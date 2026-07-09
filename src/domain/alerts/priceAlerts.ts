/**
 * Alertes de prix : logique PURE (déclenchement). Le stockage, la récupération
 * des prix et les notifications vivent côté app (lib/). Ici, uniquement la règle
 * « ce prix franchit-il le seuil ? », testable sans réseau ni natif.
 */
export interface PriceAlert {
  id: string;
  coingeckoId: string;
  symbol: string;
  /** 'above' = prévenir si le prix MONTE au seuil ; 'below' = s'il DESCEND au seuil. */
  direction: 'above' | 'below';
  target: number;
  createdAt: number;
}

/** Le prix courant franchit-il le seuil de l'alerte ? */
export function alertTriggered(alert: Pick<PriceAlert, 'direction' | 'target'>, price: number): boolean {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(alert.target)) return false;
  return alert.direction === 'above' ? price >= alert.target : price <= alert.target;
}
