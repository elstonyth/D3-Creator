'use client';

import { AtSignIcon, MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(address: string): Promise<void> {
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
      return;
    }

    // Confirmation on: no session yet. This is ALSO the branch an already
    // registered address takes — Supabase returns a success with no session
    // rather than admitting the account exists. For an address that is already
    // CONFIRMED it sends nothing at all (GoTrue logs `user_repeated_signup`
    // and never stamps confirmation_sent_at), so no link is ever coming and
    // "Resend" cannot change that. The screen below serves both cases without
    // telling them apart, which is why it names the way out: sign in, or reset.
    if (!data.session) {
      setSentTo(address);
      return;
    }

    // Confirmation off: straight in.
    router.push(AFTER_CONFIRM);
    router.refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
      await submit(sentTo);
      setResent(true);
    } catch {
      setError(signUpErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  if (sentTo !== null) {
    return (
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-3 rounded-lg border border-borderGlass bg-glass-subtle p-4">
          <MailCheckIcon
            className="size-5 shrink-0 text-aurora-cta mt-0.5"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-body text-fg">Check your email.</p>
            <p className="text-body-sm text-fgMuted">
              We sent a confirmation link to{' '}
              <span className="text-fg">{sentTo}</span>. Open it and you will
              land straight in the Studio.
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-caption text-danger-fg" role="alert">
            {error}
          </p>
        ) : null}
        {resent ? (
          <p className="text-caption text-fgMuted">Requested again just now.</p>
        ) : null}

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleResend}
            disabled={pending}
          >
            {pending ? 'Sending…' : 'Resend the link'}
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

        <p className="text-caption text-fgMuted text-center">
          Only new addresses get a link. Already signed up with this one?{' '}
          <Link
            href="/login"
            className="text-aurora-cta underline underline-offset-4"
          >
            Sign in
          </Link>{' '}
          or{' '}
          <Link
            href="/forgot-password"
            className="text-aurora-cta underline underline-offset-4"
          >
            reset your password
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-label text-fgMuted">Email</span>
        <div className="relative">
          <AtSignIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fgSubtle pointer-events-none" />
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

      {error && (
        <p className="text-caption text-danger-fg" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-caption text-fgMuted text-center">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-aurora-cta underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
