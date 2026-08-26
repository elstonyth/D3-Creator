/**
 * The playbook loader. One row of `public.chat_playbook`, read with the
 * service-role client.
 *
 * WHY THIS IS NOT A FILE READ. The playbook is the client's paid course written
 * out as a prompt, and this repository is PUBLIC — committing it publishes the
 * product for free and git history keeps it published. So the markdown is
 * gitignored, `next.config.js` no longer traces it into the bundle, and the
 * text lives in Postgres behind a table no role but `service_role` can read
 * (supabase/migrations/20260826000000_chat_playbook.sql). Its sibling, the
 * persona, is NOT client IP and still ships in the bundle as a file.
 *
 * Two callers, two shapes, and the difference between them is load-bearing:
 *
 *  - `POST /api/chat` wants a string. It sends the playbook or 503s, and `''`
 *    is already its not-ready path — `loadPlaybook()`.
 *  - `/studio/chat` PRE-FLIGHTS the playbook to decide whether to render the
 *    composer at all, and must tell "the database says there is no playbook"
 *    apart from "we could not ask the database". Collapsing those two into `''`
 *    would make a failed query look exactly like a missing playbook and lock
 *    every user out of a coach that works — `readPlaybook()`.
 *
 * Nothing here decides whether the coach answers; that gate is
 * `isPlaybookReady` in `chat-prompt.ts`, and both callers apply it themselves.
 */

import { getSupabaseAdmin } from '@d3/database';

/**
 * The `chat_playbook.id` of the row the app reads. Declared once, here — the
 * route, the loader and the maintainer's seed statement all mean this string,
 * and a literal spelled twice is a literal that can drift once.
 */
export const PLAYBOOK_ID = 'd3-method';

/**
 * The loaded playbook, kept for the life of the process.
 *
 * WHY CACHING IS SAFE HERE, when caching the persona was rejected. The bytes of
 * this text are stable BY DESIGN: it rides inside the Anthropic prompt-cache
 * prefix on every message from every user, so one changed character re-prices
 * the cache for everybody with no error and no symptom except the bill. A
 * playbook nobody may casually edit is a playbook worth holding in memory.
 *
 * The refresh is a cold start. Serverless gives us one for free on every deploy
 * and, in practice, many times a day besides — so an edited row reaches
 * production without anyone doing anything. The alternative is a database
 * round-trip on the critical path of every chat message, forever, to pick up an
 * edit that happens a few times a year. A briefly stale playbook is a far
 * smaller problem than that.
 *
 * `null` means "not loaded", never "loaded and empty" — see below.
 */
let cached: string | null = null;

/**
 * What one attempt to read the playbook learned.
 *
 * `ok` is NOT "we have a playbook" — it is "the database answered". `ok: true`
 * with blank `content` is a real, successful answer that means "there is no
 * playbook stored", and a coach that genuinely cannot reply. `ok: false` means
 * we never got an answer and therefore know NOTHING about the playbook.
 *
 * Only a caller that must act differently on "no answer" should look at `ok`;
 * `{ ok, ... }` matches the house shape used by `validateReply` and `gate()`.
 */
export type PlaybookRead = { ok: true; content: string } | { ok: false };

/**
 * One read attempt, with the failure kept distinguishable. NEVER THROWS.
 *
 * A FAILURE IS NEVER CACHED. This is the whole reason the cache is a nullable
 * string rather than a plain assignment. The failure that matters is not the
 * network one — it is the row that is simply *missing*, because PostgREST
 * reports that as `{ data: null, error: null }`, a perfectly successful read of
 * nothing. Caching the `''` derived from it would 503 the coach for the entire
 * life of the process, INCLUDING after the maintainer seeds the row, and the
 * only cure would be a redeploy nobody knows to trigger.
 */
export async function readPlaybook(): Promise<PlaybookRead> {
  if (cached !== null) return { ok: true, content: cached };

  try {
    // Inside the try on purpose: getSupabaseAdmin() throws when the Supabase
    // env vars are missing, and that must become a logged '' like every other
    // failure rather than an exception out of a function documented not to.
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('chat_playbook')
      .select('content')
      .eq('id', PLAYBOOK_ID)
      // maybeSingle, not single: a missing row is a state we handle below, not
      // a PostgREST error to log with a stack trace.
      .maybeSingle();
    if (error) throw error;

    const content = typeof data?.content === 'string' ? data.content : '';
    // Blank covers both "no row" and "a row somebody emptied". Whitespace
    // counts as blank because `isPlaybookReady` trims too — caching a value the
    // route will always reject is caching a failure by another name.
    //
    // Still `ok: true`: the database answered, and the answer was "nothing is
    // stored". The pre-flight is RIGHT to mark the coach down on this one.
    if (content.trim() === '') {
      console.error('[chat] playbook read failed', {
        id: PLAYBOOK_ID,
        reason: 'row missing or empty',
      });
      return { ok: true, content: '' };
    }

    // Anything non-blank is cached, the PLAYBOOK_PLACEHOLDER text included.
    // That row read correctly; the callers judge it not-ready, and re-reading
    // it on every message would buy nothing but a round trip.
    cached = content;
    return { ok: true, content };
  } catch (cause) {
    // One greppable line for every way the playbook fails to load — `[chat]
    // playbook read failed` — so one grep answers "is the coach fed?". The text
    // itself is never logged: it is the client's IP, and logs are the one place
    // it must not turn up after all this.
    console.error('[chat] playbook read failed', cause);
    return { ok: false };
  }
}

/**
 * The playbook text, or `''` when there is none to be had — for callers that
 * cannot act on the difference.
 *
 * `POST /api/chat` is the caller. Its structure expects a string and has
 * exactly one not-ready path: `''` fails `isPlaybookReady`, which is already a
 * logged 503. Giving the route a second error path would mean a second way for
 * the coach to be down, and only one of them would be in the runbook.
 *
 * Do NOT reach for this in a pre-flight. It is lossy on purpose, and the loss
 * is precisely the distinction a pre-flight needs — see `readPlaybook`.
 */
export async function loadPlaybook(): Promise<string> {
  const read = await readPlaybook();
  return read.ok ? read.content : '';
}
