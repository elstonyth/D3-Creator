'use client';

/**
 * Step 2 of password recovery: set the new password.
 *
 * Reached only from `/auth/callback`, which has already exchanged the emailed
 * `?code=` for a session — `updateUser` writes against that session, so a
 * visitor who lands here without one is sent to ask for a fresh link rather
 * than shown a form that cannot work.
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';

import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Skeleton } from '@gitroom/frontend/components/ui/skeleton';
import { resetErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

type SessionState = 'checking' | 'ready' | 'missing';

export function ResetPasswordForm(): ReactElement {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState<SessionState>('checking');

  useEffect(() => {
    let live = true;
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setSession(data.session ? 'ready' : 'missing');
      })
      .catch(() => {
        if (live) setSession('missing');
      });
    return () => {
      live = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    // Checked here rather than with `required` + `pattern`, because the browser
    // cannot compare two fields and a mismatch must not cost a round trip.
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setPending(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(resetErrorMessage(updateError));
        return;
      }
      // The session from the reset link is already a real session, so there is
      // nothing to sign in to — go where a returning member belongs.
      router.push('/studio/chat');
      router.refresh();
    } catch {
      setError(resetErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (session === 'checking') {
    // Shaped like the form it is about to become, so nothing jumps when the
    // session check lands.
    return (
      <div className="space-y-4" aria-busy="true">
        <p className="sr-only" role="status">
          Checking your link.
        </p>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (session === 'missing') {
    return (
      <div className="space-y-5">
        <Alert tone="warning" title="That link has expired.">
          Reset links work once and time out within the hour. Ask for a new one
          and it will land in your inbox straight away.
        </Alert>
        <ButtonLink href="/forgot-password" size="lg" className="w-full">
          Send a new link
        </ButtonLink>
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
      <PasswordField
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
        disabled={pending}
        hint="8 characters or more. A short phrase beats a clever word."
      />
      <PasswordField
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        placeholder="Type it again"
        minLength={8}
        disabled={pending}
        hint="Both fields have to match."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Set new password
      </Button>
    </form>
  );
}
