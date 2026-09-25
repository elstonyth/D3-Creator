import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { hostInfo } from '@gitroom/frontend/lib/portal-host';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t('Wrong account — D3 Creator'),
    robots: { index: false, follow: false },
  };
}

const LINK =
  'rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus';

/**
 * Where the admin and staff hosts keep a signed-in account that is not one of
 * their own (lib/portal-routing.ts). They used to send it to its home on
 * another host — and sessions are per host, so this host's session stayed put
 * and every visit here, /login included, bounced straight off again. Now the
 * visitor sees which account it is, why it can't be used here, and signs out
 * on this host (landing on its /login) or goes where the account belongs.
 */
export default async function WrongAccountPage() {
  const { t } = await getI18n();
  const { area, site } = hostInfo((await headers()).get('host'));
  const auth = await getAuthContext();
  // The middleware sends everyone else away; this only narrows the types.
  if (!auth || !site || area === 'public') redirect('/login');

  // Shown as host names so dev reads its own hosts, like the hrefs.
  const hosts = {
    admin: new URL(site.admin).host,
    staff: new URL(site.staff).host,
    www: new URL(site.public).host,
  };
  const isStaff = auth.role === 'staff' || auth.role === 'staff_pending';

  let body: ReactNode;
  if (area === 'admin' && isStaff) {
    body = (
      <>
        <p>{t('This is a staff account. Staff work at {staff}.', hosts)}</p>
        <ButtonLink href={`${site.staff}/`} size="lg" className="w-full">
          {t('Go to the staff site')}
        </ButtonLink>
        <div className="text-center">
          <SignOutButton thisHostOnly />
        </div>
      </>
    );
  } else if (area === 'admin') {
    body = (
      <>
        <p>
          {t(
            'Admins only. Staff sign up and sign in at {staff}; creators and members at {www}.',
            hosts,
          )}
        </p>
        <SignOutButton primary thisHostOnly />
        <p className="text-center text-caption">
          <a href={`${site.staff}/login`} className={LINK}>
            {hosts.staff}
          </a>{' '}
          ·{' '}
          <a href={`${site.public}/login`} className={LINK}>
            {hosts.www}
          </a>
        </p>
      </>
    );
  } else if (auth.role === 'admin') {
    body = (
      <>
        <p>{t('This is the admin account. Admins work at {admin}.', hosts)}</p>
        <ButtonLink href={`${site.admin}/`} size="lg" className="w-full">
          {t('Go to the admin console')}
        </ButtonLink>
        <div className="text-center">
          <SignOutButton thisHostOnly />
        </div>
      </>
    );
  } else if (auth.role === 'none') {
    // Removed from the team, or turned away: signing up again would only put
    // them back in the admin's queue.
    body = (
      <>
        <p>
          {t(
            'This account has no access to the staff site. Ask an admin if you think this is a mistake.',
          )}
        </p>
        <SignOutButton primary thisHostOnly />
      </>
    );
  } else {
    body = (
      <>
        <p>
          {t(
            'This isn’t a staff account. Sign out, then create a staff account at this site. If this email is already registered, use a different one, or ask an admin to remove the old account.',
          )}
        </p>
        <SignOutButton primary thisHostOnly />
      </>
    );
  }

  return (
    <AuthShell
      variant={area}
      heading={t('This account can’t be used here')}
      subheading={
        auth.email
          ? t('You’re signed in as {email}.', { email: auth.email })
          : undefined
      }
    >
      <div className="space-y-5 text-body-sm text-fg-muted">{body}</div>
    </AuthShell>
  );
}
