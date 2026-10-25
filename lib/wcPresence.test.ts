import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return { __esModule: true, default: { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => void mem.set(k, v) } };
});
import { loadPresence, presenceOf, savePresence, ONLINE_MS, SILENT_MS } from './wcPresence';

describe('signe de vie des connexions', () => {
  const now = 1_800_000_000_000;
  test('état selon le dernier signe de vie', () => {
    expect(presenceOf(undefined, now)).toBe('unknown');
    expect(presenceOf(now - 10_000, now)).toBe('online');
    expect(presenceOf(now - ONLINE_MS - 1, now)).toBe('recent');
    expect(presenceOf(now - SILENT_MS - 1, now)).toBe('silent');
  });

  test('enregistré, relu, et oublié pour les sessions fermées', async () => {
    await savePresence({ a: now, b: now - 5 }, ['a', 'b']);
    expect(await loadPresence()).toEqual({ a: now, b: now - 5 });
    expect(await savePresence({ a: now, b: now - 5 }, ['a'])).toEqual({ a: now });
    expect(await loadPresence()).toEqual({ a: now });
  });

  test('stockage illisible : rien plutôt qu’une erreur', async () => {
    await AsyncStorage.setItem('kalyx.wc.presence', '{pas du json');
    expect(await loadPresence()).toEqual({});
    await AsyncStorage.setItem('kalyx.wc.presence', JSON.stringify({ a: 'x', b: 12 }));
    expect(await loadPresence()).toEqual({ b: 12 });
  });
});
