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
import { readPlaybook } from '@gitroom/frontend/lib/chat-playbook';
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
  // FAIL SAFE, and the asymmetry is deliberate: only a playbook we could
  // actually READ marks the coach down. When the read itself fails we know
  // nothing about the playbook, so we guess READY — `POST /api/chat` stays the
  // authority either way, and guessing "not ready" would lock every user out of
  // a coach that works perfectly.
  //
  // `readPlaybook()`, NOT `loadPlaybook()`, and that is the whole point. The
  // playbook now lives in Postgres (`lib/chat-playbook.ts`), not in the bundle,
  // and the loader collapses both outcomes to `''` — which `isPlaybookReady`
  // reads as NOT ready. Swapping it in here would invert the asymmetry above
  // and take the page down on a blip. `ok: false` means the database never
  // answered; `ok: true` with blank content means it answered "there is no
  // playbook", which IS a coach that cannot reply.
  const playbook = await readPlaybook();
  const coachReady = playbook.ok ? isPlaybookReady(playbook.content) : true;

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
