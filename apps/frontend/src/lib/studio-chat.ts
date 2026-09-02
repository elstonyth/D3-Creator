/**
 * Shared vocabulary for the Script Coach page — PRD 3 §5.9.6.
 *
 * CLIENT-SAFE. It must not import `next/headers` or `lib/supabase-route.ts`:
 * the thread rail, the script card and the chat island all pull from here.
 *
 * `lib/chat-prompt.ts` is the server's half and never enters a client bundle —
 * in particular the `lesson_used` enum stays there, which is why `isValidScript`
 * below checks that field's TYPE and nothing more.
 */

/** PRD 2 §10 "The three windowed reads". Newest 50 threads. */
export const THREAD_RAIL_LIMIT = 50;
/** PRD 2 §10 "The three windowed reads". Newest 200 messages of the open thread. */
export const THREAD_WINDOW_MESSAGES = 200;

/**
 * §0.2's compact-secondary recipe. A plain string, not `<Button size="sm">` —
 * the border token and the muted idle text differ from every `Button` variant.
 * Exported once because §7.3's card buttons and §7.7's Try again live in two
 * different files.
 */
export const compactSecondary =
  'inline-flex items-center justify-center h-8 px-3 rounded-md text-caption ' +
  'text-fg-muted border border-line hover:text-fg hover:bg-white/[0.04] ' +
  'transition-colors duration-150 ease-out ' +
  'disabled:opacity-50 disabled:pointer-events-none';

/* -------------------------------------------------------------------------- */
/* The script payload (§7.3)                                                   */
/* -------------------------------------------------------------------------- */

/** PRD 2 §10A.8's payload. The card renders it; nothing else constructs it. */
export interface ChatScript {
  script_type: string;
  hook: string;
  body: {
    say: string;
    seconds: number;
    show: string;
    on_screen_text: string;
  }[];
  call_to_action: string;
  length_seconds: number;
  lesson_used: string;
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * §7.3's shape check. A type guard: it never rebuilds or strips keys, so the
 * object the card renders is the object that was stored.
 *
 * It is PRD 2 §10A.9 step 4 MINUS the `lesson_used` enum-membership check — the
 * route validated that before the row was stored, and the vocabulary is a
 * server-only constant. `lesson_used` gets the same treatment as
 * `on_screen_text` and for the same reason: a blank caption field must not
 * suppress an entire valid script card.
 */
export function isValidScript(value: unknown): value is ChatScript {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const script = value as Record<string, unknown>;
  if (
    !isFilled(script.script_type) ||
    !isFilled(script.hook) ||
    !isFilled(script.call_to_action) ||
    !isPositiveInt(script.length_seconds) ||
    typeof script.lesson_used !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(script.body) || script.body.length < 1) return false;
  return script.body.every((rawBeat) => {
    if (
      typeof rawBeat !== 'object' ||
      rawBeat === null ||
      Array.isArray(rawBeat)
    ) {
      return false;
    }
    const beat = rawBeat as Record<string, unknown>;
    return (
      isFilled(beat.say) &&
      isFilled(beat.show) &&
      typeof beat.on_screen_text === 'string' &&
      isPositiveInt(beat.seconds)
    );
  });
}

/**
 * §7.3's fixed clipboard block, so two builders cannot produce two.
 *
 * Note the two spaces before `(<n>s)`, the three-space indent on the two
 * sub-lines, and the ASCII hyphen in `Hook (0-3s):` — the on-screen card label
 * uses an en dash and the two are deliberately different. Every beat emits all
 * three lines, `On screen:` included, even when `on_screen_text` is `''`
 * (unlike the card, which omits it). There is no trailing newline.
 */
export function scriptToClipboard(script: ChatScript): string {
  const beats = script.body
    .map(
      (beat, index) =>
        `${index + 1}. ${beat.say}  (${beat.seconds}s)\n` +
        `   Show: ${beat.show}\n` +
        `   On screen: ${beat.on_screen_text}`,
    )
    .join('\n');

  return [
    `Script type: ${script.script_type}`,
    `Hook (0-3s): ${script.hook}`,
    '',
    'Body:',
    beats,
    '',
    `Call to action: ${script.call_to_action}`,
    `Length: ${script.length_seconds}s`,
    `Based on ${script.lesson_used}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* The rail's relative date (§7.1)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Computed in the BROWSER, never on the server: Vercel runs UTC and the
 * audience is UTC+08, so a server-rendered "Today" flips to "Yesterday" for
 * every evening thread. An unparseable timestamp renders `''`, never
 * `Invalid Date`.
 *
 * This is NOT `formatJobDate` (§6.4) — different page, different rules, no
 * sharing.
 */
export function relativeThreadDate(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000),
  );

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* -------------------------------------------------------------------------- */
/* Send failures (§7.7)                                                        */
/* -------------------------------------------------------------------------- */

/** Replaces the composer for the life of the page render. */
export const COACH_NOT_READY_COPY =
  'The coach is not ready yet. Try again later.';
/** The client's own 120s deadline, and the route's 504, share this sentence. */
export const TIMEOUT_COPY = 'That took too long. Try sending that again.';
/** An unlisted status, a failed envelope check, or any other thrown rejection. */
export const GENERIC_SEND_FAILURE_COPY =
  'Something went wrong on our side. Try sending that again.';

const STATUS_COPY: Record<number, string> = {
  400: 'That message could not be sent. Try rewording it.',
  401: 'Your session expired. Sign in again to keep going.',
  403: 'Your account does not have Studio access.',
  404: 'That conversation is gone. Start a new one.',
  429: 'That was quick — wait a few seconds and try again.',
  503: COACH_NOT_READY_COPY,
  504: TIMEOUT_COPY,
};

/**
 * Send failures are keyed on the HTTP STATUS, with the single exception PRD 2
 * §10A.9 names: `502` carries two sentences and the `error` value is what picks
 * between them. On every other status the client ignores the `error` string,
 * and it never renders the status itself.
 */
export function sendFailureCopy(status: number, error: unknown): string {
  if (status === 502) {
    return error === 'model reply truncated'
      ? 'The reply was cut off — try asking for something shorter.'
      : 'The coach could not answer — try again.';
  }
  return STATUS_COPY[status] ?? GENERIC_SEND_FAILURE_COPY;
}
