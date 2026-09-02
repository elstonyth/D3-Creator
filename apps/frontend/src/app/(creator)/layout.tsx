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
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'creator' && auth.role !== 'admin') redirect('/classes');

  const nav = [
    { href: '/me', label: 'Dashboard', exact: true },
    { href: '/me/leaderboard', label: 'Leaderboard' },
    { href: '/me/account', label: 'Account' },
    ...(auth.role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="icon" href="/d3-logo.png?v=3" type="image/png" />
        <link rel="apple-touch-icon" href="/d3-logo.png?v=3" />
        <meta name="darkreader-lock" />
      </head>
      <body className="dark flex min-h-screen flex-col bg-canvas font-sans text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-label focus:text-fg-on-brand"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-50 border-b border-line-subtle bg-canvas">
          <div className="mx-auto grid h-14 max-w-content grid-cols-[1fr_auto] items-center px-6 md:grid-cols-[1fr_auto_1fr] md:px-8">
            <Link
              href="/me"
              className="flex select-none items-center gap-2 justify-self-start transition-opacity duration-150 hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/d3-logo.png"
                alt=""
                width={26}
                height={26}
                suppressHydrationWarning
              />
              <span className="text-heading tracking-[-0.02em] text-fg">
                D3 Creator
              </span>
            </Link>

            <nav
              aria-label="Creator"
              className="hidden items-center gap-0.5 text-label md:flex"
            >
              {nav.map((item) => (
                <NavLink key={item.href} href={item.href} exact={item.exact}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="hidden items-center gap-2 justify-self-end text-label md:flex">
              <span className="max-w-[20ch] truncate text-caption text-fg-subtle">
                {auth.email}
              </span>
              <SignOutButton />
            </div>

            <div className="flex items-center gap-1 justify-self-end md:hidden">
              <SignOutButton />
              <MobileNav links={nav} />
            </div>
          </div>
        </header>

        {/* No gutter here on purpose: each page owns its own <Container>, so a
            band can run full-bleed instead of every page being one 1200px
            column. Matches the public layout. */}
        <main id="main" tabIndex={-1} className="w-full flex-1 overflow-x-clip">
          {children}
        </main>

        <Analytics />
      </body>
    </html>
  );
}
