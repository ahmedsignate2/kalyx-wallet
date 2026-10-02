const mockKv = new Map<string, string>();
jest.mock('./kv', () => ({
  KV_DEVICE_ONLY: {},
  kvGet: async (k: string) => mockKv.get(k) ?? null,
  kvSet: async (k: string, v: string) => { mockKv.set(k, v); },
  kvDel: async (k: string) => { mockKv.delete(k); },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => 'réel', setItem: async () => {} } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumeDecoyBoot } from './decoyCurtain';
import { isDecoySession, setDecoySession } from './sessionMode';

describe('démarrage en session leurre', () => {
  afterEach(() => setDecoySession(false));
  it('marqueur récent : pare-feu actif AVANT tout chargement, marqueur consommé', async () => {
    mockKv.set('kalyx.decoyBoot', JSON.stringify({ id: 'w-x', at: Date.now() }));
    expect(await consumeDecoyBoot()).toBe('w-x');
    expect(isDecoySession()).toBe(true);
    expect(mockKv.has('kalyx.decoyBoot')).toBe(false);
    expect(await AsyncStorage.getItem('nova.recentRecipients')).toBeNull(); // lectures vides
  });
  it('marqueur périmé ou absent : démarrage ordinaire', async () => {
    mockKv.set('kalyx.decoyBoot', JSON.stringify({ id: 'w-x', at: Date.now() - 5 * 60_000 }));
    expect(await consumeDecoyBoot()).toBeNull();
    expect(isDecoySession()).toBe(false);
    expect(await consumeDecoyBoot()).toBeNull();
  });
});
