-- Studio Script Coach - business profile + chat transcripts (PRD 2 section 10),
-- with Amendment 1 (plans/ai-tools/amendment-1-profile-settings-and-voice-memory.md):
-- four extra user_profile columns, folded in here rather than shipped as a
-- second migration because this file had not shipped yet.
--
-- NAMING: public.user_profile is the signed-in user's BUSINESS profile.
-- public.profile already exists and means "creator x platform" — a scraped
-- social account (20260527135229_init_v1_core_tables.sql). Unrelated tables,
-- never joined.
--
-- All three tables are PRIVATE user content. Deliberate break from the showcase
-- tables (client/creator/profile/profile_snapshot/post_snapshot), which are
-- world-readable and carry an "admin manages ..." policy (20260528000000).
-- There is NO admin policy here: an admin has no business reading a user's
-- chats through PostgREST.

-- ---------------------------------------------------------------------------
-- 0. Role gate. Mirrors public.is_admin() (20260528000000) and the revoked-user
--    fix in 20260629000002_class_video_none_excluded.sql: role 'none' is
--    revoked and must not keep access. 'admin' is in the set only so the sole
--    production admin can test the Studio on their OWN rows — this is not an
--    admin-reads-everyone grant.
-- ---------------------------------------------------------------------------
create or replace function public.has_studio_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_role
    where user_id = (select auth.uid())
      and role in ('member','creator','admin')
  );
$$;

-- Same posture as is_admin() in 20260606000000: no direct-RPC surface for anon,
-- EXECUTE kept for authenticated because RLS policies below call it.
revoke execute on function public.has_studio_access() from public, anon;
grant  execute on function public.has_studio_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. user_profile — one row per business. A user may hold several; exactly one
--    is active. NOT NULL is limited to the four fields captured inline in the
--    chat on first use, plus content_language which carries a default.
-- ---------------------------------------------------------------------------
create table public.user_profile (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- the four inline fields — the four with no safe default
  what_you_sell         text not null check (char_length(what_you_sell) between 1 and 200),
  who_buys_it           text not null check (char_length(who_buys_it) between 1 and 200),
  main_platform         text not null check (main_platform in ('tiktok','reels','douyin','rednote','facebook')),
  on_camera             text not null check (on_camera in ('yes','no','sometimes')),

  -- required for a COMPLETE profile, defaulted so a four-field insert is legal
  content_language      text not null default 'english'
                          check (content_language in ('chinese','english','malay','mixed')),

  -- schema slot in phase 1; null means omitted from the prompt entirely
  business_type         text check (business_type in
                          ('retail','food','services','property','health','education','ecommerce','other')),
  business_type_other   text check (char_length(business_type_other) between 1 and 60),
  location              text check (char_length(location) between 1 and 120),
  tone                  text check (tone in ('friendly','expert','funny','direct')),
  business_name         text check (char_length(business_name) between 1 and 120),
  typical_video_seconds int  check (typical_video_seconds in (30,60,90)),
  already_tried         text check (char_length(already_tried) between 1 and 500),
  things_to_avoid       text check (char_length(things_to_avoid) between 1 and 500),
  -- Amendment 1 (owner decisions 9-12, 2026-08-21): job role, self-declared
  -- reach, and the two DECLARED brand-voice memory fields. All four are
  -- Settings-only -- the inline chat form still collects exactly four fields.
  --
  -- NAMING: creator_role is a JOB TITLE. public.user_role is the ACCESS role
  -- (admin/creator/member/none, 20260528000000) and lib/auth.ts's UserRole is
  -- that one. Unrelated columns, never joined.
  creator_role          text check (creator_role in
                          ('business_owner','content_creator','marketer','agency','freelancer','other')),
  -- Self-declared, never derived from profile_snapshot: a brand-new signup has
  -- no creator_link row, so there are no snapshots to derive a bucket from.
  reach                 text check (reach in ('under_1k','1k_10k','10k_100k','100k_plus')),
  -- Brand-voice memory. DECLARED, not summarised from the user's threads
  -- (owner decision 11). Same 500-char cap as the two long fields above,
  -- because these strings are pasted verbatim into every prompt.
  content_pillars       text check (char_length(content_pillars) between 1 and 500),
  voice_notes           text check (char_length(voice_notes) between 1 and 500),

  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- "Dropdown + other": the free text is required exactly when 'other' is
  -- chosen, and forbidden otherwise (including when business_type is null).
  constraint user_profile_other_needs_text check (
    case when business_type = 'other'
         then business_type_other is not null
         else business_type_other is null
    end
  )
);

create unique index user_profile_one_active_per_user
  on public.user_profile (user_id) where is_active;
create index user_profile_user_idx on public.user_profile (user_id, created_at);

create trigger user_profile_updated_at before update on public.user_profile
  for each row execute function public.set_updated_at();

-- Exactly one active business per user, enforced in the DB so that creating a
-- business and switching business are each ONE statement and neither can leave
-- the user with zero active rows. Runs BEFORE the unique index is checked.
-- security invoker: same-table write, and the user's own UPDATE policy exists.
create or replace function public.user_profile_single_active()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_profile
     set is_active = false
   where user_id = new.user_id and id <> new.id and is_active;
  return new;
end;
$$;

revoke execute on function public.user_profile_single_active() from public, anon, authenticated;

