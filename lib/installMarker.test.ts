jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));
jest.mock('./secureStore', () => ({ loadWalletsList: async () => [] }));

import {
  acknowledgeReinstall,
  detectReinstall,
  ensureInstallMarker,
  INSTALL_MARKER_KEY,
  type InstallMarkerDeps,
} from './installMarker';

function makeDeps(os: string, initial: Record<string, string>, wallets: number) {
  const mem = new Map(Object.entries(initial));
  const deps: InstallMarkerDeps = {
    os,
    getItem: async (k) => mem.get(k) ?? null,
    setItem: async (k, v) => void mem.set(k, v),
    getAllKeys: async () => [...mem.keys()],
    walletCount: async () => wallets,
    now: () => 1_800_000_000_000,
  };
  return { deps, mem };
}

describe('installMarker', () => {
  it('iOS : trousseau avec portefeuilles + AsyncStorage vide → réinstallation, sans rien effacer', async () => {
    const { deps, mem } = makeDeps('ios', {}, 2);
    expect(await detectReinstall(deps)).toBe(true);
    expect(mem.has(INSTALL_MARKER_KEY)).toBe(true);
    // Persisté : les lancements suivants le signalent encore, même si AsyncStorage se remplit.
    mem.set('history', '[]');
    expect(await detectReinstall(deps)).toBe(true);
    await acknowledgeReinstall(deps);
    expect(await detectReinstall(deps)).toBe(false);
  });

  it('iOS : le journal écrit au démarrage ne masque pas une réinstallation', async () => {
    const { deps } = makeDeps('ios', { 'kalyx.debugJournal.v1': '[]', 'kalyx.debugJournal.enabled': '1' }, 1);
    expect(await detectReinstall(deps)).toBe(true);
  });

  it('iOS : mise à jour d’une installation existante (AsyncStorage non vide) → pas de réinstallation', async () => {
    const { deps } = makeDeps('ios', { history: '[]' }, 1);
    expect(await detectReinstall(deps)).toBe(false);
  });

  it('iOS : premier lancement sans portefeuille → pas de réinstallation, témoin posé', async () => {
    const { deps, mem } = makeDeps('ios', {}, 0);
    expect(await detectReinstall(deps)).toBe(false);
    expect(mem.has(INSTALL_MARKER_KEY)).toBe(true);
  });

  it('iOS : témoin posé à la création → la détection suivante ne crie pas à la réinstallation', async () => {
    const { deps } = makeDeps('ios', {}, 1);
    await ensureInstallMarker(deps);
    expect(await detectReinstall(deps)).toBe(false);
  });

  it('Android : jamais de réinstallation (Keystore détruit à la désinstallation)', async () => {
    const { deps } = makeDeps('android', {}, 3);
    expect(await detectReinstall(deps)).toBe(false);
  });

  it('ne lève jamais (stockage indisponible)', async () => {
    const { deps } = makeDeps('ios', {}, 1);
    deps.getItem = async () => {
      throw new Error('boom');
    };
    await expect(detectReinstall(deps)).resolves.toBe(false);
    await expect(ensureInstallMarker(deps)).resolves.toBeUndefined();
  });
});
