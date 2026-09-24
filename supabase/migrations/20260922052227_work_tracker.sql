-- Work tracker — the agency's internal day board at /admin/tracker.
--
-- One admin team, one board: calendar events, a task list, a free-text
-- remarks pad, and the staffing map that answers "which creator is under
-- whom" (handler), "who cuts their video" (editor) and "is this account on a
-- posting schedule". The per-video who-did-what was ruled out on purpose —
-- assignments are fixed per account, not per post.
--
-- Every table is service-role only, like analyzer_job: the pages read and
-- write through getSupabaseAdmin() behind requireAdmin(). RLS on with no
-- policies plus the revoke keeps anon/authenticated out of PostgREST.

create table public.tracker_member (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  role        text not null default 'Trader' check (char_length(role) between 1 and 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- One row per creator that has ever been configured. Missing row = unassigned.
create table public.tracker_assignment (
  creator_id        uuid primary key references public.creator (id) on delete cascade,
  handler_id        uuid references public.tracker_member (id) on delete set null,
  editor_id         uuid references public.tracker_member (id) on delete set null,
  scheduled_posting boolean not null default false,
  sort_order        integer not null default 0,
  updated_at        timestamptz not null default now()
);

create trigger tracker_assignment_updated_at before update on public.tracker_assignment
  for each row execute function public.set_updated_at();

create table public.tracker_task (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  done         boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tracker_event (
  id          uuid primary key default gen_random_uuid(),
  event_date  date not null,
  title       text not null check (char_length(title) between 1 and 200),
  created_at  timestamptz not null default now()
);

create index tracker_event_date_idx on public.tracker_event (event_date);

-- Single-row pad. `key` exists so a second pad can be added without a schema change.
create table public.tracker_note (
  key        text primary key,
  body       text not null default '' check (char_length(body) <= 20000),
  updated_at timestamptz not null default now()
);

create trigger tracker_note_updated_at before update on public.tracker_note
  for each row execute function public.set_updated_at();

revoke all on table
  public.tracker_member, public.tracker_assignment, public.tracker_task,
  public.tracker_event, public.tracker_note
from anon, authenticated;

alter table public.tracker_member     enable row level security;
alter table public.tracker_assignment enable row level security;
alter table public.tracker_task       enable row level security;
alter table public.tracker_event      enable row level security;
alter table public.tracker_note       enable row level security;

-- Month output per creator: how many videos went out and how many views they
-- drew, from the newest snapshot of every post published inside the window.
-- Cross-platform copies of one video are collapsed the same way
-- apps/frontend/src/lib/content-dedup.ts does it — same creator, same
-- whole-second duration, same caption hook — so `videos` counts productions
-- while `posts` and `views` count every platform copy.
create or replace function public.tracker_creator_month_stats(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  creator_id uuid,
  videos     integer,
  posts      integer,
  views      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (ps.profile_id, ps.external_post_id)
      ps.profile_id, ps.external_post_id, ps.views, ps.duration_seconds, ps.caption_excerpt
    from public.post_snapshot ps
    where ps.posted_at >= p_from and ps.posted_at < p_to
    order by ps.profile_id, ps.external_post_id, ps.captured_at desc
  ),
  keyed as (
    select
      p.creator_id,
      l.views,
      case
        when l.duration_seconds is not null
         and nullif(lower(trim(regexp_replace(split_part(split_part(coalesce(l.caption_excerpt, ''), E'\n', 1), '#', 1), '\s+', ' ', 'g'))), '') is not null
        then 'd' || l.duration_seconds::text || '|' ||
             lower(trim(regexp_replace(split_part(split_part(l.caption_excerpt, E'\n', 1), '#', 1), '\s+', ' ', 'g')))
        else 'u' || l.profile_id::text || '|' || l.external_post_id
      end as content_key
    from latest l
    join public.profile p on p.id = l.profile_id
  )
  select
    creator_id,
    count(distinct content_key)::integer as videos,
    count(*)::integer                    as posts,
    coalesce(sum(views), 0)::bigint      as views
  from keyed
  group by creator_id;
$$;

revoke all on function public.tracker_creator_month_stats(timestamptz, timestamptz) from public, anon, authenticated;

comment on function public.tracker_creator_month_stats(timestamptz, timestamptz) is
  'Work tracker: per-creator videos/posts/views for posts published in [p_from, p_to). service_role only.';

-- The three people on the board today.
insert into public.tracker_member (name, role, sort_order) values
  ('KEE',   'Trader', 0),
  ('ZUWEI', 'Trader', 1),
  ('HOWEN', 'Trader', 2);

insert into public.tracker_note (key, body) values ('remarks', '');
