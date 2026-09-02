import '../global.scss';
import { geistSans, geistMono } from '../fonts';
import { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import { Footer } from '@gitroom/frontend/components/ui/footer';
import NavLink from '@gitroom/frontend/components/ui/nav-link';
import MobileNav from '@gitroom/frontend/components/ui/mobile-nav';
import NavDropdown, {
  type StudioViewer,
} from '@gitroom/frontend/components/ui/nav-dropdown';
import { SITE_NAME, SITE_URL } from '@gitroom/frontend/lib/site';

const description =
  'Login-free social analytics. Follower counts, views, and engagement across Instagram, TikTok, Facebook and more — no login required.';

// PRD 3 §5.3. Declared here, in a Server Component, and NOT exported, so
// neither constant enters the client bundle and a rename stays one edit.
const STUDIO_LABEL = 'Studio';
// Owner decision 2026-08-23 (supersedes PRD 3 §5.3's list): Studio holds the
// TOOLS only. Classes is a video library, not a tool — it sits top-level, and
// /classes carries its own signed-out sign-in CTA, so it no longer needs the
// dropdown's /login?redirectTo rewrite.
const STUDIO_ITEMS = [
  { href: '/studio/analyzer', label: 'Video Analyzer' },
  { href: '/studio/chat', label: 'Script Coach' },
  // Amendment 1 Part C.iii. Reaching Settings only from the chat's first-run
  // form is a dead end — that form is shown only when there is NO active
  // profile, so the link vanishes the moment one exists.
  { href: '/studio/settings', label: 'Settings' },
];

// Default metadata for every public page. metadataBase makes the generated OG
// image (opengraph-image.tsx) and any relative URLs resolve to absolute. Pages
// override title/description via their own `metadata` exports; openGraph and
// twitter inherit these defaults so shared links always render a card.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — login-free social analytics`,
  description,
  applicationName: SITE_NAME,
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    // og:url intentionally omitted — per-page canonical (alternates.canonical)
    // carries the authoritative URL; a static url here would be wrong on subpages.
    title: `${SITE_NAME} — login-free social analytics`,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — login-free social analytics`,
    description,
  },
};

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await getAuthContext();
  const studioViewer: StudioViewer = !auth
    ? 'signed-out'
    : isStudioMember(auth)
      ? 'member'
      : 'no-access';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="icon" href="/d3-logo.png?v=3" type="image/png" />
        <link rel="apple-touch-icon" href="/d3-logo.png?v=3" />
        {/* Page is already dark — tell Dark Reader to skip it so it doesn't
            inject data-darkreader-* attrs pre-hydration and cause mismatch */}
        <meta name="darkreader-lock" />
      </head>
      <body className="dark text-fg bg-canvas min-h-screen flex flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black focus:shadow-lg"
        >
          Skip to content
        </a>
        {/* Header — DESIGN.md §4 navbar: logo left, nav center, account right.
            The grid's outer tracks are equal (1fr) so the centre group sits on
            the true page centreline, not "between logo and account". */}
        <header className="sticky top-0 z-50 border-b border-borderGlass bg-canvas">
          <div className="max-w-[1200px] mx-auto px-6 md:px-8 h-14 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center">
            <Link
              href="/"
              className="justify-self-start flex items-center gap-2 select-none hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/d3-logo.png"
                alt="D3"
                width={28}
                height={28}
                suppressHydrationWarning
              />
              <span className="text-heading font-semibold tracking-[-0.02em] text-fg">
                D3 Creator
              </span>
            </Link>

            {/* Centre — browse surfaces only; account actions live on the right */}
            <nav className="hidden md:flex items-center gap-1 text-label">
              <NavLink href="/about">About</NavLink>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <NavLink href="/classes">Classes</NavLink>
              <NavDropdown
                label={STUDIO_LABEL}
                items={STUDIO_ITEMS}
                viewer={studioViewer}
              />
            </nav>

            {/* Right — the account cluster. Signed out gets the one bordered
                affordance in the bar (ghost button per DESIGN.md §4) so the
                entry action reads as an action, not a sixth sibling link. */}
            <div className="hidden md:flex items-center gap-1 justify-self-end text-label">
              {auth ? (
                <>
                  <NavLink href={auth.role === 'admin' ? '/admin' : '/me'}>
                    {auth.role === 'admin' ? 'Admin' : 'My data'}
                  </NavLink>
                  <SignOutButton />
                </>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center h-8 px-3 rounded-md border border-borderGlassStrong text-fg hover:bg-white/[0.04] transition-colors duration-150 ease-out"
                >
                  Sign in
                </Link>
              )}
            </div>

            {/* Mobile — links live in the hamburger; sign-out stays visible */}
            <div className="flex md:hidden items-center gap-1 justify-self-end text-label">
              {auth && <SignOutButton />}
              <MobileNav
                viewer={studioViewer}
                links={[
                  { href: '/about', label: 'About' },
                  { href: '/dashboard', label: 'Dashboard' },
                  { href: '/leaderboard', label: 'Leaderboard' },
                  { href: '/classes', label: 'Classes' },
                  { label: STUDIO_LABEL, children: STUDIO_ITEMS },
                  ...(auth
                    ? [
                        {
                          href: auth.role === 'admin' ? '/admin' : '/me',
                          label: auth.role === 'admin' ? 'Admin' : 'My data',
                        },
                      ]
                    : [{ href: '/login', label: 'Sign in' }]),
                ]}
              />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main
          id="main"
          tabIndex={-1}
          className="relative z-10 flex-1 w-full overflow-x-clip"
        >
          <div className="max-w-[1200px] mx-auto px-6 md:px-8">{children}</div>
        </main>

        {/* Footer */}
        <div className="relative z-10 mt-12">
          <Footer
            logo={
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/d3-logo.png"
                alt=""
                width={28}
                height={28}
                suppressHydrationWarning
              />
            }
            brandName="D3 Creator"
            mainLinks={[
              { href: '/about', label: 'About' },
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/leaderboard', label: 'Leaderboard' },
              { href: '/classes', label: 'Classes' },
            ]}
            legalLinks={[
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
            ]}
            copyright={{
              text: '© 2025 D3 Creator',
              license: 'All rights reserved',
            }}
          />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
