import Link from 'next/link';

import { Container } from '@gitroom/frontend/components/ui/section';

// Module scope, not the component body: react-hooks/purity treats a clock
// read during render as an impurity, and the copyright year does not need to
// be re-derived per request anyway.
const YEAR = new Date().getFullYear();

const BROWSE = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/creators', label: 'Creators' },
];

const LEARN = [
  { href: '/classes', label: 'Classes' },
  { href: '/studio/analyzer', label: 'Video Analyzer' },
  { href: '/studio/chat', label: 'Script Coach' },
];

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

function LinkColumn({
  heading,
  links,
}: {
  heading: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="text-micro uppercase text-fg-subtle">{heading}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-body-sm text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line-subtle">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
          <div className="max-w-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-2 transition-opacity duration-150 hover:opacity-90"
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
            <p className="mt-4 text-body-sm text-fg-muted">
              A live showcase of the creators, brands and IPs we grow — measured
              daily, published unedited.
            </p>
          </div>

          <LinkColumn heading="Browse" links={BROWSE} />
          <LinkColumn heading="Learn" links={LEARN} />
          <LinkColumn heading="Company" links={COMPANY} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line-subtle pt-6 text-caption text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {YEAR} D3 Creator. All rights reserved.</p>
          <p>Built in Malaysia. Numbers refreshed daily.</p>
        </div>
      </Container>
    </footer>
  );
}
