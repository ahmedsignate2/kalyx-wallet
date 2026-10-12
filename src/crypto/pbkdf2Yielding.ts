/**
 * PBKDF2-HMAC qui REND LA MAIN à l'interface pendant le calcul.
 *
 * ## Pourquoi pas `pbkdf2Async` de @noble/hashes
 *
 * Son option `asyncTick` ne rend la main qu'en MICROTÂCHE (`await` d'une
 * promesse déjà résolue) : la file des microtâches est vidée avant que le
 * moteur ne revienne au natif, donc ni rendu React, ni toucher, ni timer ne
 * passent pendant le calcul. Sur Hermes iOS, les 100 000 tours de la
 * dérivation TON native figeaient ainsi l'interface plusieurs secondes, async
 * ou pas (cf. `yieldToUi.ts`, même constat pour scrypt/PBKDF2 BIP-39).
 *
 * ## Ce que fait cette version
 *
 * Exactement la boucle de `pbkdf2` de @noble/hashes (RFC 2898) — mêmes
 * primitives (`hmac.create`, `_cloneInto`, `digestInto`), même ordre — mais
 * elle cède la main en MACROTÂCHE (`setTimeout(0)`) toutes les `tickMs`
 * millisecondes de calcul. Aucune primitive n'est réécrite : seul l'ordonnancement
 * change. Le résultat est vérifié octet pour octet contre `pbkdf2` de @noble
 * (`pbkdf2Yielding.test.ts`) et contre les vecteurs TON officiels.
 */
import { hmac } from '@noble/hashes/hmac';
import type { CHash } from '@noble/hashes/utils';
import { yieldToUi } from './yieldToUi';

export interface Pbkdf2YieldingOpts {
  /** Nombre d'itérations (≥ 1). */
  c: number;
  /** Longueur de la clé dérivée, en octets. */
  dkLen: number;
  /** Durée maximale de calcul entre deux reprises de l'interface (ms). Défaut : 25. */
  tickMs?: number;
}

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function pbkdf2Yielding(
  hash: CHash,
  password: Uint8Array,
  salt: Uint8Array,
  { c, dkLen, tickMs = 25 }: Pbkdf2YieldingOpts,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(c) || c < 1) throw new Error('iterations (c) should be >= 1');
  if (!Number.isSafeInteger(dkLen) || dkLen < 1) throw new Error('dkLen should be >= 1');
  // Une image avant le calcul : l'indicateur d'attente s'affiche d'abord.
  await yieldToUi();

  const DK = new Uint8Array(dkLen);
  const PRF = hmac.create(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt);
  let prfW: ReturnType<typeof PRF._cloneInto> | undefined;
  const arr = new Uint8Array(4);
  const view = new DataView(arr.buffer);
  const u = new Uint8Array(PRF.outputLen);
  try {
    let ts = Date.now();
    // DK = T1 || T2 || … ; Ti = U1 ^ U2 ^ … ^ Uc
    for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
      const Ti = DK.subarray(pos, pos + PRF.outputLen);
      view.setInt32(0, ti, false);
      // U1 = PRF(P, S || INT_32_BE(i))
      (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
      Ti.set(u.subarray(0, Ti.length));
      for (let ui = 1; ui < c; ui++) {
        // Uj = PRF(P, Uj−1)
        PRF._cloneInto(prfW).update(u).digestInto(u);
        for (let i = 0; i < Ti.length; i++) Ti[i] ^= u[i];
        const now = Date.now();
        // Date.now() n'est pas monotone : un recul d'horloge rend aussi la main.
        if (now - ts >= tickMs || now < ts) {
          await macrotask();
          ts = Date.now();
        }
      }
    }
    return DK;
  } finally {
    PRF.destroy();
    PRFSalt.destroy();
    prfW?.destroy();
    u.fill(0);
  }
}
