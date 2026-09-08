'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  createTranslator,
  localeCookie,
  localeTag,
  readLocaleCookie,
  type Locale,
  type Translator,
} from '@gitroom/frontend/lib/i18n';

type LocaleContextValue = {
  locale: Locale;
  t: Translator;
  changeLocale: (locale: Locale) => void;
  pending: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  t: createTranslator('en'),
  changeLocale: () => {},
  pending: false,
});

export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [serverLocale, setServerLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const t = useMemo(() => createTranslator(locale), [locale]);

  // A refreshed server tree may reflect a preference changed in another tab.
  if (initialLocale !== serverLocale) {
    setServerLocale(initialLocale);
    setLocale(initialLocale);
  }

  useEffect(() => {
    document.documentElement.lang = localeTag(locale);
    function syncPreference() {
      const next = readLocaleCookie(document.cookie);
      if (next === locale) return;
      startTransition(() => {
        setLocale(next);
        router.refresh();
      });
    }
    window.addEventListener('focus', syncPreference);
    return () => window.removeEventListener('focus', syncPreference);
  }, [locale, router]);

  function changeLocale(next: Locale) {
    if (next === locale || pending) return;
    document.cookie = localeCookie(next, window.location.protocol === 'https:');
    document.documentElement.lang = localeTag(next);
    startTransition(() => {
      setLocale(next);
      // Refresh server copy without replacing the route or losing form drafts.
      router.refresh();
    });
  }

  return (
    <LocaleContext.Provider value={{ locale, t, changeLocale, pending }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  return useContext(LocaleContext);
}
