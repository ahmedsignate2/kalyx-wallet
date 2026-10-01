jest.mock('../src', () => ({ ...jest.requireActual('../src') }));
import { evmFamilyActivity } from './accountActivity';

describe('evmFamilyActivity', () => {
  it('un réseau muet ne rend pas tout inconnu ; une activité suffit', () => {
    expect(evmFamilyActivity(['empty', 'empty', 'empty', 'empty', 'empty', 'unknown'])).toBe('empty');
    expect(evmFamilyActivity(['empty', 'unknown', 'unknown', 'used'])).toBe('used');
    expect(evmFamilyActivity(['empty', 'unknown', 'unknown', 'unknown'])).toBe('unknown');
    expect(evmFamilyActivity([])).toBe('unknown');
  });
});
