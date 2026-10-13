/**
 * Moteur de dérivation NATIF (iOS, Android) : scrypt et PBKDF2-SHA512 par
 * OpenSSL, via react-native-quick-crypto, hors du fil JavaScript.
 *
 * Rien n'est utilisé avant d'avoir PROUVÉ qu'il donne les mêmes octets que
 * @noble (la référence auditée de l'app) : un coffre chiffré par l'un doit
 * s'ouvrir par l'autre, sinon un bon code serait refusé comme faux. Module
 * absent (Expo Go, build sans le natif), erreur ou écart d'un seul octet :
 * aucun moteur n'est enregistré, l'app garde le calcul JavaScript.
 */
import { scrypt as nobleScrypt } from '@noble/hashes/scrypt';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2';
import { sha512 } from '@noble/hashes/sha2';
import { setKdfBackend, type KdfBackend } from '../src/crypto/kdfBackend';

type QuickCrypto = {
  scrypt: (pw: Uint8Array, salt: Uint8Array, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }, cb: (err: Error | null, key?: Uint8Array) => void) => void;
  pbkdf2: (pw: Uint8Array, salt: Uint8Array, iterations: number, keylen: number, digest: string, cb: (err: Error | null, key?: Uint8Array) => void) => void;
};

/** Copie dans un Uint8Array à nous : le Buffer rendu partage un ArrayBuffer qu'on ne contrôle pas. */
const own = (k: Uint8Array): Uint8Array => {
  const out = new Uint8Array(k.length);
  out.set(k);
  k.fill(0);
  return out;
};

function makeBackend(qc: QuickCrypto): KdfBackend {
  return {
    scrypt: (password, salt, { N, r, p, dkLen }) =>
      new Promise((resolve, reject) => {
        // Mémoire de travail = 128·N·r·p (+ marge) : le plafond par défaut (32 Mo) refuserait 2^16.
        const maxmem = 128 * N * r * (p + 1) + (1 << 20);
        qc.scrypt(password, salt, dkLen, { N, r, p, maxmem }, (err, key) => (err || !key ? reject(err ?? new Error('scrypt')) : resolve(own(key))));
      }),
    pbkdf2Sha512: (password, salt, iterations, dkLen) =>
      new Promise((resolve, reject) => {
        qc.pbkdf2(password, salt, iterations, dkLen, 'sha512', (err, key) => (err || !key ? reject(err ?? new Error('pbkdf2')) : resolve(own(key))));
      }),
  };
}

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Auto-test : le natif doit rendre EXACTEMENT les octets de @noble. */
async function selfTest(b: KdfBackend): Promise<boolean> {
  const pw = new Uint8Array([0x6b, 0x61, 0x6c, 0x79, 0x78, 0xc3, 0xa9, 0x00, 0xff, 0x31]);
  const salt = new Uint8Array(16).map((_, i) => (i * 37 + 11) & 0xff);
  // scrypt avec r = 8 (comme l'app) et un N assez petit pour que @noble reste rapide.
  const s1 = await b.scrypt(pw, salt, { N: 1 << 10, r: 8, p: 1, dkLen: 32 });
  const s2 = nobleScrypt(pw, salt, { N: 1 << 10, r: 8, p: 1, dkLen: 32 });
  const p1 = await b.pbkdf2Sha512(pw, salt, 64, 64);
  const p2 = noblePbkdf2(sha512, pw, salt, { c: 64, dkLen: 64 });
  return equalBytes(s1, s2) && equalBytes(p1, p2);
}

let installed = false;

/** À appeler une fois au démarrage : l'auto-test court en fond, les dérivations l'attendent. */
export function installNativeKdf(): void {
  if (installed) return;
  installed = true;
  setKdfBackend(
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const qc = require('react-native-quick-crypto') as { default?: QuickCrypto } & QuickCrypto;
        const backend = makeBackend(qc.default?.scrypt ? qc.default : qc);
        return (await selfTest(backend)) ? backend : null;
      } catch {
        return null; // module natif absent ou en échec : calcul JavaScript
      }
    })(),
  );
}
