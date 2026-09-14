/** Les 15 langues de l'app (locales/*.json). `fr` = langue par défaut et des textes légaux. */
export const LOCALES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'ja', 'ko', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const RTL: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/** Nom de chaque langue, dans cette langue (pour le sélecteur). */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

/** Code BCP 47 pour <html lang> et hreflang. */
export const HTML_LANG: Record<Locale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  pt: 'pt',
  de: 'de',
  it: 'it',
  nl: 'nl',
  pl: 'pl',
  tr: 'tr',
  ru: 'ru',
  ar: 'ar',
  hi: 'hi',
  ja: 'ja',
  ko: 'ko',
  zh: 'zh-Hans',
};

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x);
}

/** Choisit la meilleure langue parmi celles du navigateur (ex. ['pt-BR', 'en-US']). */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export const STORAGE_KEY = 'kalyx-lang';
