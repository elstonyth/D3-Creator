'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtSignIcon } from 'lucide-react';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const supabase = getSupabaseBrowser();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signUpError) {
      setError('Could not create account. Check your details and try again.');
      setPending(false);
      return;
    }
    // If email confirmation is required, there's no active session yet.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setPending(false);
      return;
    }
    // Trigger assigned role='member'; middleware routes members to /classes.
    router.push('/classes');
    router.refresh();
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
            className="pl-9"
          />
        </div>
      </label>
      <label className="block space-y-1.5">
        <span className="text-label text-fgMuted">Password</span>
        <Input
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="text-caption text-danger-fg" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-caption text-aurora-cta" role="status">
          {notice}
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
