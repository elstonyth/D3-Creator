import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { isStaffHost } from '@gitroom/frontend/lib/portal-host';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignUpForm } from '@gitroom/frontend/components/auth/sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  const staff = isStaffHost((await headers()).get('host'));
  return {
    title: staff ? t('Staff sign up — D3 Creator') : t('Sign up — D3 Creator'),
  };
}

// The admin host never gets here (the middleware sends /signup to the staff
// site), so the form is either the public one or, on staff.d3creator.com, the
// staff one.
export default async function SignUpPage() {
  const { t } = await getI18n();
  if (isStaffHost((await headers()).get('host'))) {
    return (
      <AuthShell
        variant="staff"
        heading={t('Create your staff account')}
        subheading={t(
          'Use your own email. An admin approves new accounts before you see the team’s schedule.',
        )}
      >
        <SignUpForm portal="staff" />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      heading={t("Create your account")}
      subheading={t("A free account opens the Studio — score any video, get scripts built around your business — plus every member class.")}
    >
      <SignUpForm />
    </AuthShell>
  );
}
