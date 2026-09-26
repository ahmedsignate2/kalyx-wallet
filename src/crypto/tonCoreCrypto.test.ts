/**
 * Le substitut de `@ton/crypto` : exact, et complet pour la version de
 * `@ton/core` installée.
 */
import fs from 'fs';
import path from 'path';
import { hex } from '@scure/base';
import * as shim from './tonCoreCrypto';

describe('tonCoreCrypto — fournit tout ce que @ton/core appelle', () => {
  /*
   * Une mise à jour de `@ton/core` qui appellerait une nouvelle fonction de
   * `@ton/crypto` planterait à l'exécution (`crypto_1.x is not a function`),
   * chez l'utilisateur. Ce test lit le code installé et échoue AVANT.
   */
  it('chaque appel crypto_1.* de @ton/core existe ici', () => {
    const dist = path.join(__dirname, '../../node_modules/@ton/core/dist');
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/crypto_1\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
      }
    };
    walk(dist);
    expect([...used].sort()).toEqual(['sha256_sync', 'sign', 'signVerify']);
    for (const fn of used) expect(typeof (shim as Record<string, unknown>)[fn]).toBe('function');
  });

  it('Jest charge bien ce fichier à la place de @ton/crypto', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(require('@ton/crypto')).toBe(require('./tonCoreCrypto'));
  });
});

describe('tonCoreCrypto — exactitude', () => {
  it('sha256_sync : vecteur FIPS 180-2 (« abc »), chaîne lue en UTF-8', () => {
    const want = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(shim.sha256_sync('abc').toString('hex')).toBe(want);
    expect(shim.sha256_sync(Buffer.from('abc')).toString('hex')).toBe(want);
  });

  /* RFC 8032, §7.1, TEST 2 : clé, message d'un octet, signature attendue. */
  const SEED = hex.decode('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb');
  const PUB = hex.decode('3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c');
  const SIG = '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00';

  it('sign : vecteur RFC 8032, clé au format tweetnacl (64 octets) ou graine seule', () => {
    const msg = hex.decode('72');
    expect(shim.sign(Buffer.from(msg), Buffer.concat([SEED, PUB])).toString('hex')).toBe(SIG);
    expect(shim.sign(Buffer.from(msg), Buffer.from(SEED)).toString('hex')).toBe(SIG);
  });

  it('signVerify : accepte la bonne signature, refuse une signature altérée', () => {
    const msg = Buffer.from(hex.decode('72'));
    expect(shim.signVerify(msg, Buffer.from(hex.decode(SIG)), Buffer.from(PUB))).toBe(true);
    const bad = hex.decode(SIG); bad[0] ^= 1;
    expect(shim.signVerify(msg, Buffer.from(bad), Buffer.from(PUB))).toBe(false);
  });
});
