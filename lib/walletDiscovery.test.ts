/**
 * Recherche des comptes d'une phrase (environnement repris de
 * walletPinLockout.test.ts : stockage en mémoire, chiffrement et dérivations RÉELS ;
 * seule la sonde réseau est simulée, par adresse EVM).
 */
import { hex } from '@scure/base';
import type { ChainAdapterV2, ChainConfig } from '../src';
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';
import { mnemonicToSeedSync } from '@scure/bip39';
import { deriveEvmAccount } from '../src';

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
    enableBiometricSeed: async (id: string, m: string) => { bio.set(id, m); },
    disableBiometricSeed: async (id: string) => { bio.delete(id); },
    readBiometricSeed: async (id: string) => bio.get(id) ?? null,
    hasBiometricSeed: async (id: string) => bio.has(id),
    saveWalletsList: async (l: unknown[]) => { wallets = clone(l); },
    loadWalletsList: async () => clone(wallets),
    saveLockState: async (n: number, t: number) => { mockLockWrites.push([n, t]); },
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    wipeWallet: async () => {},
    wipeAll: async () => {},
  };
});
// Le scénario TON ne signe aucune transaction Solana ; le vrai paquet tire un
// module ESM pur (uuid, via rpc-websockets) que Jest ne charge pas.
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
jest.mock('./kv', () => ({ kvGet: async () => null, kvSet: async () => {}, kvDel: async () => {} }));
jest.mock('./biometrics', () => ({ authenticate: async () => true }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ setBiometricEnabled: () => {} }) } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));

const mockActivity = new Map<string, 'used' | 'empty' | 'unknown'>();
jest.mock('./accountActivity', () => ({ probeAccountActivity: async (a: { evmAddress: string }) => mockActivity.get(a.evmAddress) ?? 'empty' }));
// eslint-disable-next-line import/first
import { useWallet } from './walletStore';
// eslint-disable-next-line import/first
import { classifyRecoveryPhrase } from '../src';

const PIN = '482917';
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => `${e.code ?? ''}|${e.message ?? ''}`);
const evmAt = (i: number) => deriveEvmAccount(mnemonicToSeedSync(art.phrase), i).address;

describe('Recherche des comptes', () => {
  it('ajoute les comptes utilisés, jamais un inconnu ; s’arrête après 3 vides', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN);
    mockActivity.set(evmAt(2), 'used');
    mockActivity.set(evmAt(3), 'unknown');
    mockActivity.set(evmAt(5), 'used');
    mockActivity.set(evmAt(10), 'used'); // au-delà de 3 vides après 5 : jamais atteint
    let unlocked = false;
    const r = await W().discoverAccounts(W().activeWalletId, { pin: PIN }, { onUnlocked: () => { unlocked = true; } });
    expect(unlocked).toBe(true);
    expect(r).toEqual({ added: [2, 5], uncertain: [3] });
    expect(W().accounts.map((a) => a.index)).toEqual([0, 2, 5]);
    expect(W().accounts.find((a) => a.index === 5)?.evmAddress).toBe(evmAt(5));
  });

  it('relancée : les comptes déjà là prolongent la recherche sans doublon ; code faux rejeté avant tout réseau', async () => {
    mockActivity.set(evmAt(7), 'used');
    const r = await W().discoverAccounts(W().activeWalletId, { pin: PIN });
    expect(r.added).toEqual([7, 10]); // 10 est à moins de 3 vides de 7
    expect(W().accounts.map((a) => a.index)).toEqual([0, 2, 5, 7, 10]);
    expect(await codeOf(W().discoverAccounts(W().activeWalletId, { pin: '000111' }))).toMatch(/^WRONG_PIN\|/);
  });
});
