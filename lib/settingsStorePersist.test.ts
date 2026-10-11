jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR', textDirection: 'ltr' }]) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }));
const mockSave = jest.fn(async (_o: Record<string, unknown>) => {});
let mockDisk: Record<string, unknown> | null = null;
let mockRelease: () => void = () => {};
jest.mock('./secureStore', () => ({
  saveSettings: (o: Record<string, unknown>) => mockSave(o),
  loadSettings: () => new Promise((res) => { mockRelease = () => res(mockDisk); }),
}));
jest.mock('./sessionMode', () => ({ isDecoySession: () => false, onDecoyChange: () => {} }));
const mockSetActiveChain = jest.fn();
let mockActive = 'sepolia';
jest.mock('./walletStore', () => ({
  DEFAULT_CHAIN: 'ethereum',
  backupDigestToRecord: () => 'digest-courant',
  useWallet: { getState: () => ({ activeChain: mockActive, setActiveChain: mockSetActiveChain }) },
}));
jest.mock('../src', () => ({
  setNumberLocale: () => {},
  hasChain: (id: string) => id === 'sepolia' || id === 'ethereum',
  getAdapter: (id: string) => ({ config: { testnet: id === 'sepolia' } }),
}));

import { useSettings } from './settingsStore';

describe('settingsStore — aucune écriture avant la fin de load()', () => {
  it("un réglage changé pendant le chargement n'écrase pas le disque, il s'y ajoute", async () => {
    mockDisk = { profileName: 'Alice', fiat: 'usd', pinLength: 6, biometricEnabled: true, language: 'fr' };
    const loading = useSettings.getState().load();
    useSettings.getState().setPinLength(8); // ex. unlock.tsx, tôt
    expect(mockSave).not.toHaveBeenCalled();
    expect(useSettings.getState().pinLength).toBe(8);
    mockRelease();
    await loading;
    const st = useSettings.getState();
    expect(st).toMatchObject({ loaded: true, profileName: 'Alice', fiat: 'usd', pinLength: 8, biometricEnabled: true });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({ profileName: 'Alice', fiat: 'usd', pinLength: 8, biometricEnabled: true });
  });

  it('une fois chargé, chaque setter écrit l’état complet', () => {
    mockSave.mockClear();
    useSettings.getState().setFiat('chf');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({ profileName: 'Alice', fiat: 'chf', pinLength: 8 });
  });

  it('masquer les testnets ramène un réseau de test actif sur le réseau par défaut', () => {
    useSettings.getState().setFlag('showTestnets', false);
    expect(mockSetActiveChain).toHaveBeenCalledWith('ethereum');
    mockSetActiveChain.mockClear();
    mockActive = 'ethereum';
    useSettings.getState().setFlag('showTestnets', false);
    useSettings.getState().setFlag('showTestnets', true);
    expect(mockSetActiveChain).not.toHaveBeenCalled();
  });

  it('une sauvegarde réussie enregistre l’empreinte de son contenu ; une vérification Drive ne la touche pas', () => {
    mockSave.mockClear();
    useSettings.getState().markEncryptedBackup('file');
    expect(useSettings.getState().backupDigest).toBe('digest-courant');
    expect(mockSave.mock.calls[0][0]).toMatchObject({ backupDigest: 'digest-courant' });
    // Constater une date sur Drive ne dit rien du contenu : l'empreinte reste celle connue.
    useSettings.getState().setDriveBackupAt('2026-10-11T10:00:00Z');
    expect(useSettings.getState().backupDigest).toBe('digest-courant');
    useSettings.getState().markEncryptedBackup('drive', 'digest-explicite');
    expect(useSettings.getState()).toMatchObject({ backupDigest: 'digest-explicite', driveBackupAt: expect.any(String) });
  });
});
