import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Metadata } from 'next';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignUpForm } from '@gitroom/frontend/components/auth/sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Sign up — D3 Creator") };
}

export default async function SignUpPage() {
  const { t } = await getI18n();
  return (
    <AuthShell
      heading={t("Create your account")}
      subheading={t("A free account opens the Studio — score any video, get scripts built around your business — plus every member class.")}
    >
      <SignUpForm />
    </AuthShell>
  );
}
