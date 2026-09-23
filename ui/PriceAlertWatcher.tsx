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
import { translate } from '../lib/i18n';
import { notifyAndLog } from '../lib/notificationCenter';
import { getPrices, alertTriggered } from '../src';

let running = false;

async function runCheck(): Promise<void> {
  if (running) return;
  const { alerts, remove } = usePriceAlerts.getState();
  if (alerts.length === 0) return;
  running = true;
  try {
    const { fiat, language } = useSettings.getState();
    const ids = [...new Set(alerts.map((a) => a.coingeckoId))];
    const prices = await getPrices(ids, fiat);
    for (const a of alerts) {
      const p = prices[a.coingeckoId]?.price;
      if (p != null && alertTriggered(a, p)) {
        const arrow = a.direction === 'above' ? '≥' : '≤';
        /*
         * Trois défauts corrigés ici. Le texte était en français en dur, le
         * nombre était formaté en 'fr-FR' pour TOUT LE MONDE (un utilisateur
         * anglais lisait « 1 234,56 »), et le titre portait un emoji, que le
         * §19 interdit. `translate` et non `useT` : on n'est pas dans un rendu.
         */
        const body = translate(language, 'priceAlertBody')
          .replace('{symbol}', a.symbol)
          .replace('{price}', p.toLocaleString(language, { maximumFractionDigits: 6 }))
          .replace('{fiat}', fiat.toUpperCase());
        notifyAndLog('price', `${a.symbol} ${arrow} ${a.target} ${fiat.toUpperCase()}`, body); // log + notif OS (si activé)
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
