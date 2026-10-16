const mockKv = new Map<string, string>();
jest.mock('./kv', () => ({
  KV_DEVICE_ONLY: {},
  kvGet: async (k: string) => mockKv.get(k) ?? null,
  kvSet: async (k: string, v: string) => { mockKv.set(k, v); },
  kvDel: async (k: string) => { mockKv.delete(k); },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => 'réel', setItem: async () => {} } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumeDecoyBoot, decoyAsyncMayWrite } from './decoyCurtain';
import { isDecoySession, setDecoySession } from './sessionMode';

describe('démarrage en session leurre', () => {
  afterEach(() => setDecoySession(false));
  it('marqueur récent : pare-feu actif AVANT tout chargement, marqueur consommé', async () => {
    mockKv.set('kalyx.decoyBoot', JSON.stringify({ id: 'w-x', at: Date.now() }));
    expect(await consumeDecoyBoot()).toBe('w-x');
    expect(isDecoySession()).toBe(true);
    expect(mockKv.has('kalyx.decoyBoot')).toBe(false);
    expect(await AsyncStorage.getItem('nova.recentRecipients')).toBeNull(); // lectures vides
    expect(await AsyncStorage.getItem('nova.historyCache.v2')).toBeNull(); // historique des VRAIS comptes
  });
  it('le leurre se comporte comme un vrai portefeuille : langue, cours publics et SES propres soldes', async () => {
    mockKv.set('kalyx.decoyBoot', JSON.stringify({ id: 'w-x', at: Date.now() }));
    await consumeDecoyBoot();
    setDecoySession(true, ['w-x', '0xdecoy000000000000000000000000000000000001']);
    expect(await AsyncStorage.getItem('user_language')).toBe('réel');
    expect(await AsyncStorage.getItem('kalyx.priceCache.v1')).toBe('réel');
    expect(await AsyncStorage.getItem('portfolio.0xdecoy000000000000000000000000000000000001.eur.mainnet')).toBe('réel');
    expect(await AsyncStorage.getItem('portfolio.0xreal0000000000000000000000000000000000002.eur.mainnet')).toBeNull();
    expect(decoyAsyncMayWrite('kalyx.priceCache.v1')).toBe(true);
    expect(decoyAsyncMayWrite('user_language')).toBe(false);
    expect(decoyAsyncMayWrite('nova.contacts')).toBe(false);
  });
  it('marqueur périmé ou absent : démarrage ordinaire', async () => {
    mockKv.set('kalyx.decoyBoot', JSON.stringify({ id: 'w-x', at: Date.now() - 5 * 60_000 }));
    expect(await consumeDecoyBoot()).toBeNull();
    expect(isDecoySession()).toBe(false);
    expect(await consumeDecoyBoot()).toBeNull();
  });
});
