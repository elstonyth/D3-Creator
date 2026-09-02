'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtSignIcon } from 'lucide-react';
import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import { signInErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';
import { safeRedirect } from '@gitroom/frontend/lib/redirects';

interface SignInFormProps {
  redirectTo?: string;
}

export function SignInForm({ redirectTo }: SignInFormProps) {
  const router = useRouter();
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-label text-fg-muted">Email</span>
        <div className="relative">
          <AtSignIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-subtle pointer-events-none" />
          <Input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
          />
        </div>
      </label>

      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="••••••••"
        disabled={pending}
      />

      <p className="text-caption text-right">
        <Link
          href="/forgot-password"
          className="text-fg-muted hover:text-fg transition-colors duration-150 ease-out"
        >
          Forgot your password?
        </Link>
      </p>

      {error && (
        <p className="text-caption text-danger-fg" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-caption text-fg-muted text-center">
        New here?{' '}
        <Link
          href="/signup"
          className="text-brand underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
