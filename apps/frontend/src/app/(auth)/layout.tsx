import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { LocaleProvider } from '@gitroom/frontend/components/i18n/locale-provider';
import '../global.scss';
import { geistSans, geistMono } from '../fonts';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Sign in — D3 Creator') };
}

// Auth pages read cookies (getAuthContext) and must never prerender at build
// time — Supabase env is required at construction and Next.js otherwise tries
// to statically render /onboarding and friends.
export const dynamic = 'force-dynamic';

// Auth route group has its own html/body so the AuthShell can take the full
// viewport without inheriting (public)'s header/footer chrome.
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale } = await getI18n();
  return (
    <html
      lang={localeTag(locale)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="icon" href="/d3-logo.png?v=3" type="image/png" />
        <meta name="darkreader-lock" />
      </head>
      <body className="dark bg-canvas text-fg font-sans antialiased">
        <LocaleProvider locale={locale}>
          {children}
          <Analytics />
        </LocaleProvider>
      </body>
    </html>
  );
}
