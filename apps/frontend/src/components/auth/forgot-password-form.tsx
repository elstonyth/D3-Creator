'use client';

/**
 * Step 1 of password recovery: ask Supabase to email a link.
 *
 * The success state is deliberately identical whether or not the address has an
 * account. Saying "no account with that email" would turn this form into an
 * account-enumeration oracle, and it is the one page an attacker can hit
 * without credentials.
 */

import Link from 'next/link';
import { useId, useState, type FormEvent, type ReactElement } from 'react';

import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input } from '@gitroom/frontend/components/ui/input';
import { resetErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

export function ForgotPasswordForm(): ReactElement {
  const emailId = useId();
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
      <div className="space-y-5">
        <Alert tone="success" title="Check your email.">
          If <span className="break-words text-fg">{sentTo}</span> has an account, a reset
          link is on its way. The link works once and expires within the hour.
        </Alert>
        {/* A text link, not a <Link> inside a <Button> — nesting an anchor in a
            real <button> is invalid markup. */}
        <p className="text-center text-caption text-fg-muted">
          <Link
            href="/login"
            className="rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Email"
        htmlFor={emailId}
        hint="The address you signed up with."
      >
        <Input
          id={emailId}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          autoFocus
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-describedby={`${emailId}-hint`}
        />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>

      <p className="text-center text-caption text-fg-muted">
        Remembered it?{' '}
        <Link
          href="/login"
          className="rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
