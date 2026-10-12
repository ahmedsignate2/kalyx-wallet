/**
 * CODE OUBLIÉ : effacement d'urgence SANS déverrouillage (walletStore,
 * `wipeForgottenCode`), et abandon d'une demande biométrique (`isCancelled`).
 *
 * Environnement repris de walletBiometricPin.test.ts (stockage en mémoire,
 * chiffrement et dérivations RÉELS). Ce qui compte ici : l'effacement passe
 * même bloqué et en session leurre, ne lit AUCUN coffre ni entrée biométrique,
 * et ne remet le compteur d'essais à zéro qu'une fois les coffres partis.
 */
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';
import { decoyMayWrite, isDecoySession, setDecoySession } from './sessionMode';

const mockVaults = new Map<string, unknown>();
let mockWallets: unknown[] = [];
let mockWipeAllFails = false;
const mockLockWrites: number[][] = [];
const mockContactWrites: unknown[] = [];
const mockRecentWrites: unknown[] = [];
let mockOS = 'ios';
jest.mock('react-native', () => ({ Platform: { get OS() { return mockOS; } } }));
jest.mock('./secureStore', () => {
  const accounts = new Map<string, unknown>();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    BACKUP_KEY_VAULT_ID: '@backup-bdk',
    saveVault: async (id: string, v: unknown) => { mockVaults.set(id, v); },
    loadVault: async (id: string) => { mockVaultReads++; return mockVaults.get(id) ?? null; },
    hasVault: async (id: string) => mockVaults.has(id),
    saveAccounts: async (id: string, a: unknown) => { accounts.set(id, clone(a)); },
    loadAccounts: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    loadAccountsStrict: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    enableBiometricSeed: async () => {},
    disableBiometricSeed: async () => {},
    isBiometricSeedGated: async () => false,
    hasBiometricSeed: async () => false,
    readBiometricSeed: async () => null,
    readLegacyBiometricSeed: async () => null,
    purgeLegacyBiometricSeed: async () => {},
    saveWalletsList: async (l: unknown[]) => { mockWallets = clone(l); },
    loadWalletsList: async () => clone(mockWallets),
    saveLockState: async (n: number, t: number) => { mockLockWrites.push([n, t]); },
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    commitPinChange: async () => {},
    rollbackPinChange: async () => false,
    wipeWallet: async (id: string) => { mockVaults.delete(id); accounts.delete(id); },
    wipeAll: async () => {
      if (mockWipeAllFails) throw new Error('keychain refused');
      for (const k of [...mockVaults.keys()]) if (k !== mockDuressId) mockVaults.delete(k);
      mockWallets = [];
    },
    wipeBackupKeyVault: async () => {},
    loadContactsRaw: async () => null,
    saveContacts: async (l: unknown) => { mockContactWrites.push(l); },
    saveRecentRecipients: async (l: unknown) => { mockRecentWrites.push(l); },
    saveSettings: async () => {},
    loadSettings: async () => null,
  };
});
let mockVaultReads = 0;
let mockDuressId = '';
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));

// Trousseau en mémoire, AVEC le pare-feu de la session leurre (comme lib/kv.ts).
const mockKv = new Map<string, { v: string; gated: boolean }>();
let mockGatedReads = 0;
jest.mock('./kv', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sm = require('./sessionMode') as typeof import('./sessionMode');
  return {
    KV_DEVICE_ONLY: {},
    kvGet: async (k: string, o?: { requireAuthentication?: boolean }) => {
      if (o?.requireAuthentication) mockGatedReads++;
      if (!sm.decoyMayRead(k)) return null;
      return mockKv.get(k)?.v ?? null;
    },
    kvSet: async (k: string, v: string, o?: { requireAuthentication?: boolean }) => {
      if (!sm.decoyMayWrite(k)) return;
      mockKv.set(k, { v, gated: !!o?.requireAuthentication });
    },
    kvDel: async (k: string) => {
      if (!sm.decoyMayWrite(k)) return;
      mockKv.delete(k);
    },
  };
});
let mockLateBiometric: (() => void) | null = null;
jest.mock('./biometrics', () => ({ authenticate: async () => true, biometricPrompt: () => 'Kalyx' }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: jest.fn(async () => {}), clearDiscoveries: () => {} }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
const mockDisconnect = jest.fn(async () => {});
jest.mock('./sessionReset', () => ({ disconnectEverything: () => mockDisconnect() }));
const mockSettings = { setBiometricEnabled: jest.fn(), setProfileName: jest.fn(), setPinLength: jest.fn(), setBackupVerified: jest.fn() };
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => mockSettings } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {}, logSys: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));
const mockWhitelistWipe = jest.fn(async () => {});
jest.mock('./whitelistStore', () => ({ whitelistActions: { wipe: () => mockWhitelistWipe() }, assertSecretsExportable: async () => {} }));
const mockContactsLoad = jest.fn(async () => {});
jest.mock('./contactsStore', () => ({ useContacts: { getState: () => ({ load: mockContactsLoad }) } }));
jest.mock('./recentRecipientsStore', () => ({ useRecentRecipients: { getState: () => ({ load: async () => {} }) } }));
const mockAutoSyncWipe = jest.fn(async () => {});
jest.mock('./backupKeys', () => ({
  ...jest.requireActual('./backupKeys'),
  wipeAutoSyncOnReset: () => mockAutoSyncWipe(),
}));

