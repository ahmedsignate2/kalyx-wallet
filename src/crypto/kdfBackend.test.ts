/**
 * Moteur de dérivation natif : simulé ici par l'OpenSSL de Node (le même que
 * celui de react-native-quick-crypto). Ce qui compte : les octets sont
 * IDENTIQUES à ceux du JavaScript, dans les deux sens — un coffre chiffré par
 * l'un s'ouvre par l'autre.
 */
import { pbkdf2 as nodePbkdf2, scrypt as nodeScrypt } from 'crypto';
import { mnemonicToSeed as scureToSeed } from '@scure/bip39';
import { setKdfBackend, kdfBackend, type KdfBackend } from './kdfBackend';
import { encryptSecret, decryptSecret, pinKdf, backupKdf, PIN_KDF_NATIVE, BACKUP_KDF_NATIVE, BACKUP_KDF } from '../security/vault';
import { mnemonicToSeed } from './mnemonic';
import { tonSeedFromMnemonic, tonSeedFromMnemonicAsync } from '../domain/chains/ton/tonMnemonic';

const calls = { scrypt: 0, pbkdf2: 0 };
const nodeBackend: KdfBackend = {
  scrypt: (pw, salt, { N, r, p, dkLen }) =>
    new Promise((res, rej) => nodeScrypt(pw, salt, dkLen, { N, r, p, maxmem: 128 * N * r * (p + 1) + (1 << 20) }, (e, k) => (calls.scrypt++, e ? rej(e) : res(new Uint8Array(k))))),
  pbkdf2Sha512: (pw, salt, c, dkLen) =>
    new Promise((res, rej) => nodePbkdf2(pw, salt, c, dkLen, 'sha512', (e, k) => (calls.pbkdf2++, e ? rej(e) : res(new Uint8Array(k))))),
};
const failing: KdfBackend = {
  scrypt: () => Promise.reject(new Error('ENOMEM')),
  pbkdf2Sha512: () => Promise.reject(new Error('ENOMEM')),
};

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

afterEach(() => setKdfBackend(null));

describe('moteur de dérivation natif', () => {
  it('sans moteur : réglages d’avant', async () => {
    expect(await kdfBackend()).toBeNull();
    expect((await pinKdf()).N).toBe(1 << 14);
    expect(await backupKdf()).toBe(BACKUP_KDF);
  });

  it('avec moteur : réglages renforcés (PIN 2^15, sauvegarde 2^16)', async () => {
    setKdfBackend(nodeBackend);
    expect(await pinKdf()).toBe(PIN_KDF_NATIVE);
    expect(await backupKdf()).toBe(BACKUP_KDF_NATIVE);
  });

  it('coffre chiffré en JavaScript → ouvert par le natif, et inversement', async () => {
    const jsVault = await encryptSecret(PHRASE, '482913', { N: 1 << 12, r: 8, p: 1 });
    setKdfBackend(nodeBackend);
    calls.scrypt = 0;
    expect(await decryptSecret(jsVault, '482913')).toBe(PHRASE);
    expect(calls.scrypt).toBe(1); // c'est bien le natif qui a calculé
    const nativeVault = await encryptSecret(PHRASE, '482913', { N: 1 << 12, r: 8, p: 1 });
    setKdfBackend(null);
    expect(await decryptSecret(nativeVault, '482913')).toBe(PHRASE);
    await expect(decryptSecret(nativeVault, '000000')).rejects.toMatchObject({ code: 'WRONG_PIN' });
  });

  it('graine BIP-39 identique à @scure (avec et sans phrase secrète)', async () => {
    setKdfBackend(nodeBackend);
    calls.pbkdf2 = 0;
    expect(await mnemonicToSeed(PHRASE)).toEqual(await scureToSeed(PHRASE));
    expect(await mnemonicToSeed(PHRASE, 'TREZOR')).toEqual(await scureToSeed(PHRASE, 'TREZOR'));
    expect(calls.pbkdf2).toBe(2);
  });

  it('graine TON identique (100 000 tours)', async () => {
    // Toute phrase sert : la dérivation ne dépend pas de la validité TON.
    const words = Array.from({ length: 24 }, (_, i) => ['abandon', 'ability', 'able', 'about'][i % 4]).join(' ');
    const sync = tonSeedFromMnemonic(words);
    setKdfBackend(nodeBackend);
    calls.pbkdf2 = 0;
    expect(await tonSeedFromMnemonicAsync(words)).toEqual(sync);
    expect(calls.pbkdf2).toBe(1);
  });

  it('moteur en échec : repli JavaScript, même résultat', async () => {
    const vault = await encryptSecret(PHRASE, '482913', { N: 1 << 12, r: 8, p: 1 });
    setKdfBackend(failing);
    expect(await decryptSecret(vault, '482913')).toBe(PHRASE);
    expect(await mnemonicToSeed(PHRASE)).toEqual(await scureToSeed(PHRASE));
  });

  it('auto-test en cours : les dérivations l’attendent, refus → JavaScript', async () => {
    setKdfBackend(Promise.resolve(null));
    expect(await kdfBackend()).toBeNull();
    setKdfBackend(Promise.resolve(nodeBackend));
    expect(await kdfBackend()).toBe(nodeBackend);
  });
});
