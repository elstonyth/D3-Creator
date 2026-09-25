import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { LocaleProvider } from '@gitroom/frontend/components/i18n/locale-provider';
import { LanguageSwitcher } from '@gitroom/frontend/components/i18n/language-switcher';
import '../global.scss';
import { geistSans, geistMono } from '../fonts';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isStaffHost } from '@gitroom/frontend/lib/portal-host';
import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import NavLink from '@gitroom/frontend/components/ui/nav-link';
import MobileNav from '@gitroom/frontend/components/ui/mobile-nav';
import { Container } from '@gitroom/frontend/components/ui/section';

// Cookie-bound. Never prerender — Supabase env required at construction.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t('D3 Staff'),
    robots: { index: false, follow: false },
  };
}

// Paths are relative to the portal root: `/staff/...` on the public host in
// dev, `/...` on staff.d3creator.com.
const NAV = [{ path: '/', label: 'Work Tracker', exact: true }];

/**
 * The staff portal's own root layout (staff.d3creator.com). The middleware
 * already admits only staff here (lib/portal-routing.ts); this is the second
 * lock, like the (admin) layout's.
 */
export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'staff' && auth.role !== 'staff_pending') redirect('/');
  const approved = auth.role === 'staff';

  const base = isStaffHost((await headers()).get('host')) ? '' : '/staff';
  const nav = approved
    ? NAV.map(({ path, label, exact }) => ({
        href: path === '/' ? base || '/' : base + path,
        label: t(label),
        exact,
      }))
    : [];

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
                href={base || '/'}
                className="flex shrink-0 items-center gap-2.5 rounded-md transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:outline-none focus-visible:shadow-focusRing"
              >
                <Image src="/d3-logo.png" alt="D3" width={28} height={28} />
                <span className="text-heading text-fg">{t('Staff')}</span>
              </Link>

              {nav.length > 0 ? (
                <nav
                  aria-label={t('Staff')}
                  className="hidden items-center gap-1 md:flex"
                >
                  {nav.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      exact={item.exact}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              ) : null}

              <div className="flex items-center gap-2">
                <LanguageSwitcher zoomSafe />
                <div className="hidden md:block">
                  <SignOutButton />
                </div>
                <div className="md:hidden">
                  <MobileNav links={nav} showSignOut />
                </div>
              </div>
            </Container>
          </header>

          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
        </LocaleProvider>
      </body>
    </html>
  );
}
