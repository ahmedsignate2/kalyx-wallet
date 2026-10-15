/**
 * Biométrie à entrée UNIQUE : le PIN de l'app, gardé par l'OS (lib/biometricPin.ts).
 *
 * Environnement repris de walletDuress.test.ts (stockage en mémoire, chiffrement
 * et dérivations RÉELS). Le trousseau simulé retient si une entrée exige le
 * geste (`requireAuthentication`) et COMPTE les invites : c'était le défaut —
 * une sauvegarde de trois portefeuilles demandait jusqu'à quatre gestes.
 */
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';
import { decoyMayRead, decoyMayWrite, setDecoySession } from './sessionMode';

// ---- Copies biométriques PAR portefeuille (ancien schéma), invites comptées. ----
const mockLegacy = new Map<string, string>();
let mockLegacyReads = 0;
let mockOS = 'android';
jest.mock('react-native', () => ({ Platform: { get OS() { return mockOS; } } }));
jest.mock('./secureStore', () => {
  const vaults = new Map<string, unknown>();
  const accounts = new Map<string, unknown>();
  let wallets: unknown[] = [];
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    BACKUP_KEY_VAULT_ID: '@backup-bdk',
    saveVault: async (id: string, v: unknown) => { vaults.set(id, v); },
    loadVault: async (id: string) => vaults.get(id) ?? null,
    hasVault: async (id: string) => vaults.has(id),
    saveAccounts: async (id: string, a: unknown) => { accounts.set(id, clone(a)); },
    loadAccounts: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    loadAccountsStrict: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    enableBiometricSeed: async (id: string, m: string) => { mockLegacy.set(id, m); },
    disableBiometricSeed: async (id: string) => { mockLegacy.delete(id); },
    isBiometricSeedGated: async (id: string) => mockLegacy.has(id),
    hasBiometricSeed: async (id: string) => mockLegacy.has(id),
    readBiometricSeed: async (id: string) => { mockLegacyReads++; return mockLegacy.get(id) ?? null; },
    readLegacyBiometricSeed: async () => null,
    purgeLegacyBiometricSeed: async () => {},
    saveWalletsList: async (l: unknown[]) => { wallets = clone(l); },
    loadWalletsList: async () => clone(wallets),
    saveLockState: async (n: number, t: number) => { mockLockWrites.push([n, t]); },
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    commitPinChange: async (_b: unknown, after: { id: string; vault: unknown }[]) => { for (const a of after) vaults.set(a.id, a.vault); },
    rollbackPinChange: async () => false,
    wipeWallet: async (id: string) => { vaults.delete(id); accounts.delete(id); },
    wipeAll: async () => { vaults.clear(); accounts.clear(); wallets = []; },
    wipeBackupKeyVault: async () => {},
    loadContactsRaw: async () => null,
    saveContacts: async () => {},
    saveSettings: async () => {},
    loadSettings: async () => null,
  };
});
const mockLockWrites: number[][] = [];
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));

// ---- Trousseau : une entrée « gated » ne se lit qu'au prix d'une invite. ----
const mockKv = new Map<string, { v: string; gated: boolean }>();
let mockPrompts = 0;
let mockGated: 'ok' | 'cancel' | 'invalidated' = 'ok';
jest.mock('./kv', () => ({
  KV_DEVICE_ONLY: {},
  kvGet: async (k: string, o?: { requireAuthentication?: boolean }) => {
    const e = mockKv.get(k);
    if (o?.requireAuthentication) {
      mockPrompts++;
      if (mockGated === 'cancel') throw new Error('User canceled the authentication');
      if (mockGated === 'invalidated') return null;
    }
    return e ? e.v : null;
  },
  kvSet: async (k: string, v: string, o?: { requireAuthentication?: boolean }) => { mockKv.set(k, { v, gated: !!o?.requireAuthentication }); },
  kvDel: async (k: string) => { mockKv.delete(k); },
}));
let mockAppPrompts = 0;
jest.mock('./biometrics', () => ({ authenticate: async () => { mockAppPrompts++; return true; }, biometricPrompt: () => 'Kalyx' }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: jest.fn(async () => {}), clearDiscoveries: () => {} }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./sessionReset', () => ({ disconnectEverything: async () => {} }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ setBiometricEnabled: () => {} }) } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {}, logSys: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));

import { useWallet } from './walletStore';
import { hasBiometricPin, readBiometricPinRaw, writeBiometricPin } from './biometricPin';

const PIN = '482917';
const NEW_PIN = '592048';
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; meta?: { reason?: string } }) => `${e.code ?? ''}|${e.meta?.reason ?? ''}`);
const bioPinStored = () => mockKv.get('nova.bioPinG');
const settle = () => new Promise((r) => setTimeout(r, 20));

