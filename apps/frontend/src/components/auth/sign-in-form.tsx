'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input } from '@gitroom/frontend/components/ui/input';
import { signInErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';
import { safeRedirect } from '@gitroom/frontend/lib/redirects';

interface SignInFormProps {
  redirectTo?: string;
}

export function SignInForm({ redirectTo }: SignInFormProps) {
  const router = useRouter();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      // Still no Supabase internals and still no enumeration signal: the table
      // maps only codes that say nothing about whether the account exists.
      // `invalid_credentials` and anything unmapped both read "Invalid email or
      // password"; an unconfirmed address is the one case worth naming, because
      // the fix is in the user's inbox rather than in the form.
      setError(signInErrorMessage(signInError));
      setPending(false);
      return;
    }
    // Middleware will route to /me, /onboarding, or /admin based on state.
    // safeRedirect() blocks cross-origin redirects via ?redirectTo=https://evil.com.
    router.push(safeRedirect(redirectTo, '/me'));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email" htmlFor={emailId}>
        <Input
          id={emailId}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          autoFocus
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
        />
      </Field>

      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="Your password"
        disabled={pending}
        aside={
          <Link
            href="/forgot-password"
            className="rounded text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
          >
            Forgot password?
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>

      <p className="text-center text-caption text-fg-muted">
        New here?{' '}
        <Link
          href="/signup"
          className="rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
