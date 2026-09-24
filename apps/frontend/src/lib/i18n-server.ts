import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createTranslator, LOCALE_COOKIE, parseLocale } from './i18n';
import { isStaffHost } from './portal-host';

export const getLocale = cache(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  // The team works in Chinese: the staff portal starts there until someone
  // picks a language (the switcher sets the cookie).
  if (value === undefined && isStaffHost((await headers()).get('host')))
    return 'zh' as const;
  return parseLocale(value);
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
