import type { Metadata } from 'next';

import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { ForgotPasswordForm } from '@gitroom/frontend/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password — D3 Creator',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      heading="Reset your password"
      subheading="Give us the email you signed up with and we'll send a link to set a new one."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
