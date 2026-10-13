/**
 * Le ciel du moment pour les écrans (calcul : lib/skyClock).
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { skyPhaseNow, type SkyPhase } from '../lib/skyClock';

export { skyPhaseNow };

/** La phase du ciel, tenue à jour : à la minute, et au retour de l'app au premier plan. */
export function useSkyPhase(): SkyPhase {
  const [phase, setPhase] = useState<SkyPhase>(() => skyPhaseNow());
  useEffect(() => {
    const check = () => setPhase((cur) => {
      const next = skyPhaseNow();
      return next === cur ? cur : next;
    });
    const id = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  return phase;
}
