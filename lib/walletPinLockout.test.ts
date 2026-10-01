/**
 * (Environnement repris de walletStoreTon.test.ts.) Le magasin face aux phrases TON — de l'import à la signature.
 *
 * C'est la couture la plus sensible : la phrase, les comptes, le déverrouillage
 * et le signataire. Une erreur ici signerait pour un autre compte que celui
 * affiché, ou inventerait des adresses EVM depuis une phrase TON.
 *
 * Stockage simulé en mémoire ; tout le reste est RÉEL : chiffrement scrypt du
 * coffre, dérivations, adresses. Les valeurs attendues viennent des vecteurs de
 * `src/domain/chains/ton/tonkeeper-vectors.json` (bibliothèques officielles, et
 * l'adresse W5 de « abandon × 23 art » confirmée dans le vrai Tonkeeper).
 *
 * Un seul scénario, dans l'ordre : c'est ainsi que l'utilisateur le vit.
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
    wipeWallet: async () => {},
    wipeAll: async () => {},
  };
});
// Le scénario TON ne signe aucune transaction Solana ; le vrai paquet tire un
// module ESM pur (uuid, via rpc-websockets) que Jest ne charge pas.
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
jest.mock('./kv', () => ({ kvGet: async () => null, kvSet: async () => {}, kvDel: async () => {} }));
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
// eslint-disable-next-line import/first
import { classifyRecoveryPhrase } from '../src';

const PIN = '482917';
const tonPhrase = VECTORS.keys[0]; // phrase Tonkeeper officielle (@ton/crypto)
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!; // BIP-39, confirmée dans Tonkeeper
const adapter = (family: string) => ({ config: family === 'ton' ? mockTonCfg : { id: 'ethereum', family } }) as unknown as ChainAdapterV2;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => `${e.code ?? ''}|${e.message ?? ''}`);


describe('Code PIN : le compteur protège AUSSI les confirmations (phrase, clé, envoi)', () => {
  it('six erreurs sur « Révéler la phrase » bloquent — même avec le bon code ensuite', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN);
    for (let i = 0; i < 6; i++) expect(await codeOf(W().revealPhrase({ pin: '000111' }))).toMatch(/^WRONG_PIN\|/);
    expect(W().failedAttempts).toBe(6);
    // Le blocage s'applique à la révélation, au déverrouillage et au changement de code.
    expect(await codeOf(W().revealPhrase({ pin: PIN }))).toMatch(/^LOCKED_OUT\|/);
    expect(await codeOf(W().unlockWithPin(PIN))).toMatch(/^LOCKED_OUT\|/);
    expect(await codeOf(W().changePin(PIN, '592048'))).toMatch(/^LOCKED_OUT\|/);
  });

  it('une réussite après l’attente remet le compteur à zéro ; un échec au déverrouillage ne compte qu’UNE fois', async () => {
    useWallet.setState({ lastFailedAt: Date.now() - 31_000 });
    expect(await W().revealPhrase({ pin: PIN })).toBe(art.phrase);
    expect(W().failedAttempts).toBe(0);
    expect(await codeOf(W().unlockWithPin('000111'))).toMatch(/^WRONG_PIN\|/);
    expect(W().failedAttempts).toBe(1);
  });

  it('la tentative est écrite comme ratée AVANT la vérification (app tuée pendant scrypt = essai compté)', async () => {
    const before = W().failedAttempts;
    mockLockWrites.length = 0;
    useWallet.setState({ lastFailedAt: Date.now() - 31_000 });
    await W().revealPhrase({ pin: PIN });
    expect(mockLockWrites[0][0]).toBe(before + 1); // écrit d'abord comme échec…
    expect(mockLockWrites[mockLockWrites.length - 1]).toEqual([0, 0]); // …puis effacé, code bon
    await codeOf(W().unlockWithPin('000111')); // remet l'état attendu par la suite
  });

  it('changer de PIN avec un ancien code faux compte comme une erreur', async () => {
    expect(await codeOf(W().changePin('000111', '592048'))).toMatch(/^WRONG_PIN\|/);
    expect(W().failedAttempts).toBe(2);
  });
});

describe('EIP-712 : jamais signé pour un autre réseau que celui de la demande', () => {
  it('domain.chainId ≠ réseau demandé : refus ; identique ou absent : signé', async () => {
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    const typed = (chainId?: unknown) => ({
      domain: { name: 'USDC', version: '2', ...(chainId !== undefined ? { chainId } : {}), verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'value', type: 'uint256' }] },
      message: { owner: '0x0000000000000000000000000000000000000001', value: '1' },
    });
    expect(await codeOf(W().signTypedData({ pin: PIN }, typed(1), 11155111))).toMatch(/^NOT_SUPPORTED\|/);
    expect(await codeOf(W().signTypedData({ pin: PIN }, typed('0x1'), 11155111))).toMatch(/^NOT_SUPPORTED\|/);
    expect(await W().signTypedData({ pin: PIN }, typed('0x1'), 1)).toMatch(/^0x[0-9a-f]{130}$/);
    expect(await W().signTypedData({ pin: PIN }, typed(), 1)).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe('Restauration : les comptes de la sauvegarde sont recréés', () => {
  it('compte n°1 renommé, comptes 2 et 4 dérivés de la phrase', async () => {
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    const id = W().activeWalletId;
    const before = W().accounts.map((a) => a.index);
    await W().restoreAccounts(id, [{ index: 0, label: 'Principal' }, { index: 1, label: 'Épargne' }, { index: 3, label: '' }], PIN);
    const after = W().accounts;
    expect(after.map((a) => a.index)).toEqual([...new Set([...before, 0, 1, 3])].sort((a, b) => a - b));
    expect(after.find((a) => a.index === 1)?.label).toBe('Épargne');
    expect(after.find((a) => a.index === 3)?.evmAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await codeOf(W().restoreAccounts(id, [{ index: 5, label: '' }], '000111'))).toMatch(/^WRONG_PIN\|/);
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
  });
});

describe('Actions irréversibles : jamais sans le code', () => {
  it('supprimer un portefeuille ou tout réinitialiser exige le bon code, et jamais app verrouillée', async () => {
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await W().unlockWithPin(PIN);
    const before = W().wallets.length;
    expect(await codeOf(W().removeWallet(W().activeWalletId, { pin: '000111' }))).toMatch(/^WRONG_PIN\|/);
    expect(await codeOf(W().reset({ pin: '000111' }))).toMatch(/^WRONG_PIN\|/);
    expect(W().wallets.length).toBe(before);
    expect(W().hasWallet).toBe(true);
    // Une boîte « Supprimer ? » restée ouverte au verrouillage ne suffit plus.
    W().lock();
    expect(await codeOf(W().reset({ pin: PIN }))).toMatch(/^LOCKED_OUT\|/);
    expect(W().hasWallet).toBe(true);
  });
});