let phrases: Record<string, string> = {};

beforeEach(() => {
  mockPrompts = 0;
  mockLegacyReads = 0;
  mockGated = 'ok';
});

describe('PIN biométrique : une seule entrée, un seul geste', () => {
  it('activation à la création : le PIN est écrit sous protection biométrique, avec son témoin', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN, { enableBiometric: true, discover: false });
    expect(bioPinStored()).toEqual({ v: PIN, gated: true });
    expect(mockKv.get('nova.bioPinFlag')?.v).toBe('1');
    expect(mockLegacy.size).toBe(0); // plus aucune copie par portefeuille
    phrases = { [W().activeWalletId]: art.phrase };
    const w2 = await W().createWallet(PIN);
    phrases[W().activeWalletId] = w2;
    const w3 = await W().createWallet(PIN);
    phrases[W().activeWalletId] = w3;
    expect(W().wallets).toHaveLength(3);
  });

  it('export de 3 portefeuilles en biométrie : UNE seule lecture du PIN biométrique', async () => {
    const all = await W().exportAllWallets({ biometric: true });
    expect(all.map((w) => w.secret).sort()).toEqual(Object.values(phrases).sort());
    expect(mockPrompts).toBe(1);
  });

  it('ouverture biométrique avec un portefeuille actif autre que celui de l’activation : succès, un geste', async () => {
    const second = W().wallets[1].id;
    await W().setActiveWallet(second);
    W().lock();
    await W().unlockWithBiometrics();
    expect(W().isUnlocked).toBe(true);
    expect(W().activeWalletId).toBe(second);
    expect(mockPrompts).toBe(1);
  });

  it('signature biométrique sur un 2e portefeuille : la bonne phrase, un geste', async () => {
    const second = W().wallets[1].id;
    expect(await W().revealPhrase({ biometric: true })).toBe(phrases[second]);
    expect(await codeOf(W().verifyUnlock({ biometric: true }))).toBe('OK');
    expect(mockPrompts).toBe(2);
  });

  it('annulation du geste → BIOMETRIC_REFUSED, l’entrée reste', async () => {
    mockGated = 'cancel';
    expect(await codeOf(W().revealPhrase({ biometric: true }))).toBe('BIOMETRIC_REFUSED|');
    expect(await hasBiometricPin()).toBe(true);
  });

  it('clé invalidée (empreinte ajoutée) → BIOMETRIC_NOT_SET, témoin effacé', async () => {
    mockGated = 'invalidated';
    expect(await codeOf(W().revealPhrase({ biometric: true }))).toBe('BIOMETRIC_NOT_SET|invalidated');
    expect(await hasBiometricPin()).toBe(false);
    await W().healBiometric(PIN); // prochain déverrouillage par code
    expect(await hasBiometricPin()).toBe(true);
  });

  it('PIN biométrique dépassé : BIOMETRIC_NOT_SET, entrée effacée, compteur d’échecs INTACT', async () => {
    mockKv.set('nova.bioPinG', { v: '000000', gated: true });
    mockLockWrites.length = 0;
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    expect(await codeOf(W().revealPhrase({ biometric: true }))).toBe('BIOMETRIC_NOT_SET|stale');
    expect(await codeOf(W().exportAllWallets({ biometric: true }))).toBe('BIOMETRIC_NOT_SET|pinRequired'); // plus d'entrée : le code, sans invite
    expect(W().failedAttempts).toBe(0);
    expect(mockLockWrites.filter(([n]) => n > 0)).toEqual([]);
    expect(await hasBiometricPin()).toBe(false);
    expect(bioPinStored()).toBeUndefined();
  });
});

