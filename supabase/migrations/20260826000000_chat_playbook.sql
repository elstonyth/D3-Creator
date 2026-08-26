-- chat_playbook — the Script Coach's playbook, held in the database because it
-- CANNOT live in this repository.
--
-- WHY THIS TABLE EXISTS. The playbook is the client's paid course condensed
-- into a prompt: the named lessons, the named frameworks and the four script
-- formulas. THIS GITHUB REPOSITORY IS PUBLIC. Committing that text publishes
-- the product for free, permanently, to anyone who clones or reads the repo —
-- and git history means a later delete does not take it back. So the file is
-- in .gitignore, the bundle no longer carries it, and the running code reads
-- the text from here instead.
--
-- Do NOT "simplify" this back into a bundled markdown file. The file read it
-- replaced was not slow or complicated; it was public. A future editor who
-- sees one row of text and a table wrapped around it is looking at an access
-- boundary, not an over-engineered config store.
--
-- The row the app reads is id = 'd3-method'. That literal is declared once in
-- TypeScript as PLAYBOOK_ID in apps/frontend/src/lib/chat-playbook.ts; the app
-- never spells it inline. One row per document, so a second playbook is a
-- second row and never a schema change.

create table public.chat_playbook (
  id         text primary key,
  -- 200,000 characters is far above any playbook worth sending (the text rides
  -- inside the cached prompt prefix on every single message) and far below
  -- anything that could be pasted in by accident. char_length, not octet_length:
  -- the playbook is largely Chinese, where a character is three bytes.
  content    text not null check (char_length(content) between 1 and 200000),
  updated_at timestamptz not null default now()
);

-- The shared trigger from 20260527135229_init_v1_core_tables.sql. Reused, never
-- redefined — a second set_updated_at() would be two functions to keep in step.
create trigger chat_playbook_updated_at before update on public.chat_playbook
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges. Written out explicitly rather than leaning on Supabase's default
-- grants, like every other privilege decision in this repo (20260606000000,
-- 20260706080000, 20260819120000).
--
-- NO ROLE BUT service_role MAY READ THIS. Not anon, and — the part that is easy
-- to get wrong — not `authenticated` either. Anyone can sign up for an account
-- on this site, so a SELECT grant to authenticated would hand the client's paid
-- course to any visitor willing to enter an email address, straight out of
-- PostgREST, with no UI involved. That is the same leak as committing the file,
-- behind one free signup.
-- ---------------------------------------------------------------------------
revoke all on table public.chat_playbook from anon, authenticated;

-- RLS with DELIBERATELY NO POLICIES. Enabling RLS and writing no policy denies
-- every row to every role that respects it; service_role holds BYPASSRLS and is
-- the only thing that reads the table. The revoke above and this line are belt
-- and braces on purpose — either one alone is a single edit away from open.
--
-- If you are here to add a policy: don't. There is no user-facing read path for
-- this table and there must not be one. The playbook reaches a user only as
-- part of a model reply, never as bytes.
alter table public.chat_playbook enable row level security;

comment on table public.chat_playbook is
  'Script Coach playbook text. Client IP — service_role only, never exposed through PostgREST. Not in the public repo.';
comment on column public.chat_playbook.content is
  'Sent to the model verbatim inside the cached prompt prefix. Stable bytes: an edit re-prices the cache for every user.';
