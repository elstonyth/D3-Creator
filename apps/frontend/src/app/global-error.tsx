'use client';

// Catches errors in the root layout and otherwise-unhandled React render errors.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect, useSyncExternalStore } from 'react';
import { localeTag, readLocaleCookie, translate } from '@gitroom/frontend/lib/i18n';

const subscribe = () => () => {};
const serverLocale = () => 'en' as const;
const browserLocale = () => readLocaleCookie(document.cookie);

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // This boundary replaces the root layout, so its language provider may be unavailable.
  const locale = useSyncExternalStore(subscribe, browserLocale, serverLocale);
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={localeTag(locale)}>
      <body>
        <NextError statusCode={0} title={translate(locale, 'Something went wrong')} />
      </body>
    </html>
  );
}
