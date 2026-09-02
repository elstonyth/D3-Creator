import Link from 'next/link';

import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import MobileNav from '@gitroom/frontend/components/ui/mobile-nav';
import NavDropdown, {
  type StudioViewer,
} from '@gitroom/frontend/components/ui/nav-dropdown';
import NavLink from '@gitroom/frontend/components/ui/nav-link';

// Owner decision 2026-08-23 (supersedes PRD 3 §5.3's list): Studio holds the
// TOOLS only. Classes is a video library, not a tool — it sits top-level, and
// /classes carries its own signed-out sign-in CTA, so it does not need the
// dropdown's /login?redirectTo rewrite.
const STUDIO_LABEL = 'Studio';
const STUDIO_ITEMS = [
  { href: '/studio/analyzer', label: 'Video Analyzer' },
  { href: '/studio/chat', label: 'Script Coach' },
  { href: '/studio/settings', label: 'Settings' },
];

const BROWSE = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/classes', label: 'Classes' },
  { href: '/about', label: 'About' },
];

export interface SiteHeaderProps {
  /** null when signed out. Only the role reaches the client. */
  role: 'admin' | 'creator' | 'member' | 'none' | null;
  viewer: StudioViewer;
}

/**
 * Public site header. Server Component — the two client islands it mounts
 * (NavDropdown, MobileNav) take a `viewer` string rather than the auth context,
 * so no email ever lands in the RSC payload of a public page.
 *
 * The grid's outer tracks are both `1fr` so the centre nav sits on the true page
 * centreline rather than halfway between the logo and the account cluster.
 */
export function SiteHeader({ role, viewer }: SiteHeaderProps) {
  const accountHref = role === 'admin' ? '/admin' : '/me';
  const accountLabel = role === 'admin' ? 'Admin' : 'My data';

  return (
    <header className="sticky top-0 z-50 border-b border-line-subtle bg-canvas">
      <div className="mx-auto grid h-14 max-w-content grid-cols-[1fr_auto] items-center px-6 md:grid-cols-[1fr_auto_1fr] md:px-8">
        <Link
          href="/"
          className="flex select-none items-center gap-2 justify-self-start transition-opacity duration-150 hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/d3-logo.png"
            alt="D3"
            width={26}
            height={26}
            suppressHydrationWarning
          />
          <span className="text-heading tracking-[-0.02em] text-fg">
            D3 Creator
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 text-label md:flex">
          {BROWSE.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
          <NavDropdown
            label={STUDIO_LABEL}
            items={STUDIO_ITEMS}
            viewer={viewer}
          />
        </nav>

        {/* Signed out gets the only bordered affordance in the bar, so the entry
            action reads as an action rather than a sixth sibling link. */}
        <div className="hidden items-center gap-1 justify-self-end text-label md:flex">
          {role ? (
            <>
              <NavLink href={accountHref}>{accountLabel}</NavLink>
              <SignOutButton />
            </>
          ) : (
            <ButtonLink href="/login" variant="secondary" size="sm">
              Sign in
            </ButtonLink>
          )}
        </div>

        <div className="flex items-center gap-1 justify-self-end text-label md:hidden">
          {role ? <SignOutButton /> : null}
          <MobileNav
            viewer={viewer}
            links={[
              ...BROWSE,
              { label: STUDIO_LABEL, children: STUDIO_ITEMS },
              ...(role
                ? [{ href: accountHref, label: accountLabel }]
                : [{ href: '/login', label: 'Sign in' }]),
            ]}
          />
        </div>
      </div>
    </header>
  );
}
