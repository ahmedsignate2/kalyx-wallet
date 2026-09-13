import { createBackup, restoreBackup, BACKUP_VERSION } from './cloudBackup';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('cloudBackup', () => {
  it('round-trip : chiffre puis déchiffre avec le bon mot de passe', async () => {
    const blob = await createBackup(M, 'S3cret!!');
    const env = JSON.parse(blob);
    expect(env.app).toBe('kalyx');
    expect(env.kind).toBe('seed-backup');
    expect(env.version).toBe(BACKUP_VERSION);
    expect(blob).not.toContain('abandon'); // la seed n'apparaît JAMAIS en clair
    const { mnemonic, error } = await restoreBackup(blob, 'S3cret!!');
    expect(error).toBeUndefined();
    expect(mnemonic).toBe(M);
  });

  it('mot de passe faux → erreur claire, pas de seed', async () => {
    const blob = await createBackup(M, 'bon-mdp');
    const { mnemonic, error } = await restoreBackup(blob, 'mauvais-mdp');
    expect(mnemonic).toBeUndefined();
    expect(error).toMatch(/mot de passe/i);
  });

  it('rejette un fichier non-Kalyx / illisible', async () => {
    expect((await restoreBackup('pas du json', 'x')).error).toMatch(/illisible/i);
    expect((await restoreBackup(JSON.stringify({ app: 'autre' }), 'x')).error).toMatch(/valide/i);
  });

  it('rejette une version future', async () => {
    const blob = await createBackup(M, 'pw');
    const env = JSON.parse(blob);
    env.version = 999;
    const { error } = await restoreBackup(JSON.stringify(env), 'pw');
    expect(error).toMatch(/récente/i);
  });
});
