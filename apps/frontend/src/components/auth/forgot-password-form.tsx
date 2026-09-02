'use client';

/**
 * Step 1 of password recovery: ask Supabase to email a link.
 *
 * The success state is deliberately identical whether or not the address has an
 * account. Saying "no account with that email" would turn this form into an
 * account-enumeration oracle, and it is the one page an attacker can hit
 * without credentials.
 */

import { AtSignIcon, MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import { resetErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

export function ForgotPasswordForm(): ReactElement {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    const address = email.trim().toLowerCase();
    try {
      const supabase = getSupabaseBrowser();
      // Same PKCE round trip as sign-up: the link carries `?code=`, and
      // `/auth/callback` is the only route that exchanges it. It drops the user
      // on /reset-password WITH a session, which is what lets updateUser work.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        address,
        {
          redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent('/reset-password')}`,
        },
      );
      // A rate limit is worth showing; "no such user" is not, and Supabase does
      // not report it here anyway.
      if (resetError && resetError.status === 429) {
        setError(resetErrorMessage(resetError));
        return;
      }
      setSentTo(address);
    } catch {
      setError(resetErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (sentTo !== null) {
    return (
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-subtle p-4">
          <MailCheckIcon
            className="size-5 shrink-0 text-brand mt-0.5"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-body text-fg">Check your email.</p>
            <p className="text-body-sm text-fg-muted">
              If <span className="text-fg">{sentTo}</span> has an account, a
              reset link is on its way. The link works once and expires within
              the hour.
            </p>
          </div>
        </div>
        {/* A text link, not a <Link> inside a <Button> — this Button renders a
            real <button>, and nesting an anchor in it is invalid markup. */}
        <p className="text-caption text-fg-muted text-center">
          <Link
            href="/login"
            className="text-brand underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
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
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="pl-9"
          />
        </div>
      </label>

      {error && (
        <p className="text-caption text-danger-fg" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-caption text-fg-muted text-center">
        Remembered it?{' '}
        <Link
          href="/login"
          className="text-brand underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
