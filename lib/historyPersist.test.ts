jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } }));
import { historyReplacer, historyReviver } from './historyStore';

it('l’historique se sérialise (bigint, jambes comprises) et revient à l’identique', () => {
  const cache = { 'base:0x1': [{ chain: 'base', hash: '0xa', value: 10n ** 30n, legs: [{ direction: 'in', value: 5n }] }] };
  const back = JSON.parse(JSON.stringify(cache, historyReplacer), historyReviver);
  expect(back).toEqual(cache);
  expect(() => JSON.stringify(cache)).toThrow(); // ce qui arrivait avant, en silence
});