describe('Migration depuis les copies par portefeuille', () => {
  it('ancien schéma + plusieurs coffres : erreur immédiate, AUCUNE invite', async () => {
    const first = W().wallets[0].id;
    mockLegacy.set(first, art.phrase);
    expect(await codeOf(W().exportAllWallets({ biometric: true }))).toBe('BIOMETRIC_NOT_SET|pinRequired');
    expect(mockPrompts).toBe(0);
    expect(mockLegacyReads).toBe(0);
  });

  it('ni PIN biométrique ni copie (code changé) : erreur AVANT toute invite', async () => {
    const saved = new Map(mockLegacy);
    mockLegacy.clear();
    mockAppPrompts = 0;
    const reads = mockLegacyReads;
    expect(await codeOf(W().revealPhrase({ biometric: true }))).toBe('BIOMETRIC_NOT_SET|');
    expect(mockAppPrompts).toBe(0);
    expect(mockPrompts).toBe(0);
    expect(mockLegacyReads).toBe(reads);
    for (const [k, v] of saved) mockLegacy.set(k, v);
  });

  it('ancien schéma, actif SANS copie : l’ouverture passe par le portefeuille qui en a une', async () => {
    const first = W().wallets[0].id;
    expect(W().activeWalletId).not.toBe(first);
    W().lock();
    await W().unlockWithBiometrics();
    expect(W().isUnlocked).toBe(true);
    expect(mockLegacyReads).toBe(1);
  });

  it('healBiometric : PIN biométrique écrit, anciennes copies effacées', async () => {
    mockLegacy.set(W().wallets[1].id, phrases[W().wallets[1].id]);
    await W().healBiometric(PIN);
    expect(bioPinStored()).toEqual({ v: PIN, gated: true });
    expect(mockLegacy.size).toBe(0);
    // Code faux : rien n'est écrit sous biométrie.
    await W().disableBiometric();
    expect(await codeOf(W().healBiometric('111111'))).toBe('WRONG_PIN|');
    expect(bioPinStored()).toBeUndefined();
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await W().enableBiometric(PIN);
    expect(bioPinStored()).toEqual({ v: PIN, gated: true });
  });
});

describe('Changement de code, désactivation, contrainte, réinitialisation', () => {
  it('changePin (Android) : PIN biométrique effacé, réécrit au prochain déverrouillage par code', async () => {
    mockOS = 'android';
    await W().changePin(PIN, NEW_PIN);
    expect(await hasBiometricPin()).toBe(false);
    expect(bioPinStored()).toBeUndefined();
    expect(mockPrompts).toBe(0);
    W().lock();
    await W().unlockWithPin(NEW_PIN);
    await W().healBiometric(NEW_PIN);
    expect(bioPinStored()).toEqual({ v: NEW_PIN, gated: true });
    await settle();
  });

  it('changePin (iOS, écriture sans geste) : réécrit tout de suite avec le nouveau code', async () => {
    mockOS = 'ios';
    await W().changePin(NEW_PIN, PIN);
    expect(bioPinStored()).toEqual({ v: PIN, gated: true });
    expect(await W().revealPhrase({ biometric: true })).toBe(phrases[W().activeWalletId]);
    mockOS = 'android';
  });

  it('disableBiometric efface le PIN biométrique, son témoin et les anciennes copies', async () => {
    mockLegacy.set(W().wallets[0].id, art.phrase);
    await W().disableBiometric();
    expect(bioPinStored()).toBeUndefined();
    expect(mockKv.has('nova.bioPinFlag')).toBe(false);
    expect(mockLegacy.size).toBe(0);
  });

  it('setupDuress coupe la biométrie (PIN biométrique compris) ; l’activation est ensuite refusée', async () => {
    await W().enableBiometric(PIN);
    await W().setupDuress(PIN, '571046');
    expect(bioPinStored()).toBeUndefined();
    expect(await codeOf(W().enableBiometric(PIN))).toBe('NOT_SUPPORTED|duressBiometric');
    await W().healBiometric(PIN); // n'écrit rien non plus
    expect(bioPinStored()).toBeUndefined();
  });

  it('session leurre : aucune lecture ni écriture du PIN biométrique', async () => {
    await writeBiometricPin(PIN); // posé avant la session
    setDecoySession(true, ['wdecoy1']);
    try {
      expect(decoyMayRead('nova.bioPinG')).toBe(false);
      expect(decoyMayRead('nova.bioPinFlag')).toBe(false);
      expect(decoyMayWrite('nova.bioPinG')).toBe(false);
      expect(await hasBiometricPin()).toBe(false);
      expect(await readBiometricPinRaw()).toBeNull();
      await writeBiometricPin('999999');
      expect(mockPrompts).toBe(0);
    } finally {
      setDecoySession(false);
    }
    expect(bioPinStored()).toEqual({ v: PIN, gated: true }); // intact
  });

  it('reset efface le PIN biométrique', async () => {
    useWallet.setState({ isUnlocked: true });
    await W().reset({ pin: PIN });
    expect(bioPinStored()).toBeUndefined();
    expect(mockKv.has('nova.bioPinFlag')).toBe(false);
  });
});
