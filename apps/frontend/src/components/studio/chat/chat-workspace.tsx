'use client';

/**
 * The Script Coach island — PRD 3 §7.2, §7.5, §7.6, §7.7.
 *
 * It builds no route handler. `POST /api/chat` is C6's and owns every status
 * code, the rate limit and the reply envelope.
 *
 * The island is rendered with NO `key` prop. A `key={threadId}` remounts it on
 * the first reply of a new conversation and discards exactly the state §7.6
 * says must survive.
 */

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { ProfileForm } from '@gitroom/frontend/components/studio/chat/profile-form';
import { ScriptCard } from '@gitroom/frontend/components/studio/chat/script-card';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import {
  COACH_NOT_READY_COPY,
  GENERIC_SEND_FAILURE_COPY,
  TIMEOUT_COPY,
  compactSecondary,
  isValidScript,
  sendFailureCopy,
} from '@gitroom/frontend/lib/studio-chat';

/** §7.6. The client's own deadline, separate from the route's 45s model one. */
const CLIENT_DEADLINE_MS = 120_000;
/** How long the dots pulse alone before the "still working" line joins them. */
const SLOW_REPLY_AT_MS = 10_000;
/** 15px / line-height 1.6 = 24px per line, six lines, plus 12px top and bottom. */
const TEXTAREA_MAX_PX = 168;
const MESSAGE_MAX_CHARS = 4000;
/** Fraction of the cap past which the character count is shown. */
const COUNTER_AT = 0.8;

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  script: unknown;
}

interface ChatWorkspaceProps {
  /** The Server Component's rows. NEVER copied into state. */
  initialTurns: ChatTurn[];
  /** Already validated with `isUuid` and confirmed to be the caller's. */
  threadId: string | null;
  /** True when the caller has no ACTIVE `user_profile` row. */
  showProfileForm: boolean;
  /**
   * False when the server could read the stored playbook and it is missing or
   * still carries the placeholder — i.e. `POST /api/chat` is going to 503
   * whatever we send. A read that FAILS leaves this true on purpose; the server
   * comment in `app/(public)/studio/chat/page.tsx` owns that asymmetry. Seeds
   * `coachDown`, so the not-ready state is shown BEFORE a message is spent
   * rather than after one comes back 503.
   */
  coachReady: boolean;
}

/** §7.5's four tiles. The last one fills the composer and does not send. */
const STARTERS = [
  { copy: 'Give me 5 video ideas for my business', fillsOnly: false },
  { copy: 'Write me a script for this week', fillsOnly: false },
  { copy: 'My videos get no views. What am I doing wrong?', fillsOnly: false },
  { copy: 'Rewrite this hook:', fillsOnly: true },
] as const;

/** §7.7's one shape for every inline SEND failure. This palette has no red, so
 *  a failure is an icon plus a sentence, never a colour change — `Alert` is the
 *  primitive that owns that pairing. */
