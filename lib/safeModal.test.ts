jest.mock('react-native', () => ({ Modal: () => null }));
jest.mock('../lib/lockState', () => ({ useLocked: () => false }));
jest.mock('../lib/debugJournal', () => ({ journal: () => {} }));

import { modalShown, modalWanted } from '../ui/kit/SafeModal';

describe('SafeModal : visible comme une Modal React Native', () => {
  it('sans `visible` : affichée (fenêtres montées par leur parent — PIN, succès, NFT)', () => {
    expect(modalWanted(undefined)).toBe(true);
    expect(modalShown(undefined, false)).toBe(true);
  });
  it('`false` ferme ; le verrouillage masque toujours', () => {
    expect(modalShown(false, false)).toBe(false);
    expect(modalShown(true, true)).toBe(false);
    expect(modalShown(undefined, true)).toBe(false);
    expect(modalShown(true, false)).toBe(true);
  });
});
