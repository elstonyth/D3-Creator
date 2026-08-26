# `src/content/` — the two files the Script Coach sends to the model

Both `.md` files in this directory are sent to the model **verbatim, on every
chat message**, inside the cached prefix (PRD 2 §10A.4). This file is where
every note to a human goes, because a note inside either of them is still
tokens the model reads.

## The two files

| File                 | What it is                                                                   |
| -------------------- | ---------------------------------------------------------------------------- |
| `chatbot-persona.md` | Brand voice (PRD 2 §8) and the six guardrails (§9), as prose the model reads |
| `d3-method.md`       | The playbook — the whole D3 method, in one file                              |

## Rules for editing either file

- **Nothing that changes may go inside them.** No date, no version stamp, no
  build id, no HTML comments. One changing character invalidates the prompt
  cache for every user on every message, silently, and the only symptom is the
  bill.
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

## `d3-method.md` is written

The marker line is gone and the coach answers. If `PLAYBOOK_PLACEHOLDER` ever
reappears as the first line, `POST /api/chat` goes back to refusing every
message — HTTP 503, logged as `[chat] playbook not ready`. A test in
`src/lib/chat-prompt.test.ts` now asserts the marker is **absent**, so that
regression fails the build rather than shipping silently.

It is written from the five lesson transcripts and holds the eight sections
PRD 2 §4 pins, in that order, with no H1. Every claim traces to something a
lesson actually says; where a lesson is silent the chatbot is expected to say so
(§9) rather than improvise, so do not fill gaps here.

Two things to keep true when editing it:

- The four formula sections each keep all five §5 headings.
- The lesson names it cites are the `LESSON_USED` values in
  `src/lib/chat-prompt.ts`, which is a **strict enum** in the response schema.
  Day 4 is one lesson covering four topics, so its name is the whole string
  `口播表现力+视频置景+素材库+晒过程脚本` — citing `晒过程脚本` alone points the
  model at a lesson name it is not allowed to emit.

## The model must honour `response_format`

`CHAT_MODEL` has to be a model that actually obeys the JSON schema, not merely
one that advertises it. A model that ignores it returns prose, every reply
fails the route's envelope check, and the user sees a generic failure with
nothing useful in the logs. `anthropic/claude-sonnet-5` was measured doing
exactly that, with `provider.require_parameters` already set. Verify any
replacement with a real request before pointing `CHAT_MODEL` at it.

## Deployment

`apps/frontend/next.config.js` carries
`outputFileTracingIncludes: { '/api/chat': ['./src/content/*.md'] }`. Without
it these files are absent in production, every chat returns 503, and local dev
works perfectly. Do not remove it, and do not move this directory.
