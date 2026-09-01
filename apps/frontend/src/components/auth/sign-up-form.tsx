'use client';

import { AtSignIcon, MailCheckIcon, UserCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PasswordField } from '@gitroom/frontend/components/auth/password-field';
import { Button } from '@gitroom/frontend/components/ui/button';
import {
  primaryCta,
  secondaryCta,
} from '@gitroom/frontend/components/ui/empty-state';
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
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-3 rounded-lg border border-borderGlass bg-glass-subtle p-4">
          <UserCheckIcon
            className="size-5 shrink-0 text-aurora-cta mt-0.5"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-body text-fg">You already have an account.</p>
            <p className="text-body-sm text-fgMuted">
              <span className="text-fg">{taken}</span> is already registered, so
              there is no new link to send. Sign in with your password, or reset
              it if it has slipped your mind.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {/* h-10 comes from the shared CTA classes; not overridden to h-11
              because two Tailwind height utilities on one element resolve by
              stylesheet order, not by which is written last. */}
          <Link href="/login" className={`${primaryCta} w-full`}>
            Sign in
          </Link>
          <Link href="/forgot-password" className={`${secondaryCta} w-full`}>
            Reset your password
          </Link>
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
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-3 rounded-lg border border-borderGlass bg-glass-subtle p-4">
          <MailCheckIcon
            className="size-5 shrink-0 text-aurora-cta mt-0.5"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-body text-fg">Check your email.</p>
            <p className="text-body-sm text-fgMuted">
              If <span className="text-fg">{sentTo}</span> is new, a
              confirmation link is on its way — open it and you land straight in
              the Studio.
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
