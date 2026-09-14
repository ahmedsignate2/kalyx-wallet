/**
 * Mentions Légales & Informations de Conformité KALYX.
 * Conforme à la loi française LCEN (Loi pour la Confiance dans l'Économie Numérique)
 * et aux guidelines de publication Google Play Store & Apple App Store.
 */

export const LEGAL_CONSTANTS = {
  COMPANY_NAME: 'Ahamed Signate (KALYX)',
  LEGAL_STATUS: 'Entrepreneur individuel',
  SIRET: process.env.EXPO_PUBLIC_SIRET || 'EN_ATTENTE_INSEE',
  CONTACT_EMAIL: process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'support@kalyx.app',
  HOSTING_PROVIDER:
    process.env.EXPO_PUBLIC_HOSTING_PROVIDER || 'Vercel Inc. (API & Services) / Cloudflare',
  PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://kalyx.app/privacy',
  TERMS_OF_SERVICE_URL: process.env.EXPO_PUBLIC_TERMS_URL || 'https://kalyx.app/terms',
  TELEGRAM_URL: 'https://t.me/kalyxntw',
  X_URL: 'https://x.com/kalyxntw',
} as const;
