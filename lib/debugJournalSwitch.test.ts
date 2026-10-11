jest.mock('react-native', () => ({ Alert: { alert: jest.fn() }, AppState: { addEventListener: jest.fn() }, I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR', textDirection: 'ltr' }]) }));
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: jest.fn(async () => {}),
}));
const mockSave = jest.fn(async (_o: Record<string, unknown>) => {});
let mockDisk: Record<string, unknown> | null = null;
let mockRelease: () => void = () => {};
jest.mock('./secureStore', () => ({
  saveSettings: (o: Record<string, unknown>) => mockSave(o),
  loadSettings: () => new Promise((res) => { mockRelease = () => res(mockDisk); }),
}));
jest.mock('./sessionMode', () => ({ isDecoySession: () => false, onDecoyChange: () => {} }));
jest.mock('./walletStore', () => ({ DEFAULT_CHAIN: 'ethereum', useWallet: { getState: () => ({ activeChain: 'ethereum', setActiveChain: jest.fn() }) } }));
jest.mock('../src', () => ({ setNumberLocale: () => {}, hasChain: () => true, getAdapter: () => ({ config: { testnet: false } }) }));

import { journal, journalLines, clearJournal, isJournalEnabled, installJournal } from './debugJournal';
import { useSettings } from './settingsStore';

describe('Interrupteur « Journal de diagnostic »', () => {
  it('activé par défaut ; coupé, plus rien n’est enregistré ; persisté dans les réglages', async () => {
    expect(useSettings.getState().debugJournalEnabled).toBe(true);
    expect(isJournalEnabled()).toBe(true);
    // Coupé AVANT la fin de load() : écriture différée respectée (aucun écrasement du disque).
    const loading = useSettings.getState().load();
    useSettings.getState().setDebugJournalEnabled(false);
    expect(mockSave).not.toHaveBeenCalled();
    expect(isJournalEnabled()).toBe(false);
    clearJournal();
    journal('log', 'ne doit pas apparaître');
    console.log('ni ceci');
    expect(journalLines()).toHaveLength(0);
    mockDisk = { profileName: 'Alice', language: 'fr' };
    mockRelease();
    await loading;
    expect(useSettings.getState()).toMatchObject({ profileName: 'Alice', debugJournalEnabled: false });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({ profileName: 'Alice', debugJournalEnabled: false });
    expect(mockStorage['kalyx.debugJournal.enabled']).toBe('0');

    useSettings.getState().setDebugJournalEnabled(true);
    journal('log', 'de nouveau');
    expect(journalLines().map((l) => l.m)).toContain('de nouveau');
    expect(mockStorage['kalyx.debugJournal.enabled']).toBe('1');
  });

  it('absent du disque = activé ; `false` explicite = coupé', async () => {
    mockDisk = {};
    const p = useSettings.getState().load();
    mockRelease();
    await p;
    expect(useSettings.getState().debugJournalEnabled).toBe(true);
    mockDisk = { debugJournalEnabled: false };
    const q = useSettings.getState().load();
    mockRelease();
    await q;
    expect(useSettings.getState().debugJournalEnabled).toBe(false);
    expect(isJournalEnabled()).toBe(false);
  });

  it('coupé lors d’une session précédente : les lignes du démarrage sont jetées', async () => {
    useSettings.getState().setDebugJournalEnabled(true);
    clearJournal();
    mockStorage['kalyx.debugJournal.enabled'] = '0';
    installJournal(); // lit la copie de démarrage
    journal('log', 'tout début de session');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(isJournalEnabled()).toBe(false);
    expect(journalLines().map((l) => l.m)).not.toContain('tout début de session');
  });
});
