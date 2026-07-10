export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE_NAME = 'docent_locale';

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
  );
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeFromAcceptLanguage(value: string | null): Locale {
  if (!value) return DEFAULT_LOCALE;

  for (const languageRange of value.split(',')) {
    const language = languageRange.split(';', 1)[0].trim().toLowerCase();
    if (language === 'zh' || language.startsWith('zh-')) return 'zh-CN';
    if (language === 'en' || language.startsWith('en-')) return 'en';
  }

  return DEFAULT_LOCALE;
}