import { useWallet } from './walletStore';
import { hasBiometricPin } from './biometricPin';

const PIN = '482917';
const DURESS = '913562';
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; meta?: { reason?: string } }) => `${e.code ?? ''}|${e.meta?.reason ?? ''}`);

async function freshWallet(): Promise<void> {
  setDecoySession(false);
  mockWipeAllFails = false;
  if (W().hasWallet) await W().wipeForgottenCode(); // reste du test précédent
  W().setImportedDraft(art.phrase);
  await W().confirmDraft(PIN, { enableBiometric: true, discover: false });
  expect(await hasBiometricPin()).toBe(true);
}

beforeEach(() => {
  mockLockWrites.length = 0;
  mockContactWrites.length = 0;
  mockRecentWrites.length = 0;
  mockVaultReads = 0;
  mockGatedReads = 0;
  mockLateBiometric = null;
  jest.clearAllMocks();
});

describe('Code oublié : effacement d’urgence', () => {
  it('app VERROUILLÉE et BLOQUÉE par les essais : tout part, sans lire ni coffre ni biométrie', async () => {
    await freshWallet();
    W().lock();
    useWallet.setState({ failedAttempts: 9, lastFailedAt: Date.now() }); // blocage en cours
    mockVaultReads = 0;
    mockGatedReads = 0;

    await W().wipeForgottenCode();

    expect(mockVaults.size).toBe(0);
    expect(mockWallets).toEqual([]);
    expect(await hasBiometricPin()).toBe(false);
    expect(mockKv.has('nova.bioPinG')).toBe(false);
    // Rien n'a été LU : l'issue de secours ne révèle aucun secret.
    expect(mockVaultReads).toBe(0);
    expect(mockGatedReads).toBe(0);
    // Connexions, sauvegarde auto, liste blanche, contacts, récents, réglages liés au portefeuille.
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockAutoSyncWipe).toHaveBeenCalled();
    expect(mockWhitelistWipe).toHaveBeenCalled();
    expect(mockContactWrites).toEqual([[]]);
    expect(mockRecentWrites).toEqual([[]]);
    expect(mockContactsLoad).toHaveBeenCalled();
    expect(mockSettings.setBiometricEnabled).toHaveBeenCalledWith(false);
    expect(mockSettings.setProfileName).toHaveBeenCalledWith('');
    expect(mockSettings.setBackupVerified).toHaveBeenCalledWith(false);
    // Compteur remis à zéro, état vierge.
    expect(mockLockWrites).toEqual([[0, 0]]);
    expect(W()).toMatchObject({ hasWallet: false, isUnlocked: false, wallets: [], failedAttempts: 0, lastFailedAt: 0, account: null });
  });

  it('le code de contrainte (leurre) part aussi', async () => {
    await freshWallet();
    await W().setupDuress(PIN, DURESS);
    const raw = mockKv.get('kalyx.duress')?.v;
    expect(raw).toBeTruthy();
    mockDuressId = (JSON.parse(raw!) as { id: string }).id;
    expect(mockVaults.has(mockDuressId)).toBe(true);
    W().lock();

    await W().wipeForgottenCode();

    expect(mockKv.has('kalyx.duress')).toBe(false);
    expect(mockVaults.has(mockDuressId)).toBe(false);
    expect(mockVaults.size).toBe(0);
    mockDuressId = '';
  });

  it('en session LEURRE : le pare-feu est levé d’abord — même effet, rien d’ignoré en silence', async () => {
    await freshWallet();
    setDecoySession(true, ['w-decoy']);
    expect(decoyMayWrite('nova.bioPinG')).toBe(false); // ce qu'il aurait ignoré

    await W().wipeForgottenCode();

    expect(isDecoySession()).toBe(false);
    expect(mockVaults.size).toBe(0);
    expect(mockKv.has('nova.bioPinG')).toBe(false);
    expect(W().hasWallet).toBe(false);
  });

  it('trousseau qui refuse : l’erreur remonte, le compteur d’essais n’est PAS remis à zéro', async () => {
    await freshWallet();
    W().lock();
    useWallet.setState({ failedAttempts: 7, lastFailedAt: 123 });
    mockWipeAllFails = true;

    await expect(W().wipeForgottenCode()).rejects.toThrow('keychain refused');

    expect(mockLockWrites).toEqual([]);
    expect(W().failedAttempts).toBe(7);
    expect(W().hasWallet).toBe(true);
    mockWipeAllFails = false;
  });
});

describe('Demande biométrique abandonnée par la fenêtre (délai de garde)', () => {
  it('geste réussi APRÈS abandon : aucun secret rendu, refus silencieux « cancelled »', async () => {
    await freshWallet();
    let abandoned = false;
    const unlock = { biometric: true as const, onUnlocked: () => mockLateBiometric?.(), isCancelled: () => abandoned };
    mockLateBiometric = () => { abandoned = true; }; // le délai expire pendant que l'invite est ouverte
    expect(await codeOf(W().revealPhrase(unlock))).toBe('BIOMETRIC_REFUSED|cancelled');
  });

  it('non abandonnée : la phrase est rendue normalement', async () => {
    expect(await W().revealPhrase({ biometric: true, isCancelled: () => false })).toBe(art.phrase);
  });
});
