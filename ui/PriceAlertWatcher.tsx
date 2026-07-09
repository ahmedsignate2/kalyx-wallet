/**
 * Surveillance des alertes de prix. Vérifie les seuils au montage, au retour au
 * premier plan, et toutes les 90 s tant que l'app est active (pas de push : ça se
 * fait quand l'app est ouverte — le push serveur viendra plus tard). Déclenche une
 * notification locale et retire l'alerte (one-shot).
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePriceAlerts } from '../lib/priceAlertsStore';
import { useSettings } from '../lib/settingsStore';
import { notifyAndLog } from '../lib/notificationCenter';
import { getPrices, alertTriggered } from '../src';

let running = false;

async function runCheck(): Promise<void> {
  if (running) return;
  const { alerts, remove } = usePriceAlerts.getState();
  if (alerts.length === 0) return;
  running = true;
  try {
    const fiat = useSettings.getState().fiat;
    const ids = [...new Set(alerts.map((a) => a.coingeckoId))];
    const prices = await getPrices(ids, fiat);
    for (const a of alerts) {
      const p = prices[a.coingeckoId]?.price;
      if (p != null && alertTriggered(a, p)) {
        const arrow = a.direction === 'above' ? '≥' : '≤';
        const body = `${a.symbol} est à ${p.toLocaleString('fr-FR', { maximumFractionDigits: 6 })} ${fiat.toUpperCase()}.`;
        notifyAndLog('price', `🔔 ${a.symbol} ${arrow} ${a.target} ${fiat.toUpperCase()}`, body); // log + notif OS (si activé)
        remove(a.id); // one-shot : évite de re-notifier en boucle
      }
    }
  } catch {
    /* réseau indisponible : on réessaiera au prochain tick */
  } finally {
    running = false;
  }
}

export function PriceAlertWatcher() {
  useEffect(() => {
    void runCheck();
    const interval = setInterval(() => void runCheck(), 90_000);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void runCheck();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
  return null;
}
