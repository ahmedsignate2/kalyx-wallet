/**
 * Clés locales de la sauvegarde automatique et crochets du coffre.
 *
 * Trousseau simulé EN MÉMOIRE (avec le pare-feu réel de la session leurre) ;
 * tout le reste est réel : secureStore et son journal de changement de PIN,
 * chiffrement scrypt des coffres et de la BDK, format v3 et sa restauration.
 * Le moteur de synchro (Drive, réseau) est remplacé par des espions.
 *
 * Un seul scénario, dans l'ordre : activation, ajouts, suppression, changement
 * de code, session leurre, échec de scellement.
 */
const mockKv = new Map<string, string>();
/** Clés dont l'écriture échoue (disque plein, app tuée) : prédicat piloté par le test. */
let mockFailWrite: (key: string) => boolean = () => false;
const mockDirty = jest.fn();
const mockReset = jest.fn(async () => {});
const mockRegistered: { provider?: () => Promise<unknown>; disabled?: () => Promise<void> } = {};
const mockMarkBackup = jest.fn();
/** Point d'arrêt sur une lecture/écriture du trousseau : pour rejouer les entrelacements (sondes de la revue). */
let mockGate: { match: (k: string, op: 'get' | 'set') => boolean; hit: () => void; wait: Promise<void> } | null = null;
const mockPass = async (k: string, op: 'get' | 'set') => {
  if (mockGate && mockGate.match(k, op)) {
    const g = mockGate;
    mockGate = null;
    g.hit();
    await g.wait;
  }
};

jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
jest.mock('./kv', () => {
  const mode = () => jest.requireActual('./sessionMode') as typeof import('./sessionMode');
  return {
    KV_DEVICE_ONLY: {},
    kvGet: async (k: string) => {
      await mockPass(k, 'get');
      return mode().decoyMayRead(k) ? mockKv.get(k) ?? null : null;
    },
    kvSet: async (k: string, v: string) => {
      await mockPass(k, 'set');
      if (!mode().decoyMayWrite(k)) return;
      if (mockFailWrite(k)) throw new Error('disk');
      mockKv.set(k, v);
    },
    kvDel: async (k: string) => {
      if (!mode().decoyMayWrite(k)) return;
      mockKv.delete(k);
    },
  };
});
jest.mock('./backupSync', () => ({
  markBackupDirty: (r: string) => mockDirty(r),
  resetAutoSync: () => mockReset(),
  registerSyncFileProvider: (p: () => Promise<unknown>) => { mockRegistered.provider = p; },
  onAutoSyncDisabled: (cb: () => Promise<void>) => { mockRegistered.disabled = cb; },
}));
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
jest.mock('./biometrics', () => ({ authenticate: async () => true, biometricPrompt: () => '' }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: jest.fn(async () => {}), clearDiscoveries: () => {} }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./settingsStore', () => ({
  useSettings: { getState: () => ({ setBiometricEnabled: () => {}, markEncryptedBackup: mockMarkBackup }) },
}));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {}, logSys: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));
jest.mock('./sessionReset', () => ({ disconnectWallet: async () => {}, disconnectEverything: async () => {} }));
jest.mock('./whitelistStore', () => ({
  assertSecretsExportable: async () => {},
  whitelistActions: { noteNewWallet: async () => {}, wipe: async () => {} },
}));

import { useWallet, expectRestoredBackup, useLiveBackupDigest } from './walletStore';
import { backupDigest } from './backupDigest';
import { buildSyncFile, isAutoSyncKeysReady, noteBackupChange, sealWalletSecret, setupAutoSyncKeys, teardownAutoSyncKeys, useBackupKeys } from './backupKeys';
import { BACKUP_KEY_VAULT_ID, loadVault, rollbackPinChange } from './secureStore';
import { setDecoySession } from './sessionMode';
import { decryptSecret } from '../src/security/vault';
import { restoreBackup } from '../src/domain/backup/cloudBackup';

