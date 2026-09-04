import type { ReactNode } from 'react';
import Link from 'next/link';

interface AuthShellProps {
  children: ReactNode;
  /** The page's <h1>. One per screen. */
  heading: string;
  subheading?: string;
}

/**
 * The single surface behind every auth screen: sign in, sign up, forgot and
 * reset all render this, so moving between them changes the words and nothing
 * else.
 *
 * Deliberately a centred 400px card rather than a split pane. Three of the four
 * screens have nothing to sell — nobody halfway through a password reset wants
 * a testimonial — and a marketing panel that has to go blank on one screen is
 * not the same shell any more.
 */
export function AuthShell({ children, heading, subheading }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">
          <Link
            href="/"
            className="mx-auto mb-8 flex w-fit select-none items-center gap-2 rounded-lg px-1 py-1 transition-opacity duration-150 ease-out hover:opacity-80 focus-visible:outline-none focus-visible:shadow-focus"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/d3-logo.png"
              alt=""
              width={28}
              height={28}
              aria-hidden
              suppressHydrationWarning
            />
            <span className="text-heading tracking-[-0.01em] text-fg">
              D3 Creator
            </span>
          </Link>

          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h1 className="text-subsection text-fg">{heading}</h1>
            {subheading ? (
              <p className="mt-2 text-body-sm text-fg-muted">{subheading}</p>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>

      <footer className="px-5 pb-10 sm:px-6">
        <p className="mx-auto max-w-[400px] text-center text-caption text-fg-muted">
          No account needed to browse the{' '}
          <Link
            href="/dashboard"
            className="text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            dashboard
          </Link>{' '}
          or the{' '}
          <Link
            href="/leaderboard"
            className="text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            leaderboard
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
