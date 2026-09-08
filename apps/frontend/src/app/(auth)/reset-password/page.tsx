import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';

import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { ResetPasswordForm } from '@gitroom/frontend/components/auth/reset-password-form';

// The session arrives from /auth/callback's code exchange, so this page must
// never be cached — a stale render would show the expired-link state to
// someone who has just clicked a good one.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
  title: t("Set a new password — D3 Creator"),
  robots: { index: false, follow: false },
};
}

export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthShell
      heading={t("Set a new password")}
      subheading={t("The last step of the reset you started by email.")}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
