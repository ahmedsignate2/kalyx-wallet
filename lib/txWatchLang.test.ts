jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const mockNotify = jest.fn();
jest.mock('./notificationCenter', () => ({ notifyAndLog: (...a: unknown[]) => mockNotify(...a) }));
let mockLang = 'en';
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ language: mockLang }) } }));
let mockState: { status: string } = { status: 'confirmed' };
jest.mock('../src', () => ({ findAdapterV2: () => ({ waitForTx: async () => mockState }) }));

import { watchConfirmation } from './txWatch';

describe('Notifications de suivi : langue de l’utilisateur', () => {
  it('anglais, coréen, français — et plus de texte figé', async () => {
    await watchConfirmation('base', '0x1', '1 ETH → Bob');
    expect(mockNotify).toHaveBeenLastCalledWith('tx', 'Transaction confirmed', '1 ETH → Bob');
    mockLang = 'ko';
    mockState = { status: 'failed' };
    await watchConfirmation('base', '0x1', '1 ETH');
    expect(mockNotify.mock.calls.at(-1)?.[1]).toBe('거래 실패');
    expect(mockNotify.mock.calls.at(-1)?.[2]).toMatch(/^1 ETH — /);
    mockLang = 'fr';
    mockState = { status: 'expired' };
    await watchConfirmation('base', '0x1', '1 ETH');
    expect(mockNotify.mock.calls.at(-1)?.[1]).toBe('Transaction abandonnée');
  });
});
