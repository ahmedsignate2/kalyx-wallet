/**
 * État PARTAGÉ de la révocation groupée — vit hors de l'écran : le lot continue
 * quand on quitte Autorisations, et l'écran rouvert le sait (bouton bloqué,
 * progression affichée) au lieu de lancer un second lot sur les mêmes nonces.
 *
 * Révocations EN VOL : tant qu'une révocation envoyée n'est pas minée, le réseau
 * lit encore l'ancienne autorisation (> 0). On la retient avec son hash ; elle
 * compte comme « en cours » tant que son reçu n'existe pas (10 min au plus).
 * Une fois minée, on l'oublie et c'est la CHAÎNE qui fait foi — une nouvelle
 * autorisation donnée depuis (un swap) se revoit normalement.
 * Un envoi INCERTAIN (diffusion interrompue, pas de hash) est retenu de même,
 * le temps qu'il passe ou non : pas de second envoi payé à l'aveugle.
 */
import { create } from 'zustand';

export const useRevokeState = create<{ progress: { done: number; total: number } | null }>(() => ({ progress: null }));

/** Une révocation en vol est tenue pour en cours pendant ce délai au plus. */
export const RECENT_REVOKE_MS = 10 * 60_000;
const inFlight = new Map<string, { at: number; hash: string | null }>();

export const revokeKey = (chainId: string, owner: string, token: string, spender: string) =>
  `${chainId}:${owner.toLowerCase()}:${token.toLowerCase()}:${spender.toLowerCase()}`;

export function markRevokeSent(chainId: string, owner: string, token: string, spender: string, hash: string | null, now = Date.now()): void {
  inFlight.set(revokeKey(chainId, owner, token, spender), { at: now, hash });
}

/**
 * La révocation de cette autorisation est-elle encore EN VOL ? `receiptOf(hash)`
 * rend vrai si la transaction est dans un bloc (lève si le réseau ne répond
 * pas : on la tient alors pour en cours, par prudence).
 */
export async function isRevokeInFlight(
  chainId: string,
  owner: string,
  token: string,
  spender: string,
  receiptOf: (hash: string) => Promise<boolean>,
  now = Date.now(),
): Promise<boolean> {
  const k = revokeKey(chainId, owner, token, spender);
  const e = inFlight.get(k);
  if (!e) return false;
  if (now - e.at >= RECENT_REVOKE_MS) {
    inFlight.delete(k);
    return false;
  }
  if (!e.hash) return true; // envoi incertain : on attend le délai
  try {
    if (await receiptOf(e.hash)) {
      inFlight.delete(k); // minée : la chaîne fait foi désormais
      return false;
    }
  } catch {
    /* réseau muet : toujours en cours */
  }
  return true;
}
