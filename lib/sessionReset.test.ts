const mockWc = { disconnectAll: jest.fn(async () => {}), disconnectAddresses: jest.fn(async () => {}) };
jest.mock('./walletconnect', () => ({ useWalletConnect: { getState: () => mockWc } }));
const mockClear = jest.fn();
jest.mock('./dappActivity', () => ({ useDappActivity: { getState: () => ({ clear: mockClear }) } }));
const mockTcDisconnect = jest.fn(async () => {});
jest.mock('./tonconnect/store', () => ({
  useTonConnect: { getState: () => ({ sessions: [{ clientId: 'a', walletId: 'w1' }, { clientId: 'b', walletId: 'w2' }], disconnect: mockTcDisconnect }) },
}));

import { disconnectEverything, disconnectWallet } from './sessionReset';

describe('Réinitialisation : toutes les connexions coupées', () => {
  beforeEach(() => jest.clearAllMocks());
  it('WalletConnect, TON Connect (toutes les sessions) et sites du navigateur', async () => {
    await disconnectEverything();
    expect(mockWc.disconnectAll).toHaveBeenCalled();
    expect(mockTcDisconnect.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['a', 'b']);
    expect(mockClear).toHaveBeenCalled();
  });
  it('suppression d’un portefeuille : seulement ses sessions', async () => {
    await disconnectWallet('w1', ['0xAbC']);
    expect(mockWc.disconnectAddresses).toHaveBeenCalledWith(['0xAbC']);
    expect(mockTcDisconnect.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['a']);
    expect(mockClear).not.toHaveBeenCalled();
  });
});
