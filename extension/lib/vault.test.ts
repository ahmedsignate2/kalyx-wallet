import { describe, expect, it, test } from 'vitest';
import { addSecret, calibrateKdf, changeVaultPassword, createVault, EXT_KDF, parseVault, readSecret, removeSecret, unlockVault } from './vault';
import { createWalletsBackup, restoreBackup } from '../../src/domain/backup/cloudBackup';

const FAST = { N: 1 << 10, r: 8, p: 1 };
const PW = 'Plage-Orange-47!';
const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('coffre de l’extension', () => {
  test('créer, sceller une phrase, rouvrir avec le mot de passe', async () => {
    const { vault, vaultKey } = await createVault(PW, FAST);
    const v2 = addSecret(vault, vaultKey, 'w1', 'seed', PHRASE);
    expect(JSON.stringify(v2)).not.toContain('abandon'); // rien en clair
    const key = await unlockVault(parseVault(JSON.parse(JSON.stringify(v2))), PW);
    expect(readSecret(v2, key, 'w1')).toEqual({ kind: 'seed', secret: PHRASE });
  });

  test('mauvais mot de passe : WRONG_PASSWORD', async () => {
    const { vault } = await createVault(PW, FAST);
    await expect(unlockVault(vault, 'autre-mot-de-passe')).rejects.toThrow('WRONG_PASSWORD');
  });

  test('changer de mot de passe : les secrets restent, l’ancien ne marche plus', async () => {
    const { vault, vaultKey } = await createVault(PW, FAST);
    const v1 = addSecret(vault, vaultKey, 'w1', 'seed', PHRASE);
    const v2 = await changeVaultPassword(v1, PW, 'Nouveau-Mot-2026!', FAST);
    expect(v2.wallets).toEqual(v1.wallets);
    expect(v2.kdf.salt).not.toBe(v1.kdf.salt);
    await expect(unlockVault(v2, PW)).rejects.toThrow('WRONG_PASSWORD');
    expect(readSecret(v2, await unlockVault(v2, 'Nouveau-Mot-2026!'), 'w1').secret).toBe(PHRASE);
  });

  test('un secret recopié sous un autre identifiant ne s’ouvre pas', async () => {
    const { vault, vaultKey } = await createVault(PW, FAST);
    const v1 = addSecret(vault, vaultKey, 'w1', 'seed', PHRASE);
    const swapped = { ...v1, wallets: { w2: v1.wallets.w1 } };
    expect(() => readSecret(swapped, vaultKey, 'w2')).toThrow('CORRUPTED');
  });

  test('un secret d’un AUTRE coffre (même clé, autre id) ne s’ouvre pas', async () => {
    const a = await createVault(PW, FAST);
    const v1 = addSecret(a.vault, a.vaultKey, 'w1', 'seed', PHRASE);
    expect(() => readSecret({ ...v1, id: '0'.repeat(32) }, a.vaultKey, 'w1')).toThrow('CORRUPTED');
  });

  test('supprimer un portefeuille', async () => {
    const { vault, vaultKey } = await createVault(PW, FAST);
    const v = removeSecret(addSecret(vault, vaultKey, 'w1', 'seed', PHRASE), 'w1');
    expect(() => readSecret(v, vaultKey, 'w1')).toThrow('UNKNOWN_WALLET');
  });

  test('coffre altéré : refusé AVANT tout calcul (paramètres scrypt démesurés, formes invalides)', async () => {
    const { vault } = await createVault(PW, FAST);
    expect(() => parseVault({ ...vault, kdf: { ...vault.kdf, N: 1 << 24 } })).toThrow('CORRUPTED');
    expect(() => parseVault({ ...vault, key: { n: 'zz', ct: '' } })).toThrow('CORRUPTED');
    expect(() => parseVault({ ...vault, wallets: { '../x': { kind: 'seed', secret: { n: '00', ct: '00' } } } })).toThrow('CORRUPTED');
    expect(() => parseVault(null)).toThrow('CORRUPTED');
  });

  test('réglages de production : scrypt 2^17, temps mesuré', async () => {
    const t0 = Date.now();
    const { vault } = await createVault(PW);
    expect(vault.kdf.N).toBe(EXT_KDF.N);
    const created = Date.now() - t0;
    const t1 = Date.now();
    await unlockVault(vault, PW);
    console.log(`scrypt 2^17 : création ${created} ms, déverrouillage ${Date.now() - t1} ms`);
  });
});

describe('sauvegarde chiffrée du MOBILE', () => {
  test('un fichier créé par le code du mobile s’ouvre dans l’extension et se range dans son coffre', async () => {
    const file = await createWalletsBackup([{ label: 'Principal', secret: PHRASE, type: 'seed' }], 'Sauvegarde-Mobile-9');
    const { wallets, error } = await restoreBackup(file, 'Sauvegarde-Mobile-9');
    expect(error).toBeUndefined();
    if (!wallets) throw new Error('aucun portefeuille');
    expect(wallets[0].secret).toBe(PHRASE);
    expect((await restoreBackup(file, 'mauvais-mot-de-passe')).error).toBeDefined();
    const { vault, vaultKey } = await createVault(PW, FAST);
    const v = addSecret(vault, vaultKey, 'primary', 'seed', wallets[0].secret);
    expect(readSecret(v, vaultKey, 'primary').secret).toBe(PHRASE);
  });
});

describe('calibrateKdf', () => {
  const clock = (probeMs: number) => {
    let t = 0;
    return { derive: async () => { t += probeMs; return new Uint8Array(32); }, now: () => t };
  };
  it('garde 2^17 sur un appareil rapide', async () => {
    expect((await calibrateKdf(clock(20))).N).toBe(1 << 17);
  });
  it('descend sur un moteur lent', async () => {
    expect((await calibrateKdf(clock(150))).N).toBe(1 << 16);
  });
  it('ne descend jamais sous 2^15', async () => {
    expect((await calibrateKdf(clock(5000))).N).toBe(1 << 15);
  });
  it('mesure réellement scrypt sans réglage imposé', async () => {
    const k = await calibrateKdf();
    expect(k.r).toBe(8);
    expect(k.N).toBeGreaterThanOrEqual(1 << 15);
  });
});
