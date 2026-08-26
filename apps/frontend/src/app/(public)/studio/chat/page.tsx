/**
 * /studio/chat — the Script Coach. PRD 3 §2, §5.4, §7.1.
 *
 * The Server Component owns the three reads; everything interactive is the
 * island below it. It builds no route handler — both endpoints are C6's.
 *
 * `getSupabaseRoute()` is the only client that carries the session.
 * `getSupabaseRead()` would see `auth.uid() = null` under these policies and
 * return zero rows with NO error, which reads as "this user has no profile"
 * rather than as a bug.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import {
  ChatWorkspace,
  type ChatTurn,
} from '@gitroom/frontend/components/studio/chat/chat-workspace';
import {
  ThreadRail,
  type ThreadRow,
} from '@gitroom/frontend/components/studio/chat/thread-rail';
import { StudioLocked } from '@gitroom/frontend/components/studio/studio-locked';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import { isPlaybookReady } from '@gitroom/frontend/lib/chat-prompt';
import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  THREAD_RAIL_LIMIT,
  THREAD_WINDOW_MESSAGES,
} from '@gitroom/frontend/lib/studio-chat';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Script Coach — D3 Creator',
  robots: { index: false, follow: false },
};

interface ScriptCoachPageProps {
  searchParams: Promise<{ thread?: string }>;
}

export default async function ScriptCoachPage({
  searchParams,
}: ScriptCoachPageProps): Promise<ReactElement> {
  const auth = await getAuthContext();
  if (!auth) redirect('/login?redirectTo=/studio/chat');
  if (!isStudioMember(auth)) return <StudioLocked />;

  const { thread: rawThread } = await searchParams;

  // Pre-flight the playbook. Without this the ONLY way to learn the coach
  // cannot answer is to write a message, wait, and have the composer replaced
  // by the failure block after the fact — a wasted message and, in dev, a red
  // error overlay over the page.
  //
  // FAIL SAFE, and the asymmetry is deliberate: only a file we could READ and
  // that still carries the placeholder marks the coach down. An unreadable
  // file is treated as READY, because `next.config.js` traces
  // `src/content/*.md` for `/api/chat` alone — if this page ever runs where
  // the file is not bundled, guessing "not ready" would lock out a coach that
  // works perfectly. `POST /api/chat` stays the authority either way.
  let coachReady = true;
  try {
    coachReady = isPlaybookReady(
      await readFile(
        join(process.cwd(), 'src', 'content', 'd3-method.md'),
        'utf8',
      ),
    );
  } catch {
    // Unreadable: leave it true and let the send path decide.
  }

  const supabase = await getSupabaseRoute();

  // "No ACTIVE row", not "no row at all" (PRD 2 §10 "More than one business"):
  // the active row is the one the prompt reads, so it is the one whose absence
  // means this coach knows nothing about you.
  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .maybeSingle();
  // Throws to studio/error.tsx. A read failure must never collapse into
  // "No conversations yet" and hide an outage.
  if (profileError) throw profileError;

  const { data: threadRows, error: railError } = await supabase
    .from('chat_thread')
    .select('id, title, updated_at')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false })
    .limit(THREAD_RAIL_LIMIT);
  if (railError) throw railError;
  const threads = (threadRows ?? []) as ThreadRow[];

  // A `?thread=` that is not a uuid never reaches Postgres, and one that is not
  // the caller's renders as a fresh chat — no error, no redirect, no leak.
  // The thread is resolved against the caller's own rows BEFORE any message
  // read: scoping `chat_message` by `thread_id` alone would let any signed-in
  // member read another member's conversation.
  let threadId: string | null = null;
  let initialTurns: ChatTurn[] = [];
  if (isUuid(rawThread)) {
    // Looked up against ALL of the caller's threads, never against the 50-row
    // rail window: a user with more than THREAD_RAIL_LIMIT threads can still
    // open an older one from a bookmark, and matching on the rail would render
    // it as a fresh chat and fork their next message into a new thread.
    const { data: owned, error: ownedError } = await supabase
      .from('chat_thread')
      .select('id')
      .eq('id', rawThread)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (owned !== null) {
      threadId = rawThread;
      const { data: messageRows, error: messageError } = await supabase
        .from('chat_message')
        .select('id, role, content, script')
        .eq('thread_id', threadId)
        // Newest N, then reversed. Ascending-and-limit keeps the OLDEST N and
        // freezes a long thread on its first turns.
        .order('id', { ascending: false })
        .limit(THREAD_WINDOW_MESSAGES);
      if (messageError) throw messageError;
      initialTurns = ((messageRows ?? []) as { id: number | string }[])
        .map((row) => ({ ...row, id: String(row.id) }) as ChatTurn)
        .reverse();
    }
  }

  return (
    <div className="md:grid md:grid-cols-[260px_1fr] md:gap-8">
      <ThreadRail threads={threads} activeThreadId={threadId} />
      {/* No `key` prop: a key remounts the island on the first reply of a new
          conversation and discards the overlay §7.6 says must survive. */}
      <ChatWorkspace
        initialTurns={initialTurns}
        threadId={threadId}
        showProfileForm={profile === null}
        coachReady={coachReady}
      />
    </div>
  );
}
