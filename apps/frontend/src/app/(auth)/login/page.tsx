import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignInForm } from '@gitroom/frontend/components/auth/sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in — D3 Creator',
};

/**
 * Notices `/auth/callback` can hand us. Keyed by a stable slug, never by the
 * provider's own message — a raw error string in a query parameter is both
 * unreadable and a small information leak.
 *
 * Before this existed the callback set `?error=…` and this page rendered
 * nothing at all, so a failed code exchange looked like an ordinary visit to
 * the sign-in page with the explanation sitting unread in the URL bar.
 */
const NOTICES: Record<string, string> = {
  signin_needed:
    'Your email is confirmed. Sign in here to finish — this happens when the link is opened on a different device from the one you signed up on.',
  reset_expired:
    'That reset link has expired or was already used. Request a new one and it will arrive straight away.',
  link_broken:
    'That link looks incomplete. Try it again from the original email, or request a new one.',
};

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string; notice?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo, notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;

  return (
    <AuthShell
      eyebrow="Sign in"
      heading="Welcome back."
      subheading="Use your D3 account — admins and creators sign in here."
    >
      <div className="space-y-4">
        {message ? (
          <div
            role="status"
            className="rounded-lg border border-borderGlass bg-glass-subtle p-4 space-y-2"
          >
            <p className="text-body-sm text-fgMuted">{message}</p>
            {notice === 'reset_expired' ? (
              <p className="text-caption">
                <Link
                  href="/forgot-password"
                  className="text-aurora-cta underline underline-offset-4"
                >
                  Send a new reset link
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        <SignInForm redirectTo={redirectTo} />
      </div>
    </AuthShell>
  );
}
