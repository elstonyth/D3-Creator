import { cache } from 'react';
import { cookies } from 'next/headers';
import { createTranslator, LOCALE_COOKIE, parseLocale } from './i18n';

export const getLocale = cache(async () => {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
