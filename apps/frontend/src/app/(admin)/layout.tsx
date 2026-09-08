import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { LocaleProvider } from '@gitroom/frontend/components/i18n/locale-provider';
import { LanguageSwitcher } from '@gitroom/frontend/components/i18n/language-switcher';
import '../global.scss';
import { geistSans, geistMono } from '../fonts';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import NavLink from '@gitroom/frontend/components/ui/nav-link';
import MobileNav from '@gitroom/frontend/components/ui/mobile-nav';
import { Container } from '@gitroom/frontend/components/ui/section';

// Cookie-bound. Never prerender — Supabase env required at construction.
export const dynamic = 'force-dynamic';

// The console's own nav. Declared once so the desktop bar and the mobile
// hamburger can never drift apart.
const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/profiles', label: 'Accounts' },
  { href: '/admin/classes', label: 'Classes' },
  { href: '/admin/users', label: 'Users' },
];

// Admin-only layout. There is NO middleware.ts — THIS server-side check is the
// gate for admin pages. Admin mutations re-check requireAdmin() independently.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const nav = NAV.map((item) => ({ ...item, label: t(item.label) }));

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
      <body className="dark flex min-h-screen flex-col bg-canvas font-sans text-fg antialiased">
        <LocaleProvider locale={locale}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-label focus:text-fg-on-brand"
          >
            {t('Skip to content')}
          </a>

          <header className="sticky top-0 z-50 border-b border-line bg-canvas">
            <Container className="flex h-14 items-center justify-between gap-4">
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-2.5 rounded-md transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/d3-logo.png"
                  alt="D3 Creator"
                  width={28}
                  height={28}
                />
                <span className="text-heading text-fg">{t('Console')}</span>
              </Link>

              <nav
                aria-label={t('Admin')}
                className="hidden items-center gap-1 lg:flex"
              >
                {nav.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="flex items-center gap-2">
                {auth.email ? (
                  <span
                    className="hidden max-w-[180px] truncate text-caption text-fg-subtle xl:block"
                    title={auth.email}
                  >
                    {auth.email}
                  </span>
                ) : null}
                <LanguageSwitcher />
                <div className="hidden lg:block">
                  <SignOutButton />
                </div>
                <MobileNav links={nav} showSignOut />
              </div>
            </Container>
          </header>

          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <Analytics />
        </LocaleProvider>
      </body>
    </html>
  );
}
