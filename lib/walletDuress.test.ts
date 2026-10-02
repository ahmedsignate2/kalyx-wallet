/**
 * Code de contrainte (environnement repris de walletWatch.test.ts : stockage en
 * mémoire, chiffrement et dérivations RÉELS).
 */
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';
import { isDecoySession } from './sessionMode';

// ---- TON piloté par le test : les configurations TON réelles sont retirées, et un
// réseau TON PRINCIPAL fictif s'active à la demande — pour tester aussi bien le
// refus « TON pas configuré » que l'adresse principale confirmée dans Tonkeeper.
let mockTonOn = false;
const mockTonCfg = { id: 'ton-test-cfg', name: 'TON', family: 'ton', nativeSymbol: 'TON', nativeDecimals: 9, rpcUrls: [] };
jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  return {
    ...actual,
    listChains: (o?: { includeTestnets?: boolean }) => [
      ...actual.listChains(o).filter((c: { family: string }) => c.family !== 'ton'),
      ...(mockTonOn ? [mockTonCfg] : []),
    ],
  };
});

const mockTrack = jest.fn(async () => {});
// ---- Stockage en mémoire à la place du trousseau de l'appareil. ----
const mockLockWrites: number[][] = [];
jest.mock('./secureStore', () => {
  const vaults = new Map<string, unknown>();
  const accounts = new Map<string, unknown>();
  const bio = new Map<string, string>();
  let wallets: unknown[] = [];
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    saveVault: async (id: string, v: unknown) => { vaults.set(id, v); },
    loadVault: async (id: string) => vaults.get(id) ?? null,
    hasVault: async (id: string) => vaults.has(id),
    saveAccounts: async (id: string, a: unknown) => { accounts.set(id, clone(a)); },
    loadAccounts: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    loadAccountsStrict: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    enableBiometricSeed: async (id: string, m: string) => { bio.set(id, m); },
    disableBiometricSeed: async (id: string) => { bio.delete(id); },
    readBiometricSeed: async (id: string) => bio.get(id) ?? null,
    hasBiometricSeed: async (id: string) => bio.has(id),
    saveWalletsList: async (l: unknown[]) => { wallets = clone(l); },
    loadWalletsList: async () => clone(wallets),
    saveLockState: async (n: number, t: number) => { mockLockWrites.push([n, t]); },
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    wipeWallet: async (id: string) => { vaults.delete(id); accounts.delete(id); },
    wipeAll: async () => {},
    rollbackPinChange: async () => {},
    savePinChangeJournal: async () => {},
    clearPinChangeJournal: async () => {},
    isBiometricSeedGated: async () => false,
  };
});
// Le scénario TON ne signe aucune transaction Solana ; le vrai paquet tire un
// module ESM pur (uuid, via rpc-websockets) que Jest ne charge pas.
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
const mockKv = new Map<string, string>();
jest.mock('./kv', () => ({
  KV_DEVICE_ONLY: {},
  kvGet: async (k: string) => mockKv.get(k) ?? null,
  kvSet: async (k: string, v: string) => { mockKv.set(k, v); },
  kvDel: async (k: string) => { mockKv.delete(k); },
}));
jest.mock('./biometrics', () => ({ authenticate: async () => true }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: mockTrack }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ setBiometricEnabled: () => {} }) } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));

// eslint-disable-next-line import/first
import { useWallet } from './walletStore';

const PIN = '482917';
const DURESS = '135790';
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => `${e.code ?? ''}|${e.message ?? ''}`);

describe('Code de contrainte', () => {
  let realId = '';
  let realAddr = '';
  it('configuration : code différent et de même longueur exigés', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN);
    realId = W().activeWalletId;
    realAddr = W().accounts[0].evmAddress;
    expect(await codeOf(W().setupDuress(PIN, PIN))).toBe('INVALID_PIN|duress.SAME_AS_MAIN');
    expect(await codeOf(W().setupDuress(PIN, '1357'))).toMatch(/^INVALID_PIN\|/);
    expect(await codeOf(W().setupDuress('000000', DURESS))).toMatch(/^WRONG_PIN\|/);
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await W().setupDuress(PIN, DURESS);
    expect(await W().hasDuress()).toBe(true);
    expect((await W().duressAccounts())[0].evmAddress).not.toBe(realAddr);
  });

  it('code de contrainte : session leurre, vrais portefeuilles invisibles, aucune tentative comptée', async () => {
    W().lock();
    await W().unlockWithPin(DURESS);
    expect(isDecoySession()).toBe(true);
    expect(W().isUnlocked).toBe(true);
    expect(W().wallets.map((w) => w.id)).not.toContain(realId);
    expect(W().account?.address).not.toBe(realAddr);
    expect(W().failedAttempts).toBe(0);
    expect(await W().hasDuress()).toBe(false); // l'écran le dit « non configuré »
    // Le leurre signe avec le code de contrainte, comme un vrai portefeuille.
    expect(await codeOf(W().verifyPin(DURESS))).toBe('OK');
  });

  it('en session leurre : aucune écriture sur les vrais portefeuilles', async () => {
    expect(await codeOf(W().createWallet(DURESS))).toMatch(/^NOT_SUPPORTED\|/);
    expect(await codeOf(W().removeWallet(realId, { pin: DURESS }))).toMatch(/^NOT_SUPPORTED\|/);
    await W().renameWallet(W().activeWalletId, 'Perso');
    W().lock();
    await new Promise((r) => setTimeout(r, 0));
    expect(isDecoySession()).toBe(false);
    // Vrai déverrouillage : la vraie liste est intacte.
    await W().unlockWithPin(PIN);
    expect(W().wallets.map((w) => w.id)).toEqual([realId]);
    expect(W().account?.address).toBe(realAddr);
  });

  it('le vrai code ne peut pas devenir le code de contrainte ; code faux compté', async () => {
    expect(await codeOf(W().changePin(PIN, DURESS))).toBe('INVALID_PIN|duress.SAME_AS_MAIN');
    W().lock();
    expect(await codeOf(W().unlockWithPin('999999'))).toMatch(/^WRONG_PIN\|/);
    expect(W().failedAttempts).toBe(1);
  });

  it('réinitialiser DANS la session leurre n’efface que le leurre', async () => {
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await W().unlockWithPin(DURESS);
    await W().reset({ pin: DURESS });
    await new Promise((r) => setTimeout(r, 0));
    expect(isDecoySession()).toBe(false);
    await W().unlockWithPin(PIN);
    expect(W().wallets.map((w) => w.id)).toEqual([realId]);
    expect(await W().hasDuress()).toBe(false);
  });
});
