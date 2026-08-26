'use client';

/**
 * The left rail — PRD 3 §7.1, which owns this file's geometry, landmarks and
 * copy.
 *
 * It is a client island for two reasons: the mobile disclosure, and the
 * relative date, which must be computed in the BROWSER (Vercel runs UTC and the
 * audience is UTC+08, so a server-rendered "Today" flips to "Yesterday" for
 * every evening thread).
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
      className="md:sticky md:top-14 md:h-[calc(100dvh-56px)] md:flex md:flex-col md:min-h-0 md:py-8"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="studio-thread-list"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="md:hidden h-16 w-full flex items-center justify-between text-label text-fgMuted hover:text-fg transition-colors duration-150 ease-out"
      >
        Chats ({threads.length})
        <ChevronDownIcon
          aria-hidden
          className={`h-3 w-3 transition-transform duration-150 ease-out ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* ONE wrapper holds both "New chat" and the nav: `aria-controls` must
          name the region that toggles, so the id never sits on the nav alone. */}
      <div
        id="studio-thread-list"
        className={`${open ? 'flex' : 'hidden'} md:flex flex-col gap-3 min-h-0 pb-6 md:pb-0`}
      >
        {/* Not a <Link>: button.tsx has no `asChild`, so an anchor cannot wear
            this variant. Only the thread rows below need to be links. */}
        <Button
          variant="outline"
          size="md"
          className="w-full justify-center shrink-0"
          onClick={() => router.push('/studio/chat')}
        >
          New chat
        </Button>

        {threads.length === 0 ? (
          <p className="text-caption text-fgSubtle px-3 py-2">
            No conversations yet.
          </p>
        ) : (
          <nav
            aria-label="Past conversations"
            className="flex flex-col gap-1 min-h-0 max-h-[40dvh] overflow-y-auto md:max-h-none md:overflow-y-auto"
          >
            {threads.map((thread) => {
              const isOpen = thread.id === activeThreadId;
              return (
                <Link
                  key={thread.id}
                  href={`/studio/chat?thread=${thread.id}`}
                  aria-current={isOpen ? 'page' : undefined}
                  // The row already inherits text-label, which is weight 500 —
                  // the open row changes colour, never weight.
                  className={`h-10 shrink-0 rounded-lg px-3 flex items-center justify-between gap-2 text-label transition-colors duration-150 ease-out ${
                    isOpen
                      ? 'text-aurora-cta'
                      : 'text-fgMuted hover:text-fg hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate">{thread.title}</span>
                  {/* Two threads called "Video ideas" are otherwise
                      indistinguishable — the date is not optional. The
                      hydration mismatch is expected by design. */}
                  <time
                    dateTime={thread.updated_at}
                    suppressHydrationWarning
                    className="text-caption text-fgSubtle shrink-0"
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
