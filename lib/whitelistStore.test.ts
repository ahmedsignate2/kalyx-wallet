/**
 * Verrou de liste blanche, de bout en bout : trousseau simulé, horloge de CHAÎNE
 * simulée (pilotée par le test), règles et comparaisons d'adresses réelles.
 */
let mockChainTime = 1_000_000;
const mockKv = new Map<string, string>();
jest.mock('./kv', () => ({
  kvGet: async (k: string) => mockKv.get(k) ?? null,
  kvSet: async (k: string, v: string) => { mockKv.set(k, v); },
  kvDel: async (k: string) => { mockKv.delete(k); },
}));
jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  const clock = Object.create(actual.EvmChainAdapter.prototype);
  clock.getLatestBlockTime = async () => mockChainTime;
  return { ...actual, getAdapter: () => clock, listChains: () => [{ id: 'ethereum' }] };
});
const ME = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const mockVerify = jest.fn(async () => {});
jest.mock('./walletStore', () => ({
  useWallet: { getState: () => ({ wallets: [{ id: 'w' }], activeWalletId: 'w', accounts: [{ index: 0, label: '', evmAddress: ME, btcAddress: '' }], verifyUnlock: mockVerify }) },
}));
jest.mock('./secureStore', () => ({ loadAccounts: async () => [] }));

import { assertRecipientAllowed, resetChainClock, whitelistActions } from './whitelistStore';
import { WHITELIST_DELAY_MS } from '../src';

const FRIEND = '0x0000000000000000000000000000000000000abc';
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR');

describe('liste blanche — verrou d’envoi', () => {
  it('éteinte : tout passe', async () => {
    expect(await code(assertRecipientAllowed(FRIEND))).toBe('OK');
  });
  it('allumée : bloqué, puis ajouté = délai de 24 h (heure de chaîne), ses comptes passent', async () => {
    await whitelistActions.enable({ pin: '1' });
    expect(mockVerify).toHaveBeenCalled();
    expect(await code(assertRecipientAllowed(FRIEND))).toBe('NOT_WHITELISTED');
    expect(await code(assertRecipientAllowed(ME.toLowerCase()))).toBe('OK');
    await whitelistActions.add(FRIEND.toUpperCase().replace('0X', '0x'), 'Ami', { pin: '1' });
    expect(await code(assertRecipientAllowed(FRIEND))).toBe('WHITELIST_PENDING');
  });
  it('code faux : rien ne change', async () => {
    mockVerify.mockRejectedValueOnce(Object.assign(new Error('pin'), { code: 'WRONG_PIN' }));
    expect(await code(whitelistActions.requestDisable({ pin: '0' }))).toBe('WRONG_PIN');
    expect(await code(assertRecipientAllowed('0x0000000000000000000000000000000000000def'))).toBe('NOT_WHITELISTED');
  });
});

describe('le temps qui compte est celui de la chaîne', () => {
  it('24 h de chaîne écoulées : l’adresse ajoutée passe ; l’heure du téléphone n’y fait rien', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * WHITELIST_DELAY_MS; // téléphone avancé de 10 jours : sans effet
    resetChainClock();
    expect(await code(assertRecipientAllowed(FRIEND))).toBe('WHITELIST_PENDING');
    Date.now = realNow;
    mockChainTime += WHITELIST_DELAY_MS + 60_000; // marge : l'horloge monotone a avancé de quelques ms depuis l'ajout
    resetChainClock();
    expect(await code(assertRecipientAllowed(FRIEND))).toBe('OK');
  });
});
