jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: jest.fn() }, Linking: { openURL: jest.fn() } }));
jest.mock('./walletStore', () => ({ useWallet: { getState: () => ({}) } }));
jest.mock('./notifications', () => ({ notify: jest.fn() }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ language: 'fr' }) } }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: jest.fn(), logDapp: jest.fn() } }));
jest.mock('./errorHandler', () => ({ handleSmartError: jest.fn() }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {} }));
const mockToast = { info: jest.fn(), error: jest.fn(), success: jest.fn() };
jest.mock('./toast', () => ({ toast: mockToast }));

import { useWalletConnect, pairErrorKey, isKalyxExtensionSession } from './walletconnect';

const URI = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;

describe('appairage : erreurs claires, silence signalé, extension reconnue', () => {
  it('erreur du SDK → phrase claire (QR expiré, relais injoignable, sinon lien inutilisable)', () => {
    expect(pairErrorKey(new Error('Pairing URI expired'))).toBe('linkExpiredBody');
    expect(pairErrorKey(new Error('WebSocket connection failed: socket stalled'))).toBe('wcRelayDown');
    expect(pairErrorKey(new Error('Missing or invalid. pair() uri#symKey'))).toBe('linkUnusable');
  });

  it('extension Kalyx : nom et site déclarés de l’extension, pas un site qui imite le nom', () => {
    expect(isKalyxExtensionSession({ topic: 't', name: 'Kalyx — extension', url: 'https://kalyxwallet.com' })).toBe(true);
    expect(isKalyxExtensionSession({ topic: 't', name: 'Kalyx — extension', url: 'https://kalyx-wallet.app' })).toBe(false);
  });

  it('appairé mais rien n’arrive en 30 s : on le dit ; une proposition arrivée, non', async () => {
    jest.useFakeTimers();
    const wallet = { pair: jest.fn(async () => {}), core: { pairing: { getPairings: () => [] } } };
    useWalletConnect.setState({ wallet: wallet as never, sessions: [], proposal: null });
    await useWalletConnect.getState().pair(URI);
    jest.advanceTimersByTime(30_000);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    mockToast.info.mockClear();
    await useWalletConnect.getState().pair(URI.replace('a'.repeat(64), 'c'.repeat(64)));
    useWalletConnect.setState({ proposal: { id: 1 } });
    useWalletConnect.setState({ proposal: null }); // refusée
    jest.advanceTimersByTime(30_000);
    expect(mockToast.info).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
