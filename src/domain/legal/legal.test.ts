jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', textDirection: 'ltr' }]),
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
    Platform: { OS: 'ios' },
    NativeModules: {},
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import { LEGAL_CONSTANTS } from '../../constants/legal';
import { LEGAL_PUBLISHER, LEGAL_CONTACT, PRIVACY, TERMS } from '../../../lib/legalText';
import { translate, type Lang, type Key } from '../../../lib/i18n';

describe('Legal & Compliance Constants', () => {
  test('defines official KALYX legal publisher details', () => {
    expect(LEGAL_CONSTANTS.COMPANY_NAME).toBe('KALYX (Entreprise individuelle de Ahamed Signate)');
    expect(LEGAL_CONSTANTS.LEGAL_STATUS).toBe('Entrepreneur individuel');
    expect(LEGAL_CONSTANTS.CONTACT_EMAIL).toBe('support@kalyxwallet.com');
    expect(LEGAL_CONSTANTS.HOSTING_PROVIDER).toBeDefined();
    expect(typeof LEGAL_CONSTANTS.HOSTING_PROVIDER).toBe('string');
    expect(LEGAL_CONSTANTS.PRIVACY_POLICY_URL).toBe('https://kalyxwallet.com/privacy');
    expect(LEGAL_CONSTANTS.TERMS_OF_SERVICE_URL).toBe('https://kalyxwallet.com/terms');
    expect(LEGAL_CONSTANTS.TELEGRAM_URL).toBe('https://t.me/kalyxntw');
    expect(LEGAL_CONSTANTS.X_URL).toBe('https://x.com/kalyxntw');
  });

  test('SIRET fallback is EN_ATTENTE_INSEE when env variable not set', () => {
    expect(LEGAL_CONSTANTS.SIRET).toBeDefined();
    expect(typeof LEGAL_CONSTANTS.SIRET).toBe('string');
  });

  test('legalText references official publisher and contact', () => {
    expect(LEGAL_PUBLISHER).toBe(LEGAL_CONSTANTS.COMPANY_NAME);
    expect(LEGAL_CONTACT).toContain(LEGAL_CONSTANTS.CONTACT_EMAIL);
    expect(PRIVACY.length).toBeGreaterThan(0);
    expect(TERMS.length).toBeGreaterThan(0);
  });
});

describe('Legal Translations (15 Languages)', () => {
  const languages: Lang[] = [
    'fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko',
  ];

  const legalKeys: Key[] = [
    'legalTitle',
    'legalPublisher',
    'legalCompanyNameLabel',
    'legalStatusLabel',
    'legalSiretLabel',
    'legalContactLabel',
    'legalHosting',
    'legalPrivacyPolicy',
    'legalTermsOfService',
    'legalAppVersion',
    'legalStatusIndividual',
    'legalSiretPending',
    'legalOpenExternal',
    'legalRightsReserved',
    'legal.title',
    'legal.publisher',
    'legal.companyNameLabel',
    'legal.statusLabel',
    'legal.siretLabel',
    'legal.contactLabel',
    'legal.hosting',
    'legal.privacyPolicy',
    'legal.termsOfService',
    'legal.appVersion',
    'legalHostingNonCustodial',
    'legal.hostingNonCustodial',
  ];

  test('all legal keys exist and have non-empty values across all 15 languages', () => {
    for (const lang of languages) {
      for (const key of legalKeys) {
        const text = translate(lang, key);
        expect(text).toBeDefined();
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toBe(key);
      }
    }
  });

  test('specific French and English legal strings match LCEN and store requirements', () => {
    expect(translate('fr', 'legalTitle')).toBe('Mentions Légales & À propos');
    expect(translate('fr', 'legalPublisher')).toBe("Éditeur de l'application");
    expect(translate('fr', 'legalStatusIndividual')).toBe('Entrepreneur individuel');
    expect(translate('fr', 'legalSiretPending')).toBe("En cours d'attribution (INSEE)");
    expect(translate('fr', 'legalHostingNonCustodial')).toBe("Application exécutée localement sur le terminal de l'utilisateur (Non-custodial)");

    expect(translate('en', 'legalTitle')).toBe('Legal Notices & About');
    expect(translate('en', 'legalPublisher')).toBe('App Publisher');
    expect(translate('en', 'legalStatusIndividual')).toBe('Sole Proprietorship');
    expect(translate('en', 'legalSiretPending')).toBe('Pending INSEE assignment');
    expect(translate('en', 'legalHostingNonCustodial')).toBe("Application executed locally on user's device (Non-custodial)");
  });
});
