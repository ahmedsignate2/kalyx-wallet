/**
 * État PARTAGÉ de la révocation groupée — vit hors de l'écran : le lot continue
 * quand on quitte Autorisations, et l'écran rouvert le sait (bouton bloqué,
 * progression affichée) au lieu de lancer un second lot sur les mêmes nonces.
 *
 * Mémoire courte des révocations ENVOYÉES : tant qu'elles ne sont pas minées,
 * le réseau lit encore l'ancienne autorisation (> 0). Sans cette mémoire, un
 * rafraîchissement les faisait réapparaître, et une seconde révocation —
 * inutile — était payée.
 */
import { create } from 'zustand';

export const useRevokeState = create<{ progress: { done: number; total: number } | null }>(() => ({ progress: null }));

/** Une révocation envoyée est tenue pour faite pendant ce délai (le temps d'être minée). */
export const RECENT_REVOKE_MS = 10 * 60_000;
const recent = new Map<string, number>();

const keyOf = (chainId: string, owner: string, token: string, spender: string) =>
  `${chainId}:${owner.toLowerCase()}:${token.toLowerCase()}:${spender.toLowerCase()}`;

export function markRevoked(chainId: string, owner: string, token: string, spender: string, now = Date.now()): void {
  recent.set(keyOf(chainId, owner, token, spender), now);
}

export function isRecentlyRevoked(chainId: string, owner: string, token: string, spender: string, now = Date.now()): boolean {
  const at = recent.get(keyOf(chainId, owner, token, spender));
  return at != null && now - at < RECENT_REVOKE_MS;
}
