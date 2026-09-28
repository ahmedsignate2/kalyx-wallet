jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: jest.fn() }, Linking: { openURL: jest.fn() } }));
jest.mock('./walletStore', () => ({ useWallet: { getState: () => ({}) } }));
jest.mock('./notifications', () => ({ notify: jest.fn() }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ language: 'fr' }) } }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: jest.fn(), logDapp: jest.fn() } }));
jest.mock('./errorHandler', () => ({ handleSmartError: jest.fn() }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {} }));

import { useWalletConnect } from './walletconnect';

describe('WalletConnect : « Déconnecter » aboutit toujours', () => {
  it('relais en échec : la session et son appairage sont supprimés localement', async () => {
    let sessions: Record<string, unknown> = { t1: { topic: 't1', pairingTopic: 'p1', peer: { metadata: { name: 'Uniswap' } } } };
    const del = jest.fn(async (topic: string) => { delete sessions[topic]; });
    const pairDisconnect = jest.fn(async () => {});
    const wallet = {
      getActiveSessions: () => sessions,
      disconnectSession: jest.fn(async () => { throw new Error('No matching key. session topic does not exist'); }),
      engine: { signClient: { session: { delete: del } } },
      core: { pairing: { disconnect: pairDisconnect } },
    };
    useWalletConnect.setState({ wallet: wallet as never, sessions: [{ topic: 't1', name: 'Uniswap', url: '', icon: undefined }] as never });
    await useWalletConnect.getState().disconnect('t1');
    expect(del).toHaveBeenCalledWith('t1', expect.anything());
    expect(pairDisconnect).toHaveBeenCalledWith({ topic: 'p1' });
    expect(useWalletConnect.getState().sessions).toEqual([]);
    sessions = {};
  });
});