jest.setTimeout(60_000);

const PIN = '482917';
const NEW_PIN = '592048';
const PASSWORD = 'correct horse battery staple';
const PHRASE = 'test test test test test test test test test test test junk';
const EVM_KEY = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const W = () => useWallet.getState();
const sealedIds = () => [...mockKv.keys()].filter((k) => k.startsWith('kalyx.backupKeys.sealed.')).map((k) => k.slice('kalyx.backupKeys.sealed.'.length));
const opensWith = async (pin: string) => {
  const v = await loadVault(BACKUP_KEY_VAULT_ID);
  return v ? decryptSecret(v, pin).then(() => true, () => false) : false;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const OTHER = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
function gate(match: (k: string, op: 'get' | 'set') => boolean) {
  let release!: () => void;
  let hitRes!: () => void;
  const hit = new Promise<void>((r) => (hitRes = r));
  const wait = new Promise<void>((r) => (release = r));
  mockGate = { match, hit: hitRes, wait };
  return { hit, release };
}
const allDigest = async () => {
  const accounts: Record<string, { index: number; label: string }[]> = {};
  const { loadAccounts } = jest.requireActual('./secureStore') as typeof import('./secureStore');
  for (const w of W().wallets) if (w.type !== 'watch') accounts[w.id] = (w.id === W().activeWalletId ? W().accounts : (await loadAccounts(w.id)) ?? []);
  return backupDigest(W().wallets, accounts);
};

describe('Sauvegarde automatique : clés locales et crochets', () => {
  it('le fournisseur et le crochet de désactivation sont enregistrés au chargement', async () => {
    await tick();
    expect(typeof mockRegistered.provider).toBe('function');
    expect(typeof mockRegistered.disabled).toBe('function');
  });

  it('synchro inactive : fournisseur nul, aucun scellement, aucune notification', async () => {
    W().setImportedDraft(PHRASE);
    await W().confirmDraft(PIN, { discover: false });
    await W().importPrivateKey(EVM_KEY, PIN, 'Clé', 'evm');
    await W().addWatchWallet('0x8335E7D5d58D27Cf5E8b7a3c0a9F9b8C4A2a2913', 'Suivie').catch(() => {});
    expect(await isAutoSyncKeysReady()).toBe(false);
    expect(await buildSyncFile()).toBeNull();
    expect(sealedIds()).toEqual([]);
    expect(mockDirty).not.toHaveBeenCalled();
  });

  it('activation : le fichier fourni se restaure avec le mot de passe, secrets et comptes exacts', async () => {
    await setupAutoSyncKeys(PASSWORD, PIN);
    expect(await isAutoSyncKeysReady()).toBe(true);
    expect(await opensWith(PIN)).toBe(true);
    const out = await buildSyncFile();
    expect(out?.count).toBe(2); // l'adresse suivie n'a pas de secret
    // Empreinte de CE fichier, rendue avec lui (le moteur l'enregistre telle quelle).
    expect(out?.digest).toBe(await allDigest());
    const r = await restoreBackup(out!.content, PASSWORD);
    expect(r.error).toBeUndefined();
    expect(r.wallets?.map((w) => w.secret).sort()).toEqual([EVM_KEY, PHRASE].sort());
    expect(r.wallets?.find((w) => w.type === 'privateKey')).toMatchObject({ label: 'Clé', keyFamily: 'evm' });
    // Le mauvais mot de passe n'ouvre rien.
    expect((await restoreBackup(out!.content, 'nope')).error).toBe('WRONG_PASSWORD');
  });

  it('création après activation : secret scellé, sauvegarde marquée à renvoyer, présent dans le fichier', async () => {
    mockDirty.mockClear();
    const phrase = await W().createWallet(PIN, 'Nouveau');
    const id = W().activeWalletId;
    expect(sealedIds()).toContain(id);
    expect(mockDirty).toHaveBeenCalled();
    const r = await restoreBackup((await buildSyncFile())!.content, PASSWORD);
    expect(r.wallets?.find((w) => w.label === 'Nouveau')?.secret).toBe(phrase);
  });

  it('renommage, ajout de compte : sauvegarde marquée à renvoyer', async () => {
    mockDirty.mockClear();
    await W().renameWallet(W().activeWalletId, 'Renommé');
    expect(mockDirty).toHaveBeenCalledWith('wallet-renamed');
    await W().addAccount({ pin: PIN }, 'Épargne');
    expect(mockDirty).toHaveBeenCalledWith('account-added');
    const r = await restoreBackup((await buildSyncFile())!.content, PASSWORD);
    expect(r.wallets?.find((w) => w.label === 'Renommé')?.accounts?.map((a) => a.label)).toEqual(['', 'Épargne']);
  });

  it('suppression : enregistrement scellé retiré, absent du fichier', async () => {
    const id = W().activeWalletId;
    mockDirty.mockClear();
    await W().removeWallet(id, { pin: PIN });
    expect(sealedIds()).not.toContain(id);
    expect(mockDirty).toHaveBeenCalledWith('wallet-removed');
    expect((await buildSyncFile())?.count).toBe(2);
  });

  it('changement de PIN : la BDK suit, dans le même journal que les coffres', async () => {
    await W().changePin(PIN, NEW_PIN);
    expect(await opensWith(NEW_PIN)).toBe(true);
    expect(await opensWith(PIN)).toBe(false);
    // Le scellement marche avec le nouveau code.
    await W().importWallet('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', NEW_PIN, 'Après');
    expect(sealedIds()).toContain(W().activeWalletId);
    expect(useBackupKeys.getState().needsReactivation).toBe(false);
  });

  it('changement de PIN interrompu (app tuée) : au relancement, coffres ET BDK reviennent à l’ancien code', async () => {
    // L'écriture de la BDK « tue » l'app : plus aucune écriture de coffre ne passe, journal compris.
    let dead = false;
    mockFailWrite = (k) => {
      if (k === 'kalyx.backupKeys.bdk' && !dead) dead = true;
      return dead && (k === 'kalyx.backupKeys.bdk' || k.startsWith('nova.vault'));
    };
    await expect(W().changePin(NEW_PIN, '111222')).rejects.toThrow('disk');
    expect(mockKv.has('nova.pinChangeJournal')).toBe(true); // journal resté : opération non aboutie
    // Relancement.
    mockFailWrite = () => false;
    expect(await rollbackPinChange()).toBe(true);
    expect(await opensWith(NEW_PIN)).toBe(true);
    expect(await opensWith('111222')).toBe(false);
    const primary = await loadVault('primary');
    expect(await decryptSecret(primary!, NEW_PIN)).toBe(PHRASE);
  });

  it('session leurre : fournisseur nul, aucun scellement', async () => {
    const before = sealedIds();
    setDecoySession(true, ['wDecoy']);
    try {
      expect(await isAutoSyncKeysReady()).toBe(false);
      expect(await buildSyncFile()).toBeNull();
      await sealWalletSecret('wDecoy', 'seed', PHRASE, NEW_PIN);
      expect(sealedIds()).toEqual(before);
    } finally {
      setDecoySession(false);
    }
  });

  it('échec de scellement : le portefeuille est créé quand même, la synchro exige une réactivation', async () => {
    const good = mockKv.get('kalyx.backupKeys.bdk')!;
    mockKv.set('kalyx.backupKeys.bdk', '{abîmé');
    const count = W().wallets.length;
    await W().createWallet(NEW_PIN, 'Sans sceau');
    expect(W().wallets.length).toBe(count + 1);
    expect(sealedIds()).not.toContain(W().activeWalletId);
    expect(useBackupKeys.getState().needsReactivation).toBe(true);
    await expect(buildSyncFile()).rejects.toMatchObject({ code: 'RESEAL_REQUIRED' });
    // Réactiver (mot de passe + PIN) rescelle tout.
    mockKv.set('kalyx.backupKeys.bdk', good);
    await setupAutoSyncKeys(PASSWORD, NEW_PIN);
    expect(useBackupKeys.getState().needsReactivation).toBe(false);
    expect((await buildSyncFile())?.count).toBe(W().wallets.filter((w) => w.type !== 'watch').length);
  });

  it('désactivation : tout est effacé', async () => {
    await mockRegistered.disabled!();
    expect(await isAutoSyncKeysReady()).toBe(false);
    expect([...mockKv.keys()].filter((k) => k.startsWith('kalyx.backupKeys.'))).toEqual([]);
    await setupAutoSyncKeys(PASSWORD, NEW_PIN); // pour la réinitialisation qui suit
  });

  it('réinitialisation : clés effacées et moteur remis à zéro', async () => {
    await W().reset({ pin: NEW_PIN });
    expect(mockReset).toHaveBeenCalled();
    expect([...mockKv.keys()].filter((k) => k.startsWith('kalyx.backupKeys.'))).toEqual([]);
  });
});

describe('Restauration depuis Drive : sauvegarde « à jour » seulement si l’app était vide', () => {
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await tick();
  };

  it('restauration abandonnée puis AUTRE phrase de même forme : jamais marquée à jour (sonde P1)', async () => {
    mockMarkBackup.mockClear();
    expectRestoredBackup([{ label: '', type: 'seed', secret: PHRASE }]);
    W().setImportedDraft(OTHER); // phrase différente, même forme
    await W().confirmDraft(PIN, { discover: false });
    for (let i = 0; i < 50; i++) await tick();
    expect(mockMarkBackup).not.toHaveBeenCalled();
    await W().reset({ pin: PIN }); // l'app redevient vide pour la suite
  });

  it('contrôle : la phrase DE la sauvegarde, même forme, est bien reconnue', async () => {
    mockMarkBackup.mockClear();
    expectRestoredBackup([{ label: '', type: 'seed', secret: PHRASE }]);
    W().setImportedDraft(PHRASE);
    await W().confirmDraft(PIN, { discover: false });
    for (let i = 0; i < 50 && !mockMarkBackup.mock.calls.length; i++) await tick();
    expect(mockMarkBackup).toHaveBeenCalledTimes(1);
    await W().reset({ pin: PIN });
  });

  it('app vide : marquée à jour avec l’empreinte de l’état restauré, une fois TOUT restauré', async () => {
    mockMarkBackup.mockClear();
    expectRestoredBackup([
      { label: '', type: 'seed', secret: PHRASE, accounts: [{ index: 0, label: '' }, { index: 1, label: 'Deux' }] },
      { label: 'Clé', type: 'privateKey', keyFamily: 'evm', secret: EVM_KEY, accounts: [{ index: 0, label: '' }] },
    ]);
    W().setImportedDraft(PHRASE);
    await W().confirmDraft(PIN, { discover: false });
    await W().restoreAccounts(W().activeWalletId, [{ index: 0, label: '' }, { index: 1, label: 'Deux' }], PIN);
    await tick();
    expect(mockMarkBackup).not.toHaveBeenCalled(); // pas encore : la clé importée manque
    await W().importWallets([{ label: 'Clé', type: 'privateKey', keyFamily: 'evm', secret: EVM_KEY, accounts: [{ index: 0, label: '' }] }], PIN);
    await until(() => mockMarkBackup.mock.calls.length > 0);
    expect(mockMarkBackup).toHaveBeenCalledTimes(1);
    expect(mockMarkBackup.mock.calls[0][0]).toBe('drive');
    await until(() => useLiveBackupDigest.getState().digest === mockMarkBackup.mock.calls[0][1]);
    expect(mockMarkBackup.mock.calls[0][1]).toBe(useLiveBackupDigest.getState().digest);
  });

  it('portefeuilles déjà présents : la sauvegarde reste à mettre à jour', async () => {
    mockMarkBackup.mockClear();
    expectRestoredBackup([{ label: 'Clé', type: 'privateKey', keyFamily: 'evm', secret: EVM_KEY }]);
    await W().renameWallet(W().activeWalletId, 'Autre');
    await W().renameWallet(W().activeWalletId, 'Clé');
    for (let i = 0; i < 20; i++) await tick();
    expect(mockMarkBackup).not.toHaveBeenCalled();
    await teardownAutoSyncKeys();
  });
});

