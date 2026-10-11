/**
 * Valeur qui change souvent (compte à rebours, progression) HORS de l'état
 * React d'un écran : seuls les composants abonnés se re-rendent, et seulement
 * quand la part qu'ils lisent change.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface Ticker {
  get(): number;
  set(value: number): void;
  subscribe(listener: () => void): () => void;
}

export function createTicker(initial = 0): Ticker {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Lit une projection de la valeur ; le rendu n'a lieu que si la projection change. */
export function useTicker<T>(ticker: Ticker, select: (value: number) => T): T {
  const getSnapshot = useCallback(() => select(ticker.get()), [ticker, select]);
  return useSyncExternalStore(ticker.subscribe, getSnapshot, getSnapshot);
}
