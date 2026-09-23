-- Staff portal (staff.d3creator.com): staff accounts, their shoot schedule,
-- tasks and video jobs given to them, and a record of every account handover.
--
-- Staff sign up on their own host. The signup trigger gives them
-- 'staff_pending', which reaches nothing (not the Studio, not member classes,
-- not the portal beyond a waiting page); an admin approves them by linking
-- the login to a person on the work board and setting 'staff'. Both roles sit
-- outside has_studio_access() and the class_video member policy, which list
-- member/creator/admin only.
--
-- Everything new is service-role only, like the other tracker tables: the
-- pages and actions use getSupabaseAdmin() behind their own guards
-- (requireAdmin / requireStaff).

-- 1. Roles ------------------------------------------------------------------

alter table public.user_role drop constraint user_role_role_check;
alter table public.user_role add constraint user_role_role_check
  check (role in ('admin', 'creator', 'member', 'none', 'staff', 'staff_pending'));

-- Unchanged from 20260629000003 except the staff branch. `portal` comes from
-- the signup request's user metadata — the client chooses it — so it may only
-- ever select the state with LESS access than the member default.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_emails text;
  v_role text := 'member';
begin
  v_admin_emails := trim(coalesce(current_setting('app.admin_emails', true), ''));
  if v_admin_emails <> ''
     and lower(new.email) = any(
       regexp_split_to_array(lower(v_admin_emails), '\s*,\s*')
     ) then
    v_role := 'admin';
  elsif coalesce(new.raw_user_meta_data ->> 'portal', '') = 'staff' then
    v_role := 'staff_pending';
  end if;

  insert into public.user_role (user_id, role) values (new.id, v_role);
  insert into public.creator_link (user_id) values (new.id);

  return new;
end;
$$;

-- 2. People: a login per person, and archiving instead of deleting ----------

-- One login per person. A person who leaves is archived (hidden from the
-- board and every picker) so their shoots and handovers keep a name.
alter table public.tracker_member
  add column user_id     uuid unique references auth.users (id) on delete set null,
  add column archived_at timestamptz;

-- Who last wrote the row; the log trigger below records it with each change.
alter table public.tracker_assignment
  add column updated_by uuid references auth.users (id) on delete set null;

-- 3. Shoots -----------------------------------------------------------------

-- One planned shoot: a day, maybe a time, where / what, maybe which account
-- and how many videos. After the day it is marked done (with how many were
-- shot) or cancelled, and stays as the record of the work.
create table public.tracker_shoot (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.tracker_member (id) on delete restrict,
  shoot_date     date not null,
  start_time     time,
  title          text not null check (char_length(title) between 1 and 200),
  creator_id     uuid references public.creator (id) on delete set null,
  videos_planned smallint check (videos_planned between 0 and 99),
  videos_shot    smallint check (videos_shot between 0 and 99),
  status         text not null default 'planned'
                 check (status in ('planned', 'done', 'cancelled')),
  note           text check (char_length(note) <= 1000),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index tracker_shoot_date_idx on public.tracker_shoot (shoot_date);
create index tracker_shoot_member_date_idx on public.tracker_shoot (member_id, shoot_date);

create trigger tracker_shoot_updated_at before update on public.tracker_shoot
  for each row execute function public.set_updated_at();

-- 4. Handover log -----------------------------------------------------------

-- One row per changed field of a tracker_assignment row: who handles an
-- account, who edits it, whether it is on a posting schedule. Written by the
-- trigger, never by the app, so no write path can skip it. Starts empty:
-- changes before this migration are not recoverable.
create table public.tracker_assignment_log (
  id         bigint generated always as identity primary key,
  creator_id uuid not null references public.creator (id) on delete cascade,
  field      text not null check (field in ('handler', 'editor', 'scheduled_posting')),
  old_value  text,
  new_value  text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index tracker_assignment_log_creator_idx
  on public.tracker_assignment_log (creator_id, changed_at desc);

create or replace function public.log_tracker_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- A new row is compared with an empty one: no handler, no editor, off.
  v_old_handler   uuid    := case when tg_op = 'UPDATE' then old.handler_id end;
  v_old_editor    uuid    := case when tg_op = 'UPDATE' then old.editor_id end;
  v_old_scheduled boolean := case when tg_op = 'UPDATE' then old.scheduled_posting else false end;
begin
  if new.handler_id is distinct from v_old_handler then
    insert into public.tracker_assignment_log (creator_id, field, old_value, new_value, changed_by)
    values (new.creator_id, 'handler', v_old_handler::text, new.handler_id::text, new.updated_by);
  end if;
  if new.editor_id is distinct from v_old_editor then
    insert into public.tracker_assignment_log (creator_id, field, old_value, new_value, changed_by)
    values (new.creator_id, 'editor', v_old_editor::text, new.editor_id::text, new.updated_by);
  end if;
  if new.scheduled_posting is distinct from v_old_scheduled then
    insert into public.tracker_assignment_log (creator_id, field, old_value, new_value, changed_by)
    values (new.creator_id, 'scheduled_posting', v_old_scheduled::text, new.scheduled_posting::text, new.updated_by);
  end if;
  return null;
end;
$$;

create trigger tracker_assignment_log
  after insert or update on public.tracker_assignment
  for each row execute function public.log_tracker_assignment();

-- 5. Tasks for a person --------------------------------------------------

-- A job task can be given to someone; they see it in the staff portal and
-- tick it off there. Unassigned tasks stay the admin's own list.
alter table public.tracker_task
  add column assignee_id uuid references public.tracker_member (id) on delete set null;

create index tracker_task_assignee_idx on public.tracker_task (assignee_id)
  where assignee_id is not null;

-- 6. Video jobs -------------------------------------------------------------

-- One video for one account, through two hands: the editor cuts it and
-- clicks Done with a link to the cut; the handler schedules the post and
-- clicks Done with a link to the live post. The two Done stamps are what the
-- console counts per person per month. Either hand can be empty (an account
-- nobody edits, or a video posted by whoever edited it).
create table public.tracker_video (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid references public.creator (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  note        text check (char_length(note) <= 1000),
  editor_id   uuid references public.tracker_member (id) on delete restrict,
  handler_id  uuid references public.tracker_member (id) on delete restrict,
  edited_at   timestamptz,
  edit_link   text check (char_length(edit_link) <= 500),
  post_date   date,
  post_time   time,
  posted_at   timestamptz,
  post_link   text check (char_length(post_link) <= 500),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tracker_video_editor_idx  on public.tracker_video (editor_id, edited_at);
create index tracker_video_handler_idx on public.tracker_video (handler_id, posted_at);
create index tracker_video_created_idx on public.tracker_video (created_at desc);

create trigger tracker_video_updated_at before update on public.tracker_video
  for each row execute function public.set_updated_at();

-- 7. Lock down --------------------------------------------------------------

revoke all on table public.tracker_shoot, public.tracker_assignment_log, public.tracker_video
  from anon, authenticated;
alter table public.tracker_shoot          enable row level security;
alter table public.tracker_assignment_log enable row level security;
alter table public.tracker_video          enable row level security;
revoke execute on function public.log_tracker_assignment() from public, anon, authenticated;
