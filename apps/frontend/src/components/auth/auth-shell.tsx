'use client';

import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { LanguageSwitcher } from '@gitroom/frontend/components/i18n/language-switcher';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AuroraBackground } from '@gitroom/frontend/components/ui/aurora-background';
import { cn } from '@gitroom/frontend/lib/utils';

interface AuthShellProps {
  children: ReactNode;
  /** The page's <h1>. One per screen. */
  heading: string;
  subheading?: string;
  /**
   * `admin` and `staff` are the portals' own sign-ins (admin.d3creator.com,
   * staff.d3creator.com): aurora backdrop, an ADMIN / STAFF mark beside the
   * logo, a brand-edged card, and a footer that points everyone else back to
   * the public site — so nobody mistakes either for the creator/member login.
   */
  variant?: 'default' | 'admin' | 'staff';
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
export function AuthShell({
  children,
  heading,
  subheading,
  variant = 'default',
}: AuthShellProps) {
  const { t } = useI18n();
  const portal = variant !== 'default';
  return (
    <div className="relative isolate flex min-h-screen flex-col bg-canvas text-fg">
      {portal ? (
        <AuroraBackground
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 -z-10 h-[50vh] w-[50vw] origin-top-left scale-[2] bg-transparent dark:bg-transparent"
        />
      ) : null}
      <div className="flex justify-end px-5 pt-5 sm:px-6">
        <LanguageSwitcher />
      </div>
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
            {portal ? (
              <span className="ml-1 rounded-full border border-brand/50 bg-brand/15 px-2 py-0.5 text-micro uppercase tracking-[0.14em] text-brand">
                {variant === 'admin' ? t('Admin') : t('Staff')}
              </span>
            ) : null}
          </Link>

          <div
            className={cn(
              'rounded-2xl border p-6 sm:p-8',
              portal
                ? 'border-brand/40 bg-surface/80 shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(242,230,0,0.35)] backdrop-blur-xl'
                : 'border-line bg-surface',
            )}
          >
            <h1 className="text-subsection text-fg">{heading}</h1>
            {subheading ? (
              <p className="mt-2 text-body-sm text-fg-muted">{subheading}</p>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>

      <footer className="px-5 pb-10 sm:px-6">
        {portal ? (
          <p className="mx-auto max-w-[400px] text-center text-caption text-fg-muted">
            {variant === 'admin'
              ? t('Staff console. Creators and members sign in at')
              : t('D3 team portal. Creators and members sign in at')}{' '}
            <a
              href="https://www.d3creator.com/login"
              className="text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
            >
              www.d3creator.com
            </a>
            .
          </p>
        ) : (
        <p className="mx-auto max-w-[400px] text-center text-caption text-fg-muted">
          {t('No account needed to browse.')}
          <br />
          <Link
            href="/dashboard"
            className="text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('dashboard')}
          </Link>{' '}
          ·{' '}
          <Link
            href="/leaderboard"
            className="text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('leaderboard')}
          </Link>
          .
        </p>
        )}
      </footer>
    </div>
  );
}
