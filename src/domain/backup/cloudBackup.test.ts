import {
  createBackup,
  createWalletsBackup,
  restoreBackup,
  backupWalletCount,
  BACKUP_VERSION,
  generateBackupKeys,
  wrapBackupKeys,
  unwrapBackupKeys,
  newBackupId,
  normalizeBackupSecret,
  sealSecret,
  openSecret,
  buildV3File,
  canonicalJson,
  type BackupWallet,
  type V3Record,
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
    // Depuis la v2, une LISTE, même pour un seul portefeuille.
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

describe('cloudBackup — format v3', () => {
  const LIST: BackupWallet[] = [
    { label: 'Principal', type: 'seed', secret: M1, accounts: [{ index: 0, label: '' }, { index: 2, label: 'Épargne' }] },
    { label: 'Clé EVM', type: 'privateKey', keyFamily: 'evm', secret: HEXKEY },
  ];
  let blob: string;
  beforeAll(async () => {
    blob = await createWalletsBackup(LIST, 'pw');
  });

  /** Altère un champ du fichier et le resérialise. */
  const tamper = (f: (env: any) => void) => {
    const env = JSON.parse(blob);
    f(env);
    return JSON.stringify(env);
  };

  it('aller-retour v3 : en-tête en clair, tout le reste chiffré', async () => {
    const env = JSON.parse(blob);
    expect(env).toMatchObject({ app: 'kalyx', kind: 'wallets-backup', version: 3, count: 2 });
    expect(env.backupId).toMatch(/^[0-9a-f]{32}$/);
    expect(env.keys).toMatchObject({ kdf: 'scrypt', N: BACKUP_KDF.N, r: BACKUP_KDF.r, p: BACKUP_KDF.p });
    expect(env.vault).toBeUndefined();
    expect(blob).not.toContain('Principal');
    expect(blob).not.toContain('Épargne');
    expect(blob).not.toContain(HEXKEY);
    const r = await restoreBackup(blob, 'pw');
    expect(r.error).toBeUndefined();
    expect(r.wallets).toEqual(LIST);
    expect(r.mnemonic).toBe(M1);
    expect(backupWalletCount(blob)).toBe(2);
  });

  it('mauvais mot de passe → WRONG_PASSWORD', async () => {
    expect(await restoreBackup(blob, 'faux')).toEqual({ error: 'WRONG_PASSWORD' });
  });

  /*
   * L'en-tête en clair est l'AAD du manifeste : le mot de passe déverrouille
   * bien les clés, mais le manifeste refuse de s'ouvrir. C'est une altération,
   * pas un mot de passe faux — `CORRUPTED`.
   */
  it.each([
    ['count', (e: any) => { e.count = 5; }],
    ['createdAt', (e: any) => { e.createdAt = '2000-01-01T00:00:00.000Z'; }],
    ['backupId', (e: any) => { e.backupId = '0'.repeat(32); }],
    ['champ ajouté', (e: any) => { e.extra = 1; }],
    ['manifest.ct', (e: any) => { e.manifest.ct = (e.manifest.ct[0] === 'a' ? 'b' : 'a') + e.manifest.ct.slice(1); }],
    ['manifest.n tronqué', (e: any) => { e.manifest.n = e.manifest.n.slice(2); }],
  ])('altération de %s → CORRUPTED', async (_name, f) => {
    expect((await restoreBackup(tamper(f), 'pw')).error).toBe('CORRUPTED');
  });

  /*
   * Les clés emballées, elles, ne sont authentifiées que par le mot de passe :
   * un N différent (mais dans les bornes) dérive une autre clé, et GCM ne peut
   * pas dire si c'est le mot de passe ou le fichier qui est faux. D'où
   * WRONG_PASSWORD. Hors bornes, en revanche, c'est refusé avant calcul.
   */
  it('keys.N altéré dans les bornes → WRONG_PASSWORD (indiscernable) ; hors bornes → CORRUPTED', async () => {
    expect((await restoreBackup(tamper((e) => { e.keys.N = 1 << 14; }), 'pw')).error).toBe('WRONG_PASSWORD');
    expect((await restoreBackup(tamper((e) => { e.keys.N = 1 << 24; }), 'pw')).error).toBe('CORRUPTED');
    expect((await restoreBackup(tamper((e) => { e.keys.ct = e.keys.ct.slice(2); }), 'pw')).error).toBe('CORRUPTED');
  });

  it('les clés d’une AUTRE sauvegarde (même mot de passe) → CORRUPTED', async () => {
    const other = JSON.parse(await createWalletsBackup(LIST, 'pw'));
    expect((await restoreBackup(tamper((e) => { e.keys = other.keys; }), 'pw')).error).toBe('CORRUPTED');
  });

  it('version > 3 → TOO_RECENT', async () => {
    expect((await restoreBackup(tamper((e) => { e.version = 4; }), 'pw')).error).toBe('TOO_RECENT');
  });

  it('KDF hors bornes refusé AVANT scrypt', async () => {
    const w = await wrapBackupKeys(generateBackupKeys(), 'pw');
    for (const bad of [{ N: 1 << 24 }, { N: 1000 }, { r: 64 }, { p: 16 }, { N: 1.5 }]) {
      await expect(unwrapBackupKeys({ ...w, ...bad }, 'pw')).rejects.toThrow('CORRUPTED');
    }
    await expect(unwrapBackupKeys({ ...w, kdf: 'argon2' as 'scrypt' }, 'pw')).rejects.toThrow('CORRUPTED');
    await expect(unwrapBackupKeys({ ...w, nonce: 'zz' }, 'pw')).rejects.toThrow('CORRUPTED');
  });

  it('wrap/unwrap : bonnes clés rendues, mauvais mot de passe → WRONG_PASSWORD', async () => {
    const k = generateBackupKeys();
    const w = await wrapBackupKeys(k, 'pw');
    const u = await unwrapBackupKeys(w, 'pw');
    expect(u.bdk).toEqual(k.bdk);
    expect(u.mk).toEqual(k.mk);
    await expect(unwrapBackupKeys(w, 'autre')).rejects.toThrow('WRONG_PASSWORD');
  });

  it('un secret déplacé vers un autre enregistrement ou une autre sauvegarde ne s’ouvre pas', () => {
    const { bdk } = generateBackupKeys();
    const id = newBackupId();
    const s = sealSecret(bdk, id, 'a', 'secret');
    expect(openSecret(bdk, id, 'a', s)).toBe('secret');
    expect(() => openSecret(bdk, id, 'b', s)).toThrow('CORRUPTED');
    expect(() => openSecret(bdk, newBackupId(), 'a', s)).toThrow('CORRUPTED');
    expect(() => openSecret(bdk, id, 'a', { n: s.n, ct: 'zz' })).toThrow('CORRUPTED');
  });

  it('dans un fichier, échanger les secrets de deux enregistrements → CORRUPTED', async () => {
    const keys = generateBackupKeys();
    const wrapped = await wrapBackupKeys(keys, 'pw');
    const backupId = newBackupId();
    const s0 = sealSecret(keys.bdk, backupId, 'r0', M1);
    const s1 = sealSecret(keys.bdk, backupId, 'r1', M2);
    const swapped: V3Record[] = [
      { id: 'r0', label: 'A', type: 'seed', secret: s1 },
      { id: 'r1', label: 'B', type: 'seed', secret: s0 },
    ];
    // MK seule : le fichier se reconstruit sans la BDK (synchro en arrière-plan).
    expect((await restoreBackup(buildV3File({ backupId, mk: keys.mk, wrapped, records: swapped }), 'pw')).error).toBe('CORRUPTED');
  });

  it('bout en bout : buildV3File (MK seule) → unwrap → openSecret, puis restoreBackup', async () => {
    const keys = generateBackupKeys();
    const wrapped = await wrapBackupKeys(keys, 'pw');
    const backupId = newBackupId();
    const records: V3Record[] = [
      { id: 'x1', label: 'Mon BTC', type: 'privateKey', keyFamily: 'bitcoin', secret: sealSecret(keys.bdk, backupId, 'x1', normalizeBackupSecret('privateKey', `  ${HEXKEY} `)) },
      { id: 'x2', label: '', type: 'seed', secret: sealSecret(keys.bdk, backupId, 'x2', normalizeBackupSecret('seed', `  ${M2.toUpperCase()}\n`)) },
    ];
    const text = buildV3File({ backupId, mk: keys.mk, wrapped, records, createdAt: '2026-01-01T00:00:00.000Z' });
    const env = JSON.parse(text);
    expect(env.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(env.count).toBe(2);
    const u = await unwrapBackupKeys(env.keys, 'pw');
    expect(openSecret(u.bdk, env.backupId, 'x1', records[0].secret)).toBe(HEXKEY);
    expect(openSecret(u.bdk, env.backupId, 'x2', records[1].secret)).toBe(M2);
    const r = await restoreBackup(text, 'pw');
    expect(r.wallets).toEqual([
      { label: 'Mon BTC', type: 'privateKey', keyFamily: 'bitcoin', secret: HEXKEY },
      { label: '', type: 'seed', secret: M2 },
    ]);
    expect(r.mnemonic).toBe(M2);
  });

  it('JSON canonique stable quel que soit l’ordre des clés', () => {
    const a = { b: 1, a: { d: [{ y: 1, x: 2 }], c: 'z' } };
    const b = { a: { c: 'z', d: [{ x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"z","d":[{"x":2,"y":1}]},"b":1}');
  });

  it('un fichier dont l’ordre des clés a été changé reste lisible', async () => {
    const env = JSON.parse(blob);
    const reordered: Record<string, unknown> = {};
    for (const k of Object.keys(env).reverse()) reordered[k] = env[k];
    reordered.keys = Object.fromEntries(Object.entries(env.keys).reverse());
    expect((await restoreBackup(JSON.stringify(reordered), 'pw')).wallets).toEqual(LIST);
  });
});

describe('cloudBackup — lecture d’une v2 écrite par l’ancien code', () => {
  it('liste chiffrée directement sous le mot de passe (encryptSecret)', async () => {
    // Reproduction exacte de l'ancien createWalletsBackup.
    const list = [
      { label: 'Principal', type: 'seed', accounts: [{ index: 1, label: 'Épargne' }], secret: M1 },
      { label: 'Clé', type: 'privateKey', keyFamily: 'solana', secret: HEXKEY },
    ];
    const vault = await encryptSecret(JSON.stringify(list), 'pw', BACKUP_KDF);
    const v2 = JSON.stringify({ app: 'kalyx', kind: 'wallets-backup', version: 2, createdAt: new Date().toISOString(), vault, count: 2 }, null, 2);
    expect(backupWalletCount(v2)).toBe(2);
    const r = await restoreBackup(v2, 'pw');
    expect(r.error).toBeUndefined();
    expect(r.wallets).toEqual(list);
    expect(r.mnemonic).toBe(M1);
    expect((await restoreBackup(v2, 'faux')).error).toBe('WRONG_PASSWORD');
  });
});
