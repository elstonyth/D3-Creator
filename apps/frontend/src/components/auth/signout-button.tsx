'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/frontend/components/ui/button';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

/**
 * Renders inside the site header and both signed-in layouts, so it stays a
 * single inline control: a small ghost button plus, on failure, one line of
 * text beside it. No Alert here — a bordered box would break the header row.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error: signOutErr } = await supabase.auth.signOut();
    if (signOutErr) {
      // Surface the failure inline and bail out — redirecting would mask
      // a still-active session and confuse the user about their auth state.
      setError(signOutErr.message);
      setPending(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handle} loading={pending}>
        Sign out
      </Button>
      {error ? (
        <span
          role="alert"
          className="inline-flex max-w-[220px] items-center gap-1.5 truncate text-caption text-fg-muted"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="h-3.5 w-3.5 shrink-0"
          >
            <path d="M8 2.4 14.4 13.4H1.6z" strokeLinejoin="round" />
            <path d="M8 6.6v3.1M8 11.7v.4" strokeLinecap="round" />
          </svg>
          Still signed in — {error}
        </span>
      ) : null}
    </div>
  );
}
