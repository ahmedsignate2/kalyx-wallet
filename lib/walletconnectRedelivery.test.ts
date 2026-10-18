/**
 * Fenêtre WalletConnect qui revenait après signature : le relais redélivre la
 * même demande au retour au premier plan. Elle ne doit plus être remontrée.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' }, AppState: { currentState: 'active', addEventListener: jest.fn() }, Linking: { openURL: jest.fn() } }));
jest.mock('./walletStore', () => ({ useWallet: { getState: () => ({ accounts: [], activeAccountIndex: 0 }), subscribe: jest.fn() } }));
jest.mock('./notifications', () => ({ notify: jest.fn() }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ language: 'fr' }) } }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: jest.fn(), logDapp: jest.fn() } }));
jest.mock('./errorHandler', () => ({ handleSmartError: jest.fn() }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./dappReturn', () => ({ returnToDappOrHint: jest.fn() }));
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {} }));

const handlers: Record<string, (x: unknown) => Promise<void> | void> = {};
const respond = jest.fn(async (_: unknown) => {});
const fakeWallet = {
  on: (ev: string, fn: (x: unknown) => void) => { handlers[ev] = fn; },
  getActiveSessions: () => ({ t1: { topic: 't1', peer: { metadata: { name: 'Uniswap', url: 'https://app.uniswap.org' } }, namespaces: {} } }),
  respondSessionRequest: respond,
  emitSessionEvent: jest.fn(async () => {}),
};
jest.mock('@walletconnect/core', () => ({ Core: class {} }), { virtual: true });
jest.mock('@walletconnect/web3wallet', () => ({ Web3Wallet: { init: async () => fakeWallet } }), { virtual: true });
jest.mock('@walletconnect/utils', () => ({ buildApprovedNamespaces: jest.fn(), getSdkError: () => ({ code: 5000, message: 'User rejected.' }) }), { virtual: true });

process.env.EXPO_PUBLIC_WALLETCONNECT_ID = 'test-project';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useWalletConnect } = require('./walletconnect') as typeof import('./walletconnect');

const sign = (id: number, extra: Record<string, unknown> = {}) => ({ id, topic: 't1', params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x68656c6c6f', '0xabc'], ...extra } } });

beforeAll(async () => {
  await useWalletConnect.getState().init();
});
beforeEach(() => {
  respond.mockClear();
  useWalletConnect.setState({ requestQueue: [], request: null });
});

describe('WalletConnect : une demande traitée ne revient pas', () => {
  it('refusée puis redélivrée : pas remontrée, la même réponse est renvoyée', async () => {
    await handlers.session_request(sign(101));
    expect(useWalletConnect.getState().request?.id).toBe(101);
    await useWalletConnect.getState().rejectRequest();
    expect(useWalletConnect.getState().request).toBeNull();
    respond.mockClear();

    await handlers.session_request(sign(101)); // relais : même identifiant
    expect(useWalletConnect.getState().request).toBeNull();
    expect(useWalletConnect.getState().requestQueue).toHaveLength(0);
    expect(respond).toHaveBeenCalledWith({ topic: 't1', response: expect.objectContaining({ id: 101, error: expect.anything() }) });
  });

  it('livrée deux fois avant d’être traitée : une seule fois en file', async () => {
    await handlers.session_request(sign(202));
    await handlers.session_request(sign(202));
    expect(useWalletConnect.getState().requestQueue.map((r: { id: number }) => r.id)).toEqual([202]);
  });

  it('expirée à l’arrivée : refusée sans être montrée', async () => {
    await handlers.session_request(sign(303, { expiryTimestamp: Math.floor(Date.now() / 1000) - 60 }));
    expect(useWalletConnect.getState().request).toBeNull();
    expect(respond).toHaveBeenCalledWith({ topic: 't1', response: expect.objectContaining({ id: 303, error: expect.objectContaining({ message: 'Request expired' }) }) });
  });

  it('une NOUVELLE demande (autre identifiant) est bien montrée', async () => {
    await handlers.session_request(sign(404));
    expect(useWalletConnect.getState().request?.id).toBe(404);
  });
});
