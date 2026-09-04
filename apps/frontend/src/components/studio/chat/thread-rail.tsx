'use client';

/**
 * The left rail — PRD 3 §7.1, which owns this file's geometry, landmarks and
 * copy.
 *
 * It is a client island for two reasons: the mobile disclosure, and the
 * relative date, which must be computed in the BROWSER (Vercel runs UTC and the
 * audience is UTC+08, so a server-rendered "Today" flips to "Yesterday" for
 * every evening thread). That `new Date()` in the component body is a knowing
 * exception to the no-clock-reads rule and is why every row carries
 * `suppressHydrationWarning`.
 */

import { ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import { relativeThreadDate } from '@gitroom/frontend/lib/studio-chat';

export interface ThreadRow {
  id: string;
  title: string;
  updated_at: string;
}

interface ThreadRailProps {
  threads: ThreadRow[];
  activeThreadId: string | null;
}

export function ThreadRail({
  threads,
  activeThreadId,
}: ThreadRailProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const now = new Date();

  return (
    // The 260px comes from the grid track; do NOT also write w-[260px] here.
    // At md and up this is its own full-height column that does not scroll with
    // the page — at 50 rows the rail is 2000px tall.
    <aside
      aria-label="Conversations"
      className="md:sticky md:top-14 md:h-[calc(100dvh-56px)] md:flex md:flex-col md:min-h-0 md:py-8 md:border-r md:border-line-subtle md:pr-6"
    >
      {/* h-16 (64px) is load-bearing, not a taste call: the workspace's mobile
          height is `100dvh - 120px`, which is the 56px site header plus exactly
          this row. Change one and you change both. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="studio-thread-list"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="md:hidden h-16 w-full flex items-center justify-between gap-3 border-b border-line-subtle text-label text-fg-muted hover:text-fg transition-colors duration-150 ease-out"
      >
        <span>Conversations</span>
        <span className="flex items-center gap-2">
          <span className="tnum text-caption text-fg-subtle">
            {threads.length}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-150 ease-out ${
              open ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {/* ONE wrapper holds both "New chat" and the nav: `aria-controls` must
          name the region that toggles, so the id never sits on the nav alone. */}
      <div
        id="studio-thread-list"
        className={`${open ? 'flex' : 'hidden'} md:flex flex-col gap-3 min-h-0 py-4 md:py-0`}
      >
        {/* Not a <Link>: button.tsx has no `asChild`, so an anchor cannot wear
            this variant. Only the thread rows below need to be links. */}
        <Button
          variant="secondary"
          size="md"
          className="w-full justify-center shrink-0"
          onClick={() => router.push('/studio/chat')}
        >
          New chat
        </Button>

        {threads.length === 0 ? (
          <p className="px-3 py-2 text-caption text-fg-subtle">
            Nothing here yet. Your first message starts a conversation, and it
            is saved automatically.
          </p>
        ) : (
          <nav
            aria-label="Past conversations"
            className="flex flex-col gap-0.5 min-h-0 max-h-[40dvh] overflow-y-auto md:max-h-none md:overflow-y-auto"
          >
            {threads.map((thread) => {
              const isOpen = thread.id === activeThreadId;
              return (
                <Link
                  key={thread.id}
                  href={`/studio/chat?thread=${thread.id}`}
                  aria-current={isOpen ? 'page' : undefined}
                  // The row already inherits text-label, which is weight 500 —
                  // the open row changes colour, never weight. The 2px stripe
                  // is the active-nav indicator from the yellow ledger, so the
                  // state does not rest on colour alone.
                  className={`relative h-10 shrink-0 rounded-lg pl-4 pr-3 flex items-center justify-between gap-2 text-label transition-colors duration-150 ease-out ${
                    isOpen
                      ? 'text-fg bg-white/[0.05]'
                      : 'text-fg-muted hover:text-fg hover:bg-white/[0.03]'
                  }`}
                >
                  {isOpen && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand"
                    />
                  )}
                  <span className="truncate">{thread.title}</span>
                  {/* Two threads called "Video ideas" are otherwise
                      indistinguishable — the date is not optional. The
                      hydration mismatch is expected by design. */}
                  <time
                    dateTime={thread.updated_at}
                    suppressHydrationWarning
                    className="text-caption text-fg-subtle shrink-0"
                  >
                    {relativeThreadDate(thread.updated_at, now)}
                  </time>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
}
