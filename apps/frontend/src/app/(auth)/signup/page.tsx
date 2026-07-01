import type { Metadata } from 'next';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignUpForm } from '@gitroom/frontend/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Sign up — D3 Creator' };

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Sign up"
      heading="Join the classes."
      subheading="Create a free account to watch member classes."
    >
      <SignUpForm />
    </AuthShell>
  );
}
