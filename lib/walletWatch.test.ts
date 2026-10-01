/**
 * Portefeuille EN LECTURE SEULE face au coffre (environnement repris de
 * walletPinLockout.test.ts : stockage en mémoire, chiffrement RÉEL).
 *
 * Ce qui ne doit jamais arriver : signer avec le secret d'un AUTRE portefeuille
 * parce que l'actif n'en a pas, ou se retrouver sans aucun coffre pour le code.
 */
import { hex } from '@scure/base';
import type { ChainAdapterV2, ChainConfig } from '../src';
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';

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

// eslint-disable-next-line import/first
import { useWallet } from './walletStore';
// eslint-disable-next-line import/first
import { classifyRecoveryPhrase } from '../src';

const PIN = '482917';
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => `${e.code ?? ''}|${e.message ?? ''}`);
const WATCHED = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('Lecture seule : suivre, déverrouiller, jamais signer', () => {
  let seedId = '';
  it('ajoute une adresse suivie ; refuse une adresse invalide ou déjà présente', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN);
    seedId = W().activeWalletId;
    const own = W().accounts[0].evmAddress;
    expect(await codeOf(W().addWatchWallet('bonjour'))).toBe('INVALID_WATCH_ADDRESS|watch.UNKNOWN');
    expect(await codeOf(W().addWatchWallet(own.toLowerCase()))).toMatch(/^WALLET_ALREADY_EXISTS\|/);
    await W().addWatchWallet(WATCHED.toLowerCase(), 'Trésorerie');
    expect(W().wallets.find((w) => w.id === W().activeWalletId)).toMatchObject({ type: 'watch', keyFamily: 'evm', label: 'Trésorerie' });
    expect(W().account?.address).toBe(WATCHED);
    expect(await codeOf(W().addWatchWallet(WATCHED))).toMatch(/^WALLET_ALREADY_EXISTS\|/);
  });

  it('le code se vérifie sur le coffre d’un portefeuille à clé', async () => {
    W().lock();
    expect(await codeOf(W().unlockWithPin('000111'))).toMatch(/^WRONG_PIN\|/);
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await W().unlockWithPin(PIN);
    expect(W().isUnlocked).toBe(true);
    expect(await codeOf(W().verifyPin(PIN))).toBe('OK');
  });

  it('rien ne se signe ni ne se révèle depuis une adresse suivie (pas le secret d’un autre)', async () => {
    expect(await codeOf(W().signMessage({ pin: PIN }, 'hello'))).toMatch(/^WATCH_ONLY\|/);
    expect(await codeOf(W().revealPhrase({ pin: PIN }))).toMatch(/^WATCH_ONLY\|/);
    expect(await codeOf(W().exportPrivateKey({ pin: PIN }))).toMatch(/^WATCH_ONLY\|/);
    const typed = { domain: { name: 'X', chainId: 1 }, types: { M: [{ name: 'a', type: 'uint256' }] }, message: { a: '1' } };
    expect(await codeOf(W().signTypedData({ pin: PIN }, typed, 1))).toMatch(/^WATCH_ONLY\|/);
    expect(await codeOf(W().verifyUnlock({ pin: PIN }))).toBe('OK'); // l'identité, elle, se prouve
  });

  it('le dernier portefeuille à clé ne peut pas être supprimé ; l’adresse suivie, si', async () => {
    const watchId = W().activeWalletId;
    expect(await codeOf(W().removeWallet(seedId, { pin: PIN }))).toMatch(/^LAST_KEY_WALLET\|/);
    await W().removeWallet(watchId, { pin: PIN });
    expect(W().wallets.map((w) => w.id)).toEqual([seedId]);
    expect(W().activeWalletId).toBe(seedId);
  });
});

describe('Lecture seule remplacée par la clé', () => {
  it('importer la clé d’une adresse suivie retire la lecture seule (pas deux fois les mêmes fonds)', async () => {
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    const addr = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'; // clé privée 1
    await W().addWatchWallet(addr);
    expect(W().wallets.some((w) => w.type === 'watch')).toBe(true);
    await W().importPrivateKey('0x' + '0'.repeat(63) + '1', PIN, '', 'evm');
    expect(W().wallets.some((w) => w.type === 'watch')).toBe(false);
    expect(W().account?.address).toBe(addr);
  });
});

