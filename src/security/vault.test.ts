import {
  encryptSecret,
  decryptSecret,
  serializeVault,
  deserializeVault,
} from './vault';
import { isWalletError } from '../domain/errors';

const SEED_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '824193';

describe('coffre chiffré (AES-256-GCM + scrypt)', () => {
  it('chiffre puis déchiffre avec le bon PIN', async () => {
    const vault = await encryptSecret(SEED_PHRASE, PIN);
    const out = await decryptSecret(vault, PIN);
    expect(out).toBe(SEED_PHRASE);
  });

  it('ne stocke jamais le clair : le secret n’apparaît pas dans le coffre', async () => {
    const vault = await encryptSecret(SEED_PHRASE, PIN);
    const blob = serializeVault(vault);
    expect(blob).not.toContain('abandon');
    expect(blob).not.toContain('about');
  });

  it('sel + nonce aléatoires : deux chiffrements diffèrent', async () => {
    const a = await encryptSecret(SEED_PHRASE, PIN);
    const b = await encryptSecret(SEED_PHRASE, PIN);
    expect(a.ct).not.toBe(b.ct);
    expect(a.salt).not.toBe(b.salt);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('rejette un mauvais PIN (WRONG_PIN)', async () => {
    const vault = await encryptSecret(SEED_PHRASE, PIN);
    try {
      await decryptSecret(vault, '999999');
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('WRONG_PIN');
    }
  });

  it('détecte une altération du ciphertext (intégrité GCM)', async () => {
    const vault = await encryptSecret(SEED_PHRASE, PIN);
    // Retourne un octet du ciphertext.
    const flipped = { ...vault, ct: vault.ct.slice(0, -2) + (vault.ct.endsWith('00') ? 'ff' : '00') };
    await expect(decryptSecret(flipped, PIN)).rejects.toMatchObject({ code: 'WRONG_PIN' });
  });

  it('survit à la sérialisation SecureStore (round-trip)', async () => {
    const vault = await encryptSecret(SEED_PHRASE, PIN);
    const restored = deserializeVault(serializeVault(vault));
    expect(await decryptSecret(restored, PIN)).toBe(SEED_PHRASE);
  });

  it('rejette un coffre illisible', () => {
    try {
      deserializeVault('{pas du json');
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('VAULT_CORRUPTED');
    }
  });
});
