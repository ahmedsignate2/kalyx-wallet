/**
 * Stockage : journal du changement de PIN, et copie biométrique protégée par
 * l'OS. Le trousseau est simulé en mémoire ; on retient pour chaque écriture si
 * elle exigeait l'authentification (`requireAuthentication`).
 */
const mockStore = new Map<string, { value: string; gated: boolean }>();
let mockGatedRead: 'ok' | 'invalidated' | 'cancel' = 'ok';
let mockFailWrite: string | null = null;
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'w' }));
jest.mock('./kv', () => ({
  kvSet: async (k: string, v: string, o?: { requireAuthentication?: boolean }) => {
    if (k === mockFailWrite) throw new Error('écriture refusée');
    mockStore.set(k, { value: v, gated: !!o?.requireAuthentication });
  },
  kvGet: async (k: string, o?: { requireAuthentication?: boolean }) => {
    const e = mockStore.get(k);
    if (!e) return null;
    if (e.gated && o?.requireAuthentication) {
      if (mockGatedRead === 'cancel') throw new Error('Could not Authenticate the user: User canceled the authentication');
      if (mockGatedRead === 'invalidated') return null; // ce que rend expo-secure-store pour une clé invalidée
    }
    return e.value;
  },
  kvDel: async (k: string) => {
    mockStore.delete(k);
  },
}));

import {
  saveVault,
  loadVault,
  savePinChangeJournal,
  clearPinChangeJournal,
  rollbackPinChange,
  enableBiometricSeed,
  readBiometricSeed,
  isBiometricSeedGated,
  hasBiometricSeed,
  disableBiometricSeed,
} from './secureStore';
import type { EncryptedVault } from '../src';

const vault = (tag: string): EncryptedVault => ({ v: 1, kdf: 'scrypt', N: 16384, r: 8, p: 1, salt: tag, nonce: tag, ct: tag });

beforeEach(() => {
  mockStore.clear();
  mockGatedRead = 'ok';
  mockFailWrite = null;
});

describe('changement de PIN : tout ou rien', () => {
  it('journal présent au lancement → les coffres d’avant sont remis', async () => {
    await saveVault('primary', vault('old-a'));
    await saveVault('w2', vault('old-b'));
    await savePinChangeJournal([{ id: 'primary', vault: vault('old-a') }, { id: 'w2', vault: vault('old-b') }]);
    // L'app est tuée après avoir écrit UN seul nouveau coffre (écriture brute du changement).
    mockStore.set('nova.vault', { value: JSON.stringify(vault('new-a')), gated: false });

    expect(await rollbackPinChange()).toBe(true);
    expect((await loadVault('primary'))?.ct).toBe('old-a');
    expect((await loadVault('w2'))?.ct).toBe('old-b');
    expect(await rollbackPinChange()).toBe(false); // journal effacé
  });

  it('une remise qui échoue garde le journal et lève : le prochain lancement réessaie', async () => {
    await saveVault('primary', vault('new-a'));
    await saveVault('w2', vault('new-b'));
    await savePinChangeJournal([{ id: 'primary', vault: vault('old-a') }, { id: 'w2', vault: vault('old-b') }]);
    mockFailWrite = 'nova.vault';
    await expect(rollbackPinChange()).rejects.toThrow('écriture refusée');
    expect((await loadVault('w2'))?.ct).toBe('old-b'); // les autres sont remis quand même
    // Tant que le journal attend, aucune écriture de coffre ne passe sans le résoudre.
    await expect(saveVault('w3', vault('neuf'))).rejects.toThrow('écriture refusée');
    expect(await loadVault('w3')).toBeNull();
    mockFailWrite = null;
    await saveVault('w3', vault('neuf')); // résout d'abord, puis écrit
    expect((await loadVault('primary'))?.ct).toBe('old-a');
    expect((await loadVault('w3'))?.ct).toBe('neuf');
    expect(await rollbackPinChange()).toBe(false); // journal résolu
  });

  it('sans journal (changement terminé), rien n’est touché', async () => {
    await saveVault('primary', vault('new-a'));
    await savePinChangeJournal([{ id: 'primary', vault: vault('old-a') }]);
    await clearPinChangeJournal();
    expect(await rollbackPinChange()).toBe(false);
    expect((await loadVault('primary'))?.ct).toBe('new-a');
  });
});

describe('copie biométrique protégée par l’OS', () => {
  const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('écrite avec requireAuthentication ; l’ancienne copie en clair disparaît', async () => {
    mockStore.set('nova.bioSeed', { value: PHRASE, gated: false }); // ancien schéma
    await enableBiometricSeed('primary', PHRASE);
    expect(mockStore.get('nova.bioSeedG')).toEqual({ value: PHRASE, gated: true });
    expect(mockStore.has('nova.bioSeed')).toBe(false);
    expect(await isBiometricSeedGated('primary')).toBe(true);
    expect(await readBiometricSeed('primary')).toBe(PHRASE);
  });

  it('clé invalidée (nouvelle empreinte) → null, et le témoin s’efface pour que le PIN la réécrive', async () => {
    await enableBiometricSeed('w2', PHRASE);
    mockGatedRead = 'invalidated';
    expect(await readBiometricSeed('w2')).toBeNull();
    expect(await isBiometricSeedGated('w2')).toBe(false);
    expect(await hasBiometricSeed('w2')).toBe(false);
  });

  it('geste annulé → erreur, la copie reste intacte', async () => {
    await enableBiometricSeed('w3', PHRASE);
    mockGatedRead = 'cancel';
    await expect(readBiometricSeed('w3')).rejects.toThrow(/canceled/);
    expect(await isBiometricSeedGated('w3')).toBe(true);
  });

  it('désactiver efface la copie protégée, son témoin et l’ancienne copie', async () => {
    await enableBiometricSeed('primary', PHRASE);
    mockStore.set('nova.bioSeed', { value: PHRASE, gated: false });
    await disableBiometricSeed('primary');
    expect([...mockStore.keys()].filter((k) => k.startsWith('nova.bio'))).toEqual([]);
  });
});
