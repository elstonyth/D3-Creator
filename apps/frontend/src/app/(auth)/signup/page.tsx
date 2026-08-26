import type { Metadata } from 'next';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignUpForm } from '@gitroom/frontend/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Sign up — D3 Creator' };

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Sign up"
      heading="Start writing better videos."
      subheading="A free account opens the Studio — score any video, get scripts built around your business — plus every member class."
    >
      <SignUpForm />
    </AuthShell>
  );
}
