'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Field, Input } from '@gitroom/frontend/components/ui/input';
import { signUpErrorMessage } from '@gitroom/frontend/lib/auth-errors';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

/**
 * Where a confirmed new account lands. The four-question form on /studio/chat
 * is the first-run capture surface (PRD 2 §6), so this is the one destination
 * that starts the product rather than parking the user in a video library.
 */
const AFTER_CONFIRM = '/studio/chat';

export function SignUpForm() {
  const router = useRouter();
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(address: string): Promise<boolean> {
    const supabase = getSupabaseBrowser();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: address,
      password,
      options: {
        // WITHOUT THIS the confirmation link points at the project's Site URL —
        // the marketing home page — and `/auth/callback` is never reached. The
        // browser client is PKCE, so the link carries `?code=`, and
        // `exchangeCodeForSession` lives in that route and nowhere else. The
        // user clicked "confirm", landed on the home page, and still looked
        // signed out.
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(AFTER_CONFIRM)}`,
      },
    });

    if (signUpError) {
      setError(signUpErrorMessage(signUpError));
      return false;
    }

    // An address that already has a CONFIRMED account comes back here looking
    // like a fresh signup: no session, a FAKE user id, and a decoy
    // `confirmation_sent_at` — GoTrue obfuscates rather than admit the account
    // exists. It sends no mail at all in that case (it logs
    // `user_repeated_signup` and the real row's confirmation_sent_at never
    // moves), so "check your email" is advice that can never come true.
    //
    // The tell is the EMPTY identities array. Verified against production on
    // 2026-09-01: a repeated signup for a confirmed address returned
    // `identities: []`, while every user row in the project has exactly one
    // auth.identities row, so a genuine signup always carries one.
    //
    // Telling the user this does disclose that the address is registered.
    // That is a deliberate trade: the alternative left a real user waiting on
    // a mail that was never sent. Sign-in and reset both remain one click away.
    // `Array.isArray` deliberately, not `?.length ?? 0`: a response that omits
    // identities entirely is an unknown shape, and the safe reading of unknown
    // is "not taken" — that lands on the check-your-email screen, which still
    // carries the sign in / reset line.
    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      // A resend can land here too — the address may have been confirmed since
      // the first attempt — so drop the screen that sent us, or "Use a
      // different email" would fall back to it.
      setSentTo(null);
      setResent(false);
      setTaken(address);
      return false;
    }

    // Confirmation on: no session yet, and the address really is new.
    if (!data.session) {
      setSentTo(address);
      return true;
    }

    // Confirmation off: straight in.
    router.push(AFTER_CONFIRM);
    router.refresh();
    return true;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setTaken(null);
    setPending(true);
    try {
      await submit(email.trim().toLowerCase());
    } catch {
      // getSupabaseBrowser() or signUp() throwing must not strand the button
      // disabled forever.
      setError(signUpErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    if (!sentTo) return;
    setError(null);
    setResent(false);
    setPending(true);
    try {
      // Only on a real send: submit() returns false after a Supabase error,
      // and "Requested again just now." next to that error would be a lie.
      setResent(await submit(sentTo));
    } catch {
      setError(signUpErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (taken !== null) {
    return (
      <div className="space-y-5">
        <Alert tone="info" title="You already have an account.">
          <span className="break-words text-fg">{taken}</span> is already registered, so
          there is no new link to send. Sign in with your password, or reset it
          if it has slipped your mind.
        </Alert>

        <div className="space-y-2.5">
          <ButtonLink href="/login" size="lg" className="w-full">
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/forgot-password"
            variant="secondary"
            size="lg"
            className="w-full"
          >
            Reset your password
          </ButtonLink>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => {
              setTaken(null);
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  if (sentTo !== null) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Check your email.">
          If <span className="break-words text-fg">{sentTo}</span> is new, a confirmation
          link is on its way — open it and you land straight in the Studio.
        </Alert>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {resent ? (
          <p role="status" className="text-caption text-fg-muted">
            Requested again just now.
          </p>
        ) : null}

        <div className="space-y-2.5">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={handleResend}
            loading={pending}
          >
            Resend the link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => {
              setSentTo(null);
              setResent(false);
              setError(null);
            }}
            disabled={pending}
          >
            Use a different email
          </Button>
        </div>

        <p className="text-center text-caption text-fg-muted">
          Only new addresses get a link. Already signed up with this one?{' '}
          <Link
            href="/login"
            className="rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            Sign in
          </Link>{' '}
          or{' '}
          <Link
            href="/forgot-password"
            className="rounded text-fg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            reset your password
          </Link>
          .
        </p>
      </div>
    );
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
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
        />
      </Field>

      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
        disabled={pending}
        hint="8 characters or more. A short phrase beats a clever word."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>

      <p className="text-center text-caption text-fg-muted">
        Already have an account?{' '}
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
