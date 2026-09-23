import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { isAdminHost } from '@gitroom/frontend/lib/portal-host';

import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignInForm } from '@gitroom/frontend/components/auth/sign-in-form';
import { Alert } from '@gitroom/frontend/components/ui/alert';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  const admin = isAdminHost((await headers()).get('host'));
  return {
    title: admin ? t('Admin sign in — D3 Creator') : t('Sign in — D3 Creator'),
  };
}

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
  const { t } = await getI18n();
  const { redirectTo, notice } = await searchParams;
  const message = notice ? NOTICES[notice] : undefined;
  // admin.d3creator.com gets its own look so staff and creators cannot
  // mistake one sign-in for the other (lib/portal-host.ts).
  const admin = isAdminHost((await headers()).get('host'));

  return (
    <AuthShell
      variant={admin ? 'admin' : 'default'}
      heading={
        admin ? t('Sign in to the admin console') : t('Sign in to D3 Creator')
      }
      subheading={
        admin
          ? t(
              'For D3 staff only. This is not the creator or member sign-in — that lives on www.d3creator.com.',
            )
          : t(
              'One account for the Studio, the class library and your own numbers.',
            )
      }
    >
      <div className="space-y-5">
        {message ? (
          <Alert tone="info">
            <p>{t(message)}</p>
            {notice === 'reset_expired' ? (
              <p>
                <Link
                  href="/forgot-password"
                  className="rounded text-fg underline underline-offset-4 focus-visible:outline-none focus-visible:shadow-focus"
                >{t("Send a new reset link")}</Link>
              </p>
            ) : null}
          </Alert>
        ) : null}

        <SignInForm
          redirectTo={redirectTo ?? (admin ? '/' : undefined)}
          showSignup={!admin}
        />
      </div>
    </AuthShell>
  );
}
