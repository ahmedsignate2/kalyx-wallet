/**
 * MOTEUR DE DÉRIVATION NATIF (facultatif) pour scrypt et PBKDF2-SHA512.
 *
 * Les calculs lents de l'app — scrypt du code PIN et du mot de passe de
 * sauvegarde, PBKDF2 de la graine BIP-39 (2 048 tours) et de la graine TON
 * (100 000 tours) — tournent en JavaScript (@noble). Sur Hermes, sans
 * compilation à la volée, ils prennent plusieurs secondes. Un moteur natif
 * (OpenSSL, via lib/nativeKdf) fait EXACTEMENT le même calcul en quelques
 * dizaines de millisecondes, hors du fil JavaScript.
 *
 * Le domaine (src/) ne dépend d'aucun module natif : l'app enregistre un moteur
 * ici au démarrage, APRÈS l'avoir vérifié octet pour octet contre @noble. Sans
 * moteur (web, Telegram, Expo Go, tests) ou s'il échoue, tout retombe sur le
 * JavaScript : mêmes octets, juste plus lent.
 */

export interface KdfBackend {
  scrypt(password: Uint8Array, salt: Uint8Array, params: { N: number; r: number; p: number; dkLen: number }): Promise<Uint8Array>;
  pbkdf2Sha512(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number): Promise<Uint8Array>;
}

let pending: Promise<KdfBackend | null> | null = null;
let ready: KdfBackend | null = null;

/** Enregistre le moteur (ou la promesse de son auto-test). `null` le retire. */
export function setKdfBackend(b: KdfBackend | Promise<KdfBackend | null> | null): void {
  if (b && typeof (b as Promise<unknown>).then === 'function') {
    ready = null;
    pending = (b as Promise<KdfBackend | null>).then(
      (v) => (ready = v),
      () => (ready = null),
    );
    return;
  }
  pending = null;
  ready = b as KdfBackend | null;
}

/** Le moteur vérifié, en attendant la fin de son auto-test s'il est en cours. */
export async function kdfBackend(): Promise<KdfBackend | null> {
  if (pending) await pending;
  return ready;
}

/**
 * Exécute `native` si un moteur est là, sinon (ou s'il échoue) `js`.
 * Un échec natif n'est jamais une erreur pour l'utilisateur : le JavaScript
 * donne le même résultat.
 */
export async function withKdf<T>(native: (b: KdfBackend) => Promise<T>, js: () => Promise<T> | T): Promise<T> {
  const b = await kdfBackend();
  if (b) {
    try {
      return await native(b);
    } catch {
      // Mémoire refusée, module absent malgré tout… : repli JavaScript.
    }
  }
  return js();
}
