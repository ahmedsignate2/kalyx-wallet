import {
  createBackup,
  createWalletsBackup,
  restoreBackup,
  backupWalletCount,
  BACKUP_VERSION,
  type BackupWallet,
} from './cloudBackup';
import { encryptSecret, BACKUP_KDF } from '../../security/vault';

const M1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const M2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const HEXKEY = '1'.repeat(64);

describe('cloudBackup — une seule phrase', () => {
  it('round-trip : chiffre puis déchiffre avec le bon mot de passe', async () => {
    const blob = await createBackup(M1, 'S3cret!!');
    const env = JSON.parse(blob);
    expect(env.app).toBe('kalyx');
    // La v2 emporte une LISTE, même pour un seul portefeuille.
    expect(env.kind).toBe('wallets-backup');
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.count).toBe(1);
    expect(blob).not.toContain('abandon'); // la phrase n'apparaît JAMAIS en clair
    const r = await restoreBackup(blob, 'S3cret!!');
    expect(r.error).toBeUndefined();
    expect(r.mnemonic).toBe(M1);
    expect(r.wallets).toEqual([{ label: '', type: 'seed', secret: M1 }]);
  });

  it('mot de passe faux → un CODE, et aucune phrase', async () => {
    const blob = await createBackup(M1, 'bon-mdp');
    const r = await restoreBackup(blob, 'mauvais-mdp');
    expect(r.mnemonic).toBeUndefined();
    expect(r.wallets).toBeUndefined();
    // Un code, pas une phrase française : l'écran traduit.
    expect(r.error).toBe('WRONG_PASSWORD');
  });

  it('rejette un fichier illisible ou étranger', async () => {
    expect((await restoreBackup('pas du json', 'x')).error).toBe('UNREADABLE');
    expect((await restoreBackup(JSON.stringify({ app: 'autre' }), 'x')).error).toBe('NOT_A_BACKUP');
  });

  it('rejette une version future', async () => {
    const env = JSON.parse(await createBackup(M1, 'pw'));
    env.version = 999;
    expect((await restoreBackup(JSON.stringify(env), 'pw')).error).toBe('TOO_RECENT');
  });
});

describe('cloudBackup — TOUS les portefeuilles', () => {
  /*
   * LE DÉFAUT CORRIGÉ. La sauvegarde n'emportait qu'un portefeuille : trois créés,
   * un seul sauvegardé, et la restauration RÉUSSISSAIT — donc rien n'avertissait
   * de la perte des deux autres. C'est le pire genre de sauvegarde, celle qui
   * donne confiance et ne tient pas.
   */
  const THREE: BackupWallet[] = [
    { label: 'Principal', type: 'seed', secret: M1 },
    { label: 'Second', type: 'seed', secret: M2 },
    { label: 'Clé BTC', type: 'privateKey', keyFamily: 'bitcoin', secret: HEXKEY },
  ];

  it('les trois font l’aller-retour, étiquettes et familles comprises', async () => {
    const blob = await createWalletsBackup(THREE, 'pw');
    expect(JSON.parse(blob).count).toBe(3);
    const r = await restoreBackup(blob, 'pw');
    expect(r.error).toBeUndefined();
    expect(r.wallets).toEqual(THREE);
  });

  it('aucun secret n’apparaît en clair dans le fichier', async () => {
    const blob = await createWalletsBackup(THREE, 'pw');
    expect(blob).not.toContain('abandon');
    expect(blob).not.toContain('sausage');
    expect(blob).not.toContain(HEXKEY);
    // L'étiquette non plus : elle est chiffrée avec le reste.
    expect(blob).not.toContain('Principal');
  });

  /** Le nombre est lisible SANS le mot de passe, pour l'annoncer avant de déchiffrer. */
  it('le nombre de portefeuilles se lit sans mot de passe', async () => {
    expect(backupWalletCount(await createWalletsBackup(THREE, 'pw'))).toBe(3);
    expect(backupWalletCount(await createBackup(M1, 'pw'))).toBe(1);
    expect(backupWalletCount('pas du json')).toBeNull();
  });

  it('`mnemonic` rend la PREMIÈRE phrase, pour les appelants existants', async () => {
    const r = await restoreBackup(await createWalletsBackup(THREE, 'pw'), 'pw');
    expect(r.mnemonic).toBe(M1);
  });

  it('une liste vide est refusée à la création', async () => {
    await expect(createWalletsBackup([], 'pw')).rejects.toThrow();
  });

  /*
   * Une phrase invalide fait échouer TOUTE la restauration. Restaurer deux
   * portefeuilles sur trois en silence laisserait l'utilisateur croire qu'il a
   * tout récupéré — un échec visible vaut mieux qu'une perte discrète.
   */
  it('une phrase corrompue fait échouer l’ensemble, pas une partie', async () => {
    const blob = await createWalletsBackup(
      [{ label: '', type: 'seed', secret: M1 }, { label: '', type: 'seed', secret: 'trois mots seulement' }],
      'pw',
    );
    const r = await restoreBackup(blob, 'pw');
    expect(r.error).toBe('CORRUPTED');
    expect(r.wallets).toBeUndefined();
  });

  it('un contenu chiffré qui n’est pas une liste est signalé corrompu', async () => {
    const vault = await encryptSecret('{"pas":"une liste"}', 'pw', BACKUP_KDF);
    const env = { app: 'kalyx', kind: 'wallets-backup', version: 2, createdAt: '', vault, count: 1 };
    expect((await restoreBackup(JSON.stringify(env), 'pw')).error).toBe('CORRUPTED');
  });
});

