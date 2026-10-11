/*
 * Anciennes copies biométriques EN CLAIR (schéma d'avant `requireAuthentication`) :
 * la purge les retire, et ne touche ni la copie protégée ni son témoin.
 */
const mockDeleted: string[] = [];
jest.mock('./kv', () => ({
  kvGet: async () => null,
  kvSet: async () => {},
  kvDel: async (k: string) => { mockDeleted.push(k); },
}));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1 }));

import { purgeLegacyBiometricSeed } from './secureStore';

it("efface l'ancienne copie en clair, sans toucher à la copie protégée", async () => {
  await purgeLegacyBiometricSeed('w2');
  await purgeLegacyBiometricSeed('primary');
  expect(mockDeleted).toContain('nova.bioSeed.w2');
  expect(mockDeleted).toContain('nova.bioSeed');
  expect(mockDeleted.some((k) => k.startsWith('nova.bioSeedG'))).toBe(false);
});
