import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';
import { hex } from '@scure/base';
import { pbkdf2Yielding } from './pbkdf2Yielding';

const P = utf8ToBytes('password');
const S = utf8ToBytes('salt');

describe('pbkdf2Yielding — identique à pbkdf2 de @noble/hashes', () => {
  it('vecteur publié PBKDF2-HMAC-SHA256 (c = 1)', async () => {
    // "password" / "salt", c = 1, dkLen = 32 : vecteur public largement repris.
    const out = await pbkdf2Yielding(sha256, P, S, { c: 1, dkLen: 32 });
    expect(hex.encode(out)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });

  it.each([
    [sha512, 1, 64],
    [sha512, 390, 64],
    [sha512, 2048, 64],
    [sha512, 1000, 100], // plusieurs blocs, dernier tronqué
    [sha256, 4096, 20],
  ])('mêmes octets (%#)', async (hash, c, dkLen) => {
    const expected = pbkdf2(hash, P, S, { c, dkLen });
    expect(hex.encode(await pbkdf2Yielding(hash, P, S, { c, dkLen }))).toBe(hex.encode(expected));
  });

  it('rend la main pendant le calcul (macrotâches), sans changer le résultat', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    try {
      const out = await pbkdf2Yielding(sha512, P, S, { c: 20_000, dkLen: 64, tickMs: 1 });
      expect(hex.encode(out)).toBe(hex.encode(pbkdf2(sha512, P, S, { c: 20_000, dkLen: 64 })));
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThan(1);
  });

  it('refuse un nombre d’itérations invalide', async () => {
    await expect(pbkdf2Yielding(sha512, P, S, { c: 0, dkLen: 64 })).rejects.toThrow();
  });
});
