# `src/content/` — the persona the Script Coach sends to the model

The Script Coach sends the model two texts **verbatim, on every chat message**,
inside the cached prefix (PRD 2 §10A.4). Only **one of them lives here**. This
file is where every note to a human goes, because a note inside the persona is
still tokens the model reads.

## Where each text lives, and why

| Text                 | Where it lives                                        | In this repo? |
| -------------------- | ----------------------------------------------------- | ------------- |
| `chatbot-persona.md` | This directory, shipped in the serverless bundle      | **Yes**       |
| The playbook         | `public.chat_playbook` in Supabase, row `'d3-method'` | **No**        |

**The playbook is not in this repository and must never be added to it.** It is
the client's paid course — the named lessons, the named frameworks, the four
script formulas — condensed into a prompt. **This GitHub repository is public.**
Committing that text publishes the product for free, to anyone who clones the
repo, permanently: git history means a later delete does not take it back.

So:

- `apps/frontend/src/content/d3-method.md` is in `.gitignore`. A copy on your
  disk is a **local working copy only**. It is not what production reads, and
  nothing you do to it reaches users.
- Production reads `public.chat_playbook`, service-role only, via
  `src/lib/chat-playbook.ts`
  (migration `supabase/migrations/20260826000000_chat_playbook.sql`).
- **To change the playbook in production you update the database row.** Not a
  file, not a deploy, not a pull request. `updated_at` moves on its own.
- The table has no policies and no grant to `anon` or `authenticated`, on
  purpose. Anyone can sign up for this site, so a read grant to signed-in users
  would hand the course to any visitor with an email address straight out of
  PostgREST — the same leak as committing the file, behind one free signup.

`chatbot-persona.md` stays a bundled file because it is **ours**, not the
client's: brand voice (PRD 2 §8) and the six guardrails (§9), as prose the model
reads. `next.config.js` names it explicitly in `outputFileTracingIncludes` —
the pattern used to be `./src/content/*.md`, and a glob would silently re-bundle
the playbook the moment a developer's working copy sat in this directory.
Without that entry the persona is absent in production, every chat returns 503,
and local dev works perfectly. Do not remove it, and do not move this directory.

## Rules for editing the persona — and the playbook row

Both texts ride inside the cached prefix, so both rules below apply to the
database row exactly as they apply to the file.

- **Nothing that changes may go inside either text.** No date, no version stamp,
  no build id, no HTML comments. One changing character invalidates the prompt
  cache for every user on every message, silently, and the only symptom is the
  bill. This is also why `loadPlaybook()` may hold the row in memory for the
  life of the process: the bytes are stable by design, and a cold start is the
  refresh.
- **Never put per-user text in `chatbot-persona.md`.** The user's business
  profile is a separate chat message that rides _below_ the cache marker
  (§10A.4). Anything user-specific above that marker breaks caching for
  everybody.
- Two strings in `chatbot-persona.md` are byte-exact contracts with the prompt
  builder: `NO PROFILE ON FILE` and `Appears on camera: No` (§10A.6). They are
  exported constants in `src/lib/chat-prompt.ts` and a test in
  `src/lib/chat-prompt.test.ts` fails if either side drifts. Do not reword them.
- `chatbot-persona.md` covers the five voice rules and the six guardrails and
  **nothing else**. In particular it names no JSON, no `message`/`script`
  envelope and no output format — the request's `response_format` (§10A.8) is
  what makes the model emit the shape, and a prose copy is a second, drifting
  spec inside the cached prefix.

  **This is not a style rule. It is measured.** A first draft of the
  `Reply language:` paragraph described the reply's parts in prose — "your
  explanation", "the hook, every spoken line and the call to action". It named
  no JSON and no field, and it still made `anthropic/claude-opus-5` abandon
  `response_format` and answer in Markdown: **4 of 4 calls failed, against 4 of
  4 passing on the same question with that paragraph removed.** Rewritten as a
  pure language rule that describes no output part, it went 6 of 6. Any new
  paragraph here that talks about what the answer contains needs the same A/B
  before it ships — the failure is total, silent in every test, and shows up
  only as `502 model reply unusable`.

## What the playbook row has to contain

`POST /api/chat` refuses every message — HTTP 503, logged as
`[chat] playbook not ready` — unless the stored text is non-blank **and** its
first line is not `PLAYBOOK_PLACEHOLDER`. That gate is `isPlaybookReady()` in
`src/lib/chat-prompt.ts` and it did not change when the text moved to the
database. A row that fails to load at all logs `[chat] playbook read failed`
first, from the loader, and then the 503 line — grep for either.

`/studio/chat` pre-flights the same row so the page can show the not-ready
state before a user spends a message on it. That call site uses `readPlaybook()`
rather than `loadPlaybook()`, and the difference is deliberate: the page must
tell "the database says there is no playbook" (mark the coach down) apart from
"the database did not answer" (assume READY and let the send path decide).
`loadPlaybook()` flattens both to `''`, so using it there would take the page
down on a blip. Do not swap them.

The text is written from the five lesson transcripts and holds the eight
sections PRD 2 §4 pins, in that order, with no H1. Every claim traces to
something a lesson actually says; where a lesson is silent the chatbot is
expected to say so (§9) rather than improvise, so do not fill gaps.

Two things to keep true when editing it:

- The four formula sections each keep all five §5 headings.
- The lesson names it cites are the `LESSON_USED` values in
  `src/lib/chat-prompt.ts`, which is a **strict enum** in the response schema.
  Day 4 is one lesson covering four topics, so its name is the whole string
  `口播表现力+视频置景+素材库+晒过程脚本` — citing `晒过程脚本` alone points the
  model at a lesson name it is not allowed to emit.

Note that `src/lib/chat-prompt.test.ts` still asserts these properties by
reading a local `d3-method.md` off disk, so that suite **fails wherever the
gitignored working copy is absent** — a fresh clone and CI included. Those
assertions now check your local copy, not what production serves.

## The model must honour `response_format`

`CHAT_MODEL` has to be a model that actually obeys the JSON schema, not merely
one that advertises it. A model that ignores it returns prose, every reply
fails the route's envelope check, and the user sees a generic failure with
nothing useful in the logs. `anthropic/claude-sonnet-5` was measured doing
exactly that, with `provider.require_parameters` already set. Verify any
replacement with a real request before pointing `CHAT_MODEL` at it.