describe('cloudBackup — compatibilité v1', () => {
  /*
   * Les anciennes sauvegardes restent LISIBLES. Casser ce format ferait perdre à
   * quelqu'un l'accès à ses fonds, ce qu'aucune amélioration ne justifie.
   */
  it('lit une enveloppe v1 `seed-backup` et la normalise en liste', async () => {
    const vault = await encryptSecret(M1, 'pw', BACKUP_KDF);
    const v1 = { app: 'kalyx', kind: 'seed-backup', version: 1, createdAt: '', vault };
    const r = await restoreBackup(JSON.stringify(v1), 'pw');
    expect(r.error).toBeUndefined();
    expect(r.mnemonic).toBe(M1);
    expect(r.wallets).toEqual([{ label: '', type: 'seed', secret: M1 }]);
  });

  it('accepte l’ancien nom d’app `nova`', async () => {
    const vault = await encryptSecret(M1, 'pw', BACKUP_KDF);
    const v1 = { app: 'nova', kind: 'seed-backup', version: 1, createdAt: '', vault };
    expect((await restoreBackup(JSON.stringify(v1), 'pw')).mnemonic).toBe(M1);
  });

  it('une v1 dont le contenu n’est pas une phrase est corrompue', async () => {
    const vault = await encryptSecret('pas une phrase', 'pw', BACKUP_KDF);
    const v1 = { app: 'kalyx', kind: 'seed-backup', version: 1, createdAt: '', vault };
    expect((await restoreBackup(JSON.stringify(v1), 'pw')).error).toBe('CORRUPTED');
  });
});

describe('Sauvegarde contenant une phrase TON', () => {
  // Phrase Tonkeeper officielle (vecteur @ton/crypto) : PAS une phrase BIP-39.
  const TON = require('../chains/ton/tonkeeper-vectors.json').keys[0].phrase as string;
  const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('se restaure entièrement (elle rendait toute la sauvegarde « corrompue »)', async () => {
    const list: BackupWallet[] = [
      { label: 'TON', type: 'seed', secret: TON },
      { label: 'Principal', type: 'seed', secret: M },
    ];
    const r = await restoreBackup(await createWalletsBackup(list, 'pw'), 'pw');
    expect(r.error).toBeUndefined();
    expect(r.wallets).toEqual(list);
    // La phrase « principale » reste la BIP-39, même listée après la phrase TON.
    expect(r.mnemonic).toBe(M);
  });
});

describe('cloudBackup — comptes de chaque portefeuille', () => {
  it('les comptes (numéro + nom) font l’aller-retour ; sans eux, rien n’est inventé', async () => {
    const blob = await createWalletsBackup(
      [
        { label: 'Principal', type: 'seed', secret: M1, accounts: [{ index: 0, label: '' }, { index: 1, label: 'Épargne' }, { index: 3, label: 'Jeux' }] },
        { label: 'Second', type: 'seed', secret: M2 },
      ],
      'pw',
    );
    const r = await restoreBackup(blob, 'pw');
    expect(r.wallets?.[0].accounts).toEqual([{ index: 0, label: '' }, { index: 1, label: 'Épargne' }, { index: 3, label: 'Jeux' }]);
    expect(r.wallets?.[1].accounts).toBeUndefined();
  });

  it('entrées invalides d’une sauvegarde écartées (index hors bornes, doublons, types)', async () => {
    const { sanitizeBackupAccounts } = await import('./cloudBackup');
    expect(sanitizeBackupAccounts([{ index: 1, label: 'a' }, { index: 1, label: 'b' }, { index: -1 }, { index: 1.5 }, { index: 5000 }, 'x', { index: 2, label: 42 }])).toEqual([
      { index: 1, label: 'a' },
      { index: 2, label: '' },
    ]);
    expect(sanitizeBackupAccounts('pas une liste')).toBeUndefined();
  });
});
