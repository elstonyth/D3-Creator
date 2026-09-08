import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';

import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { ForgotPasswordForm } from '@gitroom/frontend/components/auth/forgot-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
  title: t("Reset your password — D3 Creator"),
  robots: { index: false, follow: false },
};
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthShell
      heading={t("Reset your password")}
      subheading={t("Give us the email you signed up with and we'll send a link to set a new one.")}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