-- WHEN (new.is_active) also stops the inner UPDATE from re-entering the trigger.
create trigger user_profile_single_active
  before insert or update of is_active on public.user_profile
  for each row when (new.is_active)
  execute function public.user_profile_single_active();

-- ---------------------------------------------------------------------------
-- 2. chat_thread
-- ---------------------------------------------------------------------------
create table public.chat_thread (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- stamped at thread creation so a thread records which business it was
  -- written for. Deleting a business must NOT delete its scripts.
  user_profile_id uuid references public.user_profile(id) on delete set null,
  title           text not null default 'New chat' check (char_length(title) between 1 and 120),
  created_at      timestamptz not null default now(),
  -- LAST ACTIVITY. Bumped only by a chat_message insert (trigger below).
  updated_at      timestamptz not null default now()
);

create index chat_thread_user_activity_idx on public.chat_thread (user_id, updated_at desc);

-- NO public.set_updated_at() trigger here. Deliberate: class_video (20260629000000)
-- has one, and copying it would make renaming a thread reorder the left rail.

-- ---------------------------------------------------------------------------
-- 3. chat_message
-- ---------------------------------------------------------------------------
create table public.chat_message (
  id                bigint generated always as identity primary key,
  thread_id         uuid not null references public.chat_thread(id) on delete cascade,
  role              text not null check (role in ('user','assistant')),
  -- prose only: the coach's message, or the user's question. NOT the raw model
  -- JSON envelope — the script lives in the script column.
  content           text not null check (char_length(content) between 1 and 20000),
  -- the validated section 7 script object; shape is owned by section 7 and
  -- validated in application code, so no constraint here.
  script            jsonb,
  model             text check (char_length(model) between 1 and 120),
  prompt_tokens     int  check (prompt_tokens     >= 0),
  completion_tokens int  check (completion_tokens >= 0),
  -- OpenRouter's usage.prompt_tokens_details.cached_tokens — NOT Anthropic's
  -- cache_read_input_tokens. Persisted so the cache check is a SQL query.
  cached_tokens     int  check (cached_tokens     >= 0),
  created_at        timestamptz not null default now(),

  constraint chat_message_script_is_assistant check (script is null or role = 'assistant')
);

-- Replay order is (thread_id, id). Never order by created_at: two rows written
-- in one transaction share now() and would replay nondeterministically.
create index chat_message_thread_idx on public.chat_message (thread_id, id);

-- security definer: this writes a DIFFERENT table, so under security invoker
-- every message insert would silently depend on a chat_thread UPDATE policy
-- existing. Same pattern as forbid_creator_link_creator_change (20260601000000).
-- The insert already proved thread ownership via the chat_message INSERT policy.
create or replace function public.bump_chat_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_thread set updated_at = now() where id = new.thread_id;
  return null;
end;
$$;

revoke execute on function public.bump_chat_thread_activity() from public, anon, authenticated;

create trigger chat_message_bumps_thread
  after insert on public.chat_message
  for each row execute function public.bump_chat_thread_activity();

-- ---------------------------------------------------------------------------
-- 4. Privileges. Written out explicitly, like every other privilege decision in
--    this repo (20260606000000, 20260706080000), rather than leaning on
--    Supabase's default grants. anon holds no grant AND no policy.
-- ---------------------------------------------------------------------------
revoke all on table public.user_profile from anon;
revoke all on table public.chat_thread  from anon;
revoke all on table public.chat_message from anon;

grant select, insert, update, delete on table public.user_profile to authenticated;
grant select, insert, update, delete on table public.chat_thread  to authenticated;
grant select, insert                 on table public.chat_message to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.user_profile enable row level security;
alter table public.chat_thread  enable row level security;
alter table public.chat_message enable row level security;

-- BOTH gates are wrapped in a scalar subquery: (select auth.uid()) and
-- (select public.has_studio_access()). Postgres hoists each into an InitPlan
-- evaluated once per statement, not once per row; has_studio_access() is
-- STABLE so that is safe, and unwrapped it trips auth_rls_initplan.

-- user_profile
create policy "user reads own business profile"
  on public.user_profile for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user inserts own business profile"
  on public.user_profile for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user updates own business profile"
  on public.user_profile for update to authenticated
  using      ((select auth.uid()) = user_id and (select public.has_studio_access()))
  with check ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user deletes own business profile"
  on public.user_profile for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_studio_access()));

-- chat_thread
create policy "user reads own chat threads"
  on public.chat_thread for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user inserts own chat threads"
  on public.chat_thread for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user updates own chat threads"
  on public.chat_thread for update to authenticated
  using      ((select auth.uid()) = user_id and (select public.has_studio_access()))
  with check ((select auth.uid()) = user_id and (select public.has_studio_access()));

create policy "user deletes own chat threads"
  on public.chat_thread for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_studio_access()));

-- chat_message — ownership resolves through the parent thread. SELECT and
-- INSERT only: a turn is a historical fact, so UPDATE and DELETE are denied.
create policy "user reads own chat messages"
  on public.chat_message for select to authenticated
  using (
    (select public.has_studio_access())
    and exists (
      select 1 from public.chat_thread t
      where t.id = chat_message.thread_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "user inserts own chat messages"
  on public.chat_message for insert to authenticated
  with check (
    (select public.has_studio_access())
    and exists (
      select 1 from public.chat_thread t
      where t.id = chat_message.thread_id
        and t.user_id = (select auth.uid())
    )
  );
