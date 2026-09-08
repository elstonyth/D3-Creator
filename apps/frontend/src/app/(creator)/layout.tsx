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

// Cookie-bound. Never prerender — Supabase env required at construction.
export const dynamic = 'force-dynamic';

// Creator-scoped layout. There is NO middleware — THIS check enforces auth for
// /me/* pages; child server components re-read the cached auth context.
//
// The chrome deliberately mirrors the public SiteHeader — same 56px bar, same
// hairline, same grid, same NavLink active treatment — without importing it,
// because the nav items differ (signed-in creator routes, not the public site).
export default async function CreatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'creator' && auth.role !== 'admin') redirect('/classes');

  const nav = [
    { href: '/me', label: t('Dashboard'), exact: true },
    { href: '/me/leaderboard', label: t('Leaderboard') },
    { href: '/me/account', label: t('Account') },
    ...(auth.role === 'admin' ? [{ href: '/admin', label: t('Admin') }] : []),
  ];

  return (
    <html
      lang={localeTag(locale)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="icon" href="/d3-logo.png?v=3" type="image/png" />
        <link rel="apple-touch-icon" href="/d3-logo.png?v=3" />
        <meta name="darkreader-lock" />
      </head>
      <body className="dark flex min-h-screen flex-col bg-canvas font-sans text-fg antialiased">
        <LocaleProvider locale={locale}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-label focus:text-fg-on-brand"
          >
            {t('Skip to content')}
          </a>

          <header className="sticky top-0 z-50 border-b border-line-subtle bg-canvas">
            <div className="mx-auto grid h-14 max-w-content grid-cols-[1fr_auto] items-center px-6 lg:grid-cols-[1fr_auto_1fr] md:px-8">
              <Link
                href="/me"
                className="flex select-none items-center gap-2 justify-self-start transition-opacity duration-150 hover:opacity-90"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/d3-logo.png"
                  alt=""
                  width={28}
                  height={28}
                  suppressHydrationWarning
                />
                <span className="text-heading tracking-[-0.02em] text-fg">
                  D3 Creator
                </span>
              </Link>

              <nav
                aria-label={t('Creator')}
                className="hidden items-center gap-0.5 text-label lg:flex"
              >
                {nav.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="hidden items-center gap-2 justify-self-end text-label lg:flex">
                <span className="max-w-[12ch] truncate text-caption text-fg-subtle">
                  {auth.email}
                </span>
                <LanguageSwitcher />
                <SignOutButton />
              </div>

              <div className="flex items-center gap-1 justify-self-end lg:hidden">
                <LanguageSwitcher />
                <MobileNav links={nav} showSignOut />
              </div>
            </div>
          </header>

          {/* No gutter here on purpose: each page owns its own <Container>, so a
            band can run full-bleed instead of every page being one 1200px
            column. Matches the public layout. */}
          <main
            id="main"
            tabIndex={-1}
            className="w-full flex-1 overflow-x-clip"
          >
            {children}
          </main>

          <Analytics />
        </LocaleProvider>
      </body>
    </html>
  );
}
