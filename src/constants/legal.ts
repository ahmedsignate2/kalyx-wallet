/**
 * Mentions Légales & Informations de Conformité KALYX.
 * Conforme à la loi française LCEN (Loi pour la Confiance dans l'Économie Numérique)
 * et aux guidelines de publication Google Play Store & Apple App Store.
 */

export const LEGAL_CONSTANTS = {
  COMPANY_NAME: 'KALYX (Entreprise individuelle de Ahamed Signate)',
  LEGAL_STATUS: 'Entrepreneur individuel',
  SIRET: process.env.EXPO_PUBLIC_SIRET || '130 046 865 00015',
  APE_CODE: process.env.EXPO_PUBLIC_APE_CODE || '62.01Z',
  CONTACT_EMAIL: process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'support@kalyxwallet.com',
  // L'application n'a pas d'hébergeur : elle tourne en local sur l'appareil (voir legalHostingNonCustodial).
  // Cloudflare héberge uniquement le site web kalyxwallet.com (cf. web/content/mentions.ts).
  HOSTING_PROVIDER: process.env.EXPO_PUBLIC_HOSTING_PROVIDER || '',
  PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://kalyxwallet.com/privacy',
  TERMS_OF_SERVICE_URL: process.env.EXPO_PUBLIC_TERMS_URL || 'https://kalyxwallet.com/terms',
  WEBSITE_URL: process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://kalyxwallet.com',
  GITHUB_URL: process.env.EXPO_PUBLIC_GITHUB_URL || 'https://github.com/ahmedsignate2/nova-wallet-release',
  TELEGRAM_URL: 'https://t.me/kalyxntw',
  X_URL: 'https://x.com/kalyxntw',
} as const;
