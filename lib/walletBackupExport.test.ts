/**
 * Export de sauvegarde × empreinte, dans le vrai magasin (stockage simulé).
 *  - un portefeuille à secret sans coffre REFUSE l'export (plus de sauvegarde
 *    incomplète annoncée réussie) ;
 *  - l'empreinte retenue est celle du contenu exporté, et l'empreinte courante
 *    change quand un portefeuille s'ajoute.
 */
const mockVaults = new Map<string, unknown>();
jest.mock('./secureStore', () => {
  const accounts = new Map<string, unknown>();
  let wallets: unknown[] = [];
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    saveVault: async (id: string, v: unknown) => { mockVaults.set(id, v); },
    loadVault: async (id: string) => mockVaults.get(id) ?? null,
    hasVault: async (id: string) => mockVaults.has(id),
    saveAccounts: async (id: string, a: unknown) => { accounts.set(id, clone(a)); },
    loadAccounts: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    loadAccountsStrict: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    enableBiometricSeed: async () => {},
    disableBiometricSeed: async () => {},
    readBiometricSeed: async () => null,
    hasBiometricSeed: async () => false,
    saveWalletsList: async (l: unknown[]) => { wallets = clone(l); },
    loadWalletsList: async () => clone(wallets),
    saveLockState: async () => {},
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    wipeWallet: async () => {},
    wipeAll: async () => {},
  };
});
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
jest.mock('./kv', () => ({ kvGet: async () => null, kvSet: async () => {}, kvDel: async () => {} }));
jest.mock('./biometrics', () => ({ authenticate: async () => true }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: jest.fn(async () => {}) }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ setBiometricEnabled: () => {} }) } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));

// eslint-disable-next-line import/first
import { useWallet, useLiveBackupDigest, backupDigestToRecord } from './walletStore';
// eslint-disable-next-line import/first
import { backupDigest } from './backupDigest';

const PIN = '482917';
const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const W = () => useWallet.getState();
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('exportAllWallets × empreinte de sauvegarde', () => {
  it('l’export retient l’empreinte de ce qu’il contient, égale à l’empreinte courante', async () => {
    W().setImportedDraft(PHRASE);
    await W().confirmDraft(PIN);
    const all = await W().exportAllWallets({ pin: PIN });
    expect(all).toHaveLength(1);
    await settle();
    const live = useLiveBackupDigest.getState().digest;
    expect(live).toMatch(/^[0-9a-f]{64}$/);
    expect(backupDigestToRecord()).toBe(live);
    expect(live).toBe(backupDigest(W().wallets, { [W().activeWalletId]: W().accounts }));
  });

  it('une adresse suivie (sans coffre) n’empêche pas l’export et ne change pas l’empreinte', async () => {
    const before = useLiveBackupDigest.getState().digest;
    useWallet.setState({ wallets: [...W().wallets, { id: 'watch-1', label: 'Suivi', type: 'watch' }] });
    await settle();
    expect(useLiveBackupDigest.getState().digest).toBe(before);
    expect(await W().exportAllWallets({ pin: PIN })).toHaveLength(1);
  });

  it('un portefeuille à secret SANS coffre : export refusé (VAULT_MISSING), l’empreinte courante change', async () => {
    const before = useLiveBackupDigest.getState().digest;
    useWallet.setState({ wallets: [...W().wallets, { id: 'ghost', label: '', type: 'seed' }] });
    await settle();
    expect(useLiveBackupDigest.getState().digest).not.toBe(before);
    await expect(W().exportAllWallets({ pin: PIN })).rejects.toMatchObject({ code: 'VAULT_MISSING' });
    // La sauvegarde précédente reste « celle d'avant » : son empreinte ne couvre pas le nouveau.
    expect(backupDigestToRecord()).toBe(before);
    expect(mockVaults.has('ghost')).toBe(false);
  });
});
