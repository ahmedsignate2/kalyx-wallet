import { detectInitialLanguage, resolveLanguage, applyRTL, isRtl, translate, type Lang, type Key } from '../../lib/i18n';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'ar', languageTag: 'ar-SA', textDirection: 'rtl' }]),
}));

jest.mock('react-native', () => {
  const manager = {
    isRTL: false,
    allowRTL: jest.fn((val: boolean) => {
      manager.isRTL = val;
    }),
    forceRTL: jest.fn((val: boolean) => {
      manager.isRTL = val;
    }),
  };
  return {
    I18nManager: manager,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('Language detection & RTL initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    I18nManager.isRTL = false;
  });

  test('detects Arabic when system language is ar and enables RTL', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('ar');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  test('detects supported language (e.g. en) and disables RTL', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('en');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  test('falls back to fr on unsupported language', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'xx' }]);
    const lang = detectInitialLanguage();
    expect(lang).toBe('fr');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
  });

  test('resolveLanguage prioritizes stored user preference over system language', async () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    const lang = await resolveLanguage('en');
    expect(lang).toBe('en');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  test('resolveLanguage uses system Arabic when no stored preference exists', async () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'ar' }]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const lang = await resolveLanguage(null);
    expect(lang).toBe('ar');
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  test('gracefully falls back when expo-localization native module throws', () => {
    (Localization.getLocales as jest.Mock).mockImplementation(() => {
      throw new Error("Cannot find native module 'ExpoLocalization'");
    });
    expect(() => detectInitialLanguage()).not.toThrow();
  });
});

describe('Newly added features localization', () => {
  const newKeys: Key[] = [
    'aiSupportCardTitle',
    'aiSupportCopy',
    'aiSupportCopied',
    'aiSupportCopiedBody',
    'aiSupportSendTelegram',
    'aiSupportSecretAlert',
    'aiSupportCopyError',
    'aiSupportOpenTelegramError',
    'aiSecurityBlockedSecret',
    'aiSuggestionSupport',
    'aiSupportClarifyPrompt',
    'txTrackingTitle',
    'trackTransaction',
    'txPending',
    'includedInBlock',
    'agoMinutes',
    'mempoolProgress',
    'estTimeRange',
    'networkDetails',
    'towards',
    'errTxHashMissing',
    'errCannotOpenBrowser',
    'aboutApprox',
    'notEnoughGasForFee',
    'antiDrainerLoading',
    'antiDrainerSafe',
    'antiDrainerWarningTitle',
    'antiDrainerCriticalTitle',
    'security.simulation.maliciousAddress',
    'maliciousAddress',
    'antiDrainerMaliciousAddress',
    'antiDrainerUnlimitedApproval',
    'antiDrainerNftApproval',
    'antiDrainerNonInteractiveContract',
    'antiDrainerForceSendConfirm',
    'speedUpButton',
    'cancelButton',
    'speedUpConfirmTitle',
    'cancelConfirmTitle',
    'speedUpDescription',
    'cancelDescription',
    'replacementSuccess',
    'replacementError',
    'estimatedExtraFee',
    'nonceLabel',
    'supportHistoryTitle',
    'supportHistoryEmpty',
    'supportHistoryTicketId',
    'supportHistoryCopied',
    'diagnosticExportButton',
    'diagnosticSuccess',
    'diagnosticError',
    'supportDiagnosticSubtitle',
    'supportHistoryProblem',
    'supportHistoryNetwork',
    'supportHistoryDetectedError',
    'supportHistoryClear',
    'supportDiagnosticCopied',
    'supportHistoryDetails',
    'supportHistoryHideDetails',
    'support.history.title',
    'support.history.empty',
    'support.history.ticketId',
    'support.history.copied',
    'support.diagnostic.exportButton',
    'support.diagnostic.success',
    'support.diagnostic.error',
    'support.diagnostic.subtitle',
  ];

  const languages: Lang[] = [
    'fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko',
  ];

  test('all new keys have valid non-empty translations for all 15 languages', () => {
    for (const lang of languages) {
      for (const key of newKeys) {
        const text = translate(lang, key);
        expect(text).toBeDefined();
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toBe(key);
      }
    }
  });

  test('malicious address warning French translation matches exact danger alert format', () => {
    expect(translate('fr', 'security.simulation.maliciousAddress')).toBe("DANGER : L'adresse de destination est signalée comme frauduleuse (Scam/Phishing).");
    expect(translate('fr', 'maliciousAddress')).toBe("DANGER : L'adresse de destination est signalée comme frauduleuse (Scam/Phishing).");
  });

  test('Spanish and French distinct translations for ticket copy', () => {
    expect(translate('fr', 'aiSupportCopy')).toBe('Copier le ticket');
    expect(translate('es', 'aiSupportCopy')).toBe('Copiar ticket');
    expect(translate('en', 'aiSupportCopy')).toBe('Copy ticket');
    expect(translate('de', 'aiSupportCopy')).toBe('Ticket kopieren');
  });

  test('RTL languages return proper text', () => {
    const arTicket = translate('ar', 'aiSupportCardTitle');
    expect(arTicket).toBe('تذكرة الدعم');
  });
});
