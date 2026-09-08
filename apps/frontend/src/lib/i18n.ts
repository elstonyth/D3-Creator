import { commonZh } from './i18n/common.zh';
import { publicZh } from './i18n/public.zh';
import { studioZh } from './i18n/studio.zh';
import { adminZh } from './i18n/admin.zh';
import { authZh } from './i18n/auth.zh';

export type Locale = 'en' | 'zh';
export const LOCALE_COOKIE = 'd3-locale';
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;
export type TranslationValues = Record<string, string | number>;
export type Translator = (
  message: string,
  values?: TranslationValues
) => string;

export const chineseMessages: Readonly<Record<string, string>> = {
  ...commonZh,
  ...publicZh,
  ...studioZh,
  ...adminZh,
  ...authZh,
};

export function parseLocale(value: unknown): Locale {
  return value === 'zh' ? 'zh' : 'en';
}

export function readLocaleCookie(cookie: string): Locale {
  return parseLocale(cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1));
}

export function localeTag(locale: Locale): 'en' | 'zh-CN' {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

/** English source messages remain readable fallbacks; user content never enters this function. */
export function translate(
  locale: Locale,
  message: string,
  values?: TranslationValues
): string {
  const translated =
    locale === 'zh' ? chineseMessages[message] ?? message : message;
  return translated.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    values?.[key] === undefined ? placeholder : String(values[key])
  );
}

export function createTranslator(locale: Locale): Translator {
  return (message, values) => translate(locale, message, values);
}

export function localeCookie(locale: Locale, secure: boolean): string {
  return `${LOCALE_COOKIE}=${parseLocale(
    locale
  )}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}