function FailureBlock({
  copy,
  onRetry,
}: {
  copy: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <Alert tone="danger" title="That message did not send">
      <p>{copy}</p>
      {onRetry !== undefined && (
        <button
          type="button"
          className={`${compactSecondary} min-h-10 sm:min-h-8 mt-2`}
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </Alert>
  );
}

export function ChatWorkspace({
  initialTurns,
  threadId,
  showProfileForm,
  coachReady,
}: ChatWorkspaceProps): ReactElement {
  const router = useRouter();

  const [localTurns, setLocalTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  // Seeded, not synced: a 503 from the send path still latches this true, and
  // the island deliberately never remounts, so the server's answer is only
  // consulted on a fresh navigation.
  const [coachDown, setCoachDown] = useState(!coachReady);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  // Flips ~10s into a send. A non-streaming reply can take most of the route's
  // 45s model deadline; without this the animated dots read as "hung".
  const [slowReply, setSlowReply] = useState(false);

  const threadRef = useRef<string | null>(threadId);
  const lastServerIdRef = useRef<string | undefined>(undefined);
  const sendingRef = useRef(false);
  const lastSentRef = useRef('');
  const composingRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const lastServerId =
    initialTurns.length > 0
      ? initialTurns[initialTurns.length - 1].id
      : undefined;

  // A `router.refresh()` that has caught up swaps the pair in as server rows
  // and empties the overlay in the SAME render; one that has not caught up
  // leaves the overlay standing. A thread switch needs no separate rule — its
  // rows have a different last id, so this same comparison clears the overlay.
  if (localTurns.length > 0 && lastServerId !== lastServerIdRef.current) {
    setLocalTurns([]);
  }

  const turns = [...initialTurns, ...localTurns];
  const sendBlocked = pending || coachDown;

  // Smooth for everyone except reduced-motion users, who get the instant jump.
  // Checked per call: the CSS `scroll-behavior` override cannot reach a JS
  // `scrollTo` options object, so the media query is the only lever.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const instant = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: instant ? 'auto' : 'smooth',
    });
  }, [turns.length, pending]);

  // The reassurance line's clock. Reset lives in send(); this only arms the
  // one-shot while a reply is outstanding.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlowReply(true), SLOW_REPLY_AT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // Focus moves to the textarea when a thread is PICKED FROM THE RAIL — the
  // island never remounts, so a change of `threadId` is that event. The first
  // run is skipped: a fresh page load is not a pick, and stealing focus on
  // load drops a screen-reader user into the middle of the page. The send
  // path has its own return-focus in `finally`. `preventScroll` on both, so
  // focus never jumps the scrollport on mobile.
  const firstFocusRunRef = useRef(true);
  useEffect(() => {
    if (firstFocusRunRef.current) {
      firstFocusRunRef.current = false;
      return;
    }
    textareaRef.current?.focus({ preventScroll: true });
  }, [threadId]);

  async function send(text: string, appendUser: boolean): Promise<void> {
    // Two clicks in one frame both read the old `pending`, so the ref is the
    // real guard and `disabled` is only the affordance.
    if (sendingRef.current) return;
    sendingRef.current = true;
    lastSentRef.current = text;
    setPending(true);
    // Reset HERE, not in the timer effect — a synchronous setState in an
    // effect body is a lint error (`react-hooks/set-state-in-effect`).
    setSlowReply(false);
    setFailure(null);
    setLive('Waiting for the coach.');

    if (appendUser) {
      lastServerIdRef.current = lastServerId;
      setLocalTurns((prev) => [
        ...prev,
        // Never Date.now()-based: two turns inside the same millisecond
        // collide on the React key.
        { id: crypto.randomUUID(), role: 'user', content: text, script: null },
      ]);
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadRef.current, message: text }),
        signal: AbortSignal.timeout(CLIENT_DEADLINE_MS),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        // Never render the status, the error string or an upstream body.
        console.error('[studio/chat] send failed', res.status);
        if (res.status === 503) setCoachDown(true);
        if (res.status === 404) {
          threadRef.current = null;
          window.history.replaceState(null, '', '/studio/chat');
        }
        setFailure(sendFailureCopy(res.status, body?.error));
        setLive('');
        return;
      }

      const data = (await res.json()) as {
        ok?: unknown;
        threadId?: unknown;
        reply?: { message?: unknown; script?: unknown };
      };
      const envelopeOk =
        data?.ok === true &&
        typeof data.threadId === 'string' &&
        typeof data.reply?.message === 'string' &&
        data.reply.message.length > 0;
      if (!envelopeOk) {
        console.error('[studio/chat] 200 failed the envelope check');
        setFailure(GENERIC_SEND_FAILURE_COPY);
        setLive('');
        return;
      }

      const newThreadId = data.threadId as string;
      const adopting = threadRef.current !== newThreadId;
      // Adopt into the island's own ref FIRST: that is what makes the refresh
      // optional. `reply.script` is passed through untouched and validated
      // separately — a script that fails validation must not blank the prose.
      threadRef.current = newThreadId;
      lastServerIdRef.current = lastServerId;
      setLocalTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply?.message as string,
          script: data.reply?.script ?? null,
        },
      ]);
      if (adopting) {
        // Replace, never push: a navigation remounts the column and can blank
        // the reply the user just waited for.
        window.history.replaceState(
          null,
          '',
          `/studio/chat?thread=${newThreadId}`,
        );
      }
      setLive('The coach replied.');
      // Also on a send into an existing thread, or the rail's `updated_at desc`
      // ordering goes stale until a full navigation.
      router.refresh();
    } catch (cause) {
      // Only a real timeout gets the slow-network sentence. Offline, DNS, TLS
      // and CORS take the catch-all, so an offline user is never told their
      // request was slow.
      const name = cause instanceof Error ? cause.name : '';
      console.error('[studio/chat] send threw', name);
      setFailure(
        name === 'TimeoutError' || name === 'AbortError'
          ? TIMEOUT_COPY
          : GENERIC_SEND_FAILURE_COPY,
      );
      setLive('');
    } finally {
      setPending(false);
      sendingRef.current = false;
      textareaRef.current?.focus({ preventScroll: true });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (sendBlocked) return;
    const text = draft.trim();
    if (text === '') return;
    // The draft is cleared HERE and nowhere else, so a starter tile, Shorten or
    // More hooks never eats a half-typed message.
    setDraft('');
    const el = textareaRef.current;
    if (el !== null) el.style.height = 'auto';
    void send(text, true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // Chinese is an explicit target language, so an IME commit must not send.
    if (composingRef.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  function onStarter(copy: string, fillsOnly: boolean): void {
    if (!fillsOnly) {
      void send(copy, true);
      return;
    }
    // The one control that deliberately writes the draft.
    setDraft(copy);
    const el = textareaRef.current;
    if (el !== null) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(copy.length, copy.length);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-120px)] md:h-[calc(100dvh-56px)]">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto py-6 md:py-8"
      >
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          {/* Scrolls away with the thread on purpose: it is an introduction,
              not chrome, and a pinned title costs a phone 60px of message list
              on every turn. */}
          <header className="flex flex-col gap-2">
            <h1 className="text-section text-fg">Script coach.</h1>
            <p className="text-body-lg text-fg-muted">
              Ideas, hooks and full scripts, built on the D3 method and on what
              you have told it about your business.
            </p>
          </header>

          {/* Mounted for the life of the page — a region unmounted the moment
              the reply lands never announces it. It carries a NOTIFICATION,
              never the reply text. */}
          <p aria-live="polite" className="sr-only">
            {live}
          </p>

          {showProfileForm && <ProfileForm />}

          {turns.length === 0 && (
            <section
              aria-labelledby="chat-starters"
              className="flex flex-col gap-3"
            >
              <h2
                id="chat-starters"
                className="text-micro uppercase text-fg-subtle"
              >
                Start with
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.copy}
                    type="button"
                    disabled={sendBlocked}
                    onClick={() => onStarter(starter.copy, starter.fillsOnly)}
                    className="min-h-[52px] text-left bg-surface-subtle border border-line rounded-2xl px-4 py-3 text-body text-fg-muted hover:text-fg hover:border-line-strong hover:bg-white/[0.03] transition-colors duration-150 ease-out disabled:opacity-45 disabled:pointer-events-none"
                  >
                    {starter.copy}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Rendered only when there is at least one turn: an always-rendered
              empty flex column is still a flex item and buys a stray 24px gap
              under the starter tiles. */}
          {turns.length > 0 && (
            <div className="flex flex-col gap-6">
              {turns.map((turn) =>
                turn.role === 'user' ? (
                  <div
                    key={turn.id}
                    className="animate-riseIn flex justify-end"
                  >
                    <div className="max-w-[85%] rounded-2xl border border-line-subtle bg-surface-elevated px-4 py-3 text-body text-fg whitespace-pre-wrap break-words">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <div
                    key={turn.id}
                    className="animate-riseIn flex flex-col gap-2"
                  >
                    {/* Without a bubble there is no other speaker cue, which is
                        why the label is required. */}
                    <p className="text-caption text-fg-subtle">Script coach</p>
                    <p className="text-body text-fg whitespace-pre-wrap break-words">
                      {turn.content}
                    </p>
                    {turn.script !== null &&
                      turn.script !== undefined &&
                      (isValidScript(turn.script) ? (
                        <ScriptCard
                          script={turn.script}
                          onFollowUp={(message) => void send(message, true)}
                          sendBlocked={sendBlocked}
                        />
                      ) : (
                        // Never a thrown error that blanks the whole thread.
                        <p className="text-body-sm text-fg-muted">
                          This script could not be displayed.
                        </p>
                      ))}
                  </div>
                ),
              )}
            </div>
          )}

          {/* Loading-STATE feedback, which is what §8's decorative-loop ban is
              not about: the reply is non-streaming, so this indicator is the
              only sign the coach is alive for up to ~45s. It sits where the
              reply will land, labeled like an assistant turn. Under
              prefers-reduced-motion the global rule freezes the dots to a
              single iteration; the sr-only live region already announces the
              wait in words. */}
          {pending && (
            <div className="animate-riseIn flex flex-col gap-2">
              <p className="text-caption text-fg-subtle">Script coach</p>
              <div aria-hidden className="flex items-center gap-1.5 h-6">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 rounded-full bg-fg-muted animate-pulseDot"
                    style={{ animationDelay: `${dot * 200}ms` }}
                  />
                ))}
              </div>
              {slowReply && (
                <p className="animate-riseIn text-body-sm text-fg-subtle">
                  Still working — full scripts can take up to a minute.
                </p>
              )}
            </div>
          )}

          {failure !== null && !coachDown && (
            <FailureBlock
              copy={failure}
              onRetry={() => void send(lastSentRef.current, false)}
            />
          )}
        </div>
      </div>

      {coachDown ? (
        // Replaces the composer for the life of this page render, inside the
        // composer's own block so the column geometry does not shift. No Try
        // again, and no yellow control anywhere on this render.
        //
        // tone="info", NOT "danger": `POST /api/chat` answers 503 by design
        // until the playbook row exists. Nothing the reader did is wrong and
        // nothing they typed was lost, so this reads as a notice, not a fault.
        <div className="shrink-0 border-t border-line py-4">
          <div className="max-w-[720px] mx-auto">
            <Alert tone="info" title="The coach is offline">
              <p>{COACH_NOT_READY_COPY}</p>
              <p className="mt-1 text-fg-subtle">
                Nothing is wrong with your account, and your past conversations
                are still here. The Video Analyzer is unaffected.
              </p>
            </Alert>
          </div>
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="shrink-0 border-t border-line py-4"
        >
          <div className="max-w-[720px] mx-auto flex flex-col gap-1.5">
            <div className="flex items-end gap-3">
              <label htmlFor="script-coach-composer" className="sr-only">
                Message the script coach
              </label>
              <textarea
                id="script-coach-composer"
                ref={textareaRef}
                rows={1}
                maxLength={MESSAGE_MAX_CHARS}
                value={draft}
                placeholder="Ask for ideas, a hook, or a full script"
                onChange={(event) => {
                  setDraft(event.target.value);
                  // Set directly and never transitioned.
                  const el = event.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
                }}
                onKeyDown={onKeyDown}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                className="flex-1 min-h-10 max-h-[168px] resize-none overflow-y-auto rounded-lg bg-surface-subtle border border-line px-3 py-2.5 text-body text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong focus:outline-none focus:border-brand focus:shadow-focus"
              />
              {/* Empty is a no-op in `onSubmit` already; disabling is the
                  affordance for it, so Send stops looking armed over a blank
                  composer. */}
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={pending || draft.trim() === ''}
              >
                Send
              </Button>
            </div>

            {/* Both children collapse to nothing when they do not apply, so
                this row costs one 6px gap and no reserved height. */}
            <div className="flex items-baseline justify-between gap-3">
              {/* Desktop only: "Shift + Enter" means nothing on a soft
                  keyboard, and Enter is the only key a phone shows. */}
              <p className="hidden md:block text-caption text-fg-subtle">
                Enter to send · Shift + Enter for a new line
              </p>
              {/* Same rule as the Settings form: the count appears in the last
                  20% of the cap, because `maxLength` otherwise stops the
                  keystroke in silence. */}
              {draft.length > MESSAGE_MAX_CHARS * COUNTER_AT ? (
                <span
                  className={`ml-auto text-caption tnum ${
                    draft.length >= MESSAGE_MAX_CHARS
                      ? 'text-fg'
                      : 'text-fg-subtle'
                  }`}
                >
                  {draft.length}/{MESSAGE_MAX_CHARS}
                </span>
              ) : null}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
