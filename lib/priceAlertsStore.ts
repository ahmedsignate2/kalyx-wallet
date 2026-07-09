/**
 * Alertes de prix (par CoinGecko id). Persistées localement. Vérifiées quand
 * l'app est ouverte / revient au premier plan (voir ui/PriceAlertWatcher). Une
 * alerte est « one-shot » : supprimée dès qu'elle se déclenche (pas de spam).
 */
import { create } from 'zustand';
import type { PriceAlert } from '../src';
import { savePriceAlerts, loadPriceAlerts } from './secureStore';

interface PriceAlertsState {
  alerts: PriceAlert[];
  load: () => Promise<void>;
  add: (a: Omit<PriceAlert, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
}

function newId(): string {
  return `al${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
}

export const usePriceAlerts = create<PriceAlertsState>((set, get) => ({
  alerts: [],

  load: async () => {
    set({ alerts: await loadPriceAlerts<PriceAlert>() });
  },

  add: (a) => {
    const alerts = [{ ...a, id: newId(), createdAt: Date.now() }, ...get().alerts];
    set({ alerts });
    void savePriceAlerts(alerts);
  },

  remove: (id) => {
    const alerts = get().alerts.filter((x) => x.id !== id);
    set({ alerts });
    void savePriceAlerts(alerts);
  },
}));
