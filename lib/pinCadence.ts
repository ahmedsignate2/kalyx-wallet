/**
 * CODE EXIGÉ RÉGULIÈREMENT, même avec la biométrie.
 *
 * Comme iOS pour Face ID : au-delà de 72 h sans saisie du code Kalyx, le
 * déverrouillage biométrique est refusé jusqu'à la prochaine saisie. Un
 * téléphone volé avec une empreinte forcée (personne endormie, contrainte)
 * ne donne alors qu'une fenêtre courte — et l'utilisateur garde son code en
 * mémoire, ce qui est sa seule issue si la biométrie le lâche.
 *
 * Horodatage gardé sur CET appareil seulement (trousseau), jamais sauvegardé.
 */
import { KV_DEVICE_ONLY, kvGet, kvSet } from './kv';

const K = 'nova.lastPinAt';
export const PIN_EVERY_MS = 72 * 3600_000;

/** Le code vient d'être saisi correctement. */
export async function markPinEntered(now = Date.now()): Promise<void> {
  try {
    await kvSet(K, String(now), KV_DEVICE_ONLY);
  } catch {
    /* trousseau indisponible : la biométrie restera permise, comme avant */
  }
}

/**
 * Faut-il le code avant la biométrie ? Jamais d'horodatage (installation
 * d'avant cette règle) : on commence à compter maintenant, sans bloquer.
 */
export async function pinRequiredAgain(now = Date.now()): Promise<boolean> {
  try {
    const raw = await kvGet(K, KV_DEVICE_ONLY);
    const at = raw ? Number(raw) : NaN;
    if (!Number.isFinite(at)) {
      await markPinEntered(now);
      return false;
    }
    // Heure reculée (at dans le futur) : on ne peut plus mesurer — code exigé.
    return at > now + 60_000 || now - at > PIN_EVERY_MS;
  } catch {
    return false;
  }
}