describe('Exclusivité : réactivation, scellement et fournisseur ne s’entremêlent pas', () => {
  beforeAll(async () => {
    mockFailWrite = () => false;
    await setupAutoSyncKeys(PASSWORD, PIN);
  });

  it('scellement en cours pendant une réactivation : le fichier reste lisible (sonde P2)', async () => {
    const g = gate((k, op) => op === 'set' && k.startsWith('kalyx.backupKeys.sealed.'));
    const pCreate = W().createWallet(PIN, 'B');
    await g.hit; // le scellement a lu l'ancien état et l'ancienne BDK
    const pSetup = setupAutoSyncKeys(PASSWORD, PIN); // attend le verrou
    g.release();
    await Promise.all([pCreate, pSetup]);
    const out = await buildSyncFile();
    const r = await restoreBackup(out!.content, PASSWORD);
    expect(r.error).toBeUndefined();
    expect(r.wallets?.some((w) => w.label === 'B')).toBe(true);
  });

  it('fournisseur en cours pendant une réactivation : en-tête et sceaux de la MÊME sauvegarde (sonde P3)', async () => {
    const g = gate((k, op) => op === 'get' && k.startsWith('kalyx.backupKeys.sealed.'));
    const pBuild = buildSyncFile();
    await g.hit;
    const pSetup = setupAutoSyncKeys(PASSWORD, PIN);
    g.release();
    const [out] = await Promise.all([pBuild, pSetup]);
    expect((await restoreBackup(out!.content, PASSWORD)).error).toBeUndefined();
    expect((await restoreBackup((await buildSyncFile())!.content, PASSWORD)).error).toBeUndefined();
  });

  it('sceau d’une ancienne sauvegarde resté en place : refusé, réactivation demandée', async () => {
    const id = W().wallets.find((w) => w.type !== 'watch')!.id;
    const key = `kalyx.backupKeys.sealed.${id}`;
    const good = mockKv.get(key)!;
    mockKv.set(key, JSON.stringify({ ...JSON.parse(good), b: 'ancienne' }));
    await expect(buildSyncFile()).rejects.toMatchObject({ code: 'RESEAL_REQUIRED' });
    mockKv.set(key, good);
    expect((await buildSyncFile())?.count).toBeGreaterThan(0);
  });

  it('réactivation interrompue (synchro active) : le fournisseur exige de réactiver au lieu de se taire', async () => {
    mockFailWrite = (k) => k.startsWith('kalyx.backupKeys.sealed.'); // app tuée après l'effacement de l'identifiant
    await expect(setupAutoSyncKeys(PASSWORD, PIN)).rejects.toThrow('disk');
    mockFailWrite = () => false;
    expect(await isAutoSyncKeysReady()).toBe(false);
    await expect(buildSyncFile()).rejects.toMatchObject({ code: 'RESEAL_REQUIRED' });
    mockDirty.mockClear();
    await noteBackupChange('wallet-renamed');
    expect(mockDirty).toHaveBeenCalledWith('wallet-renamed');
    expect(useBackupKeys.getState().needsReactivation).toBe(true);
    // Désactivée pour de bon : silence, comme avant l'activation.
    await teardownAutoSyncKeys();
    expect(await buildSyncFile()).toBeNull();
  });
});
