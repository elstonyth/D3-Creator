-- Staff video flow: a video now starts at a shoot and ends with a check.
--
-- Staff plan their shoots. After a shoot, its owner passes the videos on:
-- one row per video, each given to an editor. The editor clicks Done (a link
-- to the cut is optional); the person who passed it — the handler — checks
-- the cut and clicks Verify. Posting is no longer tracked here, and the
-- admin only looks.
--
-- Safe on prod: tracker_video has no rows yet, so the NOT NULLs and the
-- dropped posting columns lose nothing. Additive otherwise; the old tracker
-- tables (tasks, events, notes, assignments and their log) stay as they are.

-- 1. Video jobs -------------------------------------------------------------

-- Which shoot a video came from. Deleting the shoot keeps the video.
alter table public.tracker_video
  add column shoot_id uuid references public.tracker_shoot (id) on delete set null;

create index tracker_video_shoot_idx on public.tracker_video (shoot_id);

-- The handler's Done is a check of the cut now, not a post.
alter table public.tracker_video rename column posted_at to verified_at;
alter table public.tracker_video rename column posted_by to verified_by;
alter index public.tracker_video_posted_by_idx rename to tracker_video_verified_by_idx;
alter table public.tracker_video
  rename constraint tracker_video_posted_by_fkey to tracker_video_verified_by_fkey;

-- Every video has both hands (they may be the same person), and nothing is
-- verified before it is edited.
alter table public.tracker_video
  drop column post_date,
  drop column post_time,
  drop column post_link,
  alter column editor_id set not null,
  alter column handler_id set not null,
  add constraint tracker_video_verified_after_edit
    check (verified_at is null or edited_at is not null);

-- 2. Credit stamps ------------------------------------------------------------

-- As before, the stamps belong to the database: set from the job's people at
-- the moment a Done appears, cleared when it is taken back, left alone by
-- every other write. The verify now counts for the handler only — the old
-- fallback to the editor would let an editor check their own work.
create or replace function public.stamp_tracker_video_credit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.edited_at is null then
    new.edited_by := null;
  elsif tg_op = 'INSERT' then
    new.edited_by := new.editor_id;
  elsif old.edited_at is null then
    new.edited_by := new.editor_id;
  else
    new.edited_by := old.edited_by;
  end if;

  if new.verified_at is null then
    new.verified_by := null;
  elsif tg_op = 'INSERT' then
    new.verified_by := new.handler_id;
  elsif old.verified_at is null then
    new.verified_by := new.handler_id;
  else
    new.verified_by := old.verified_by;
  end if;

  return new;
end;
$$;

-- 3. Passing a shoot's videos on -----------------------------------------------

-- One call, one transaction: check the shoot is the caller's and not
-- cancelled, check every row, add the videos, and mark the shoot done with
-- how many videos have come out of it so far (passing again adds more).
--
-- p_member_id is the caller's board person and p_user_id their login, both
-- taken from the session by the app, never from the browser. Each refusal is
-- a plain sentence the app shows as it is.
create or replace function public.tracker_pass_shoot(
  p_shoot_id  uuid,
  p_member_id uuid,
  p_user_id   uuid,
  p_videos    jsonb
)
returns setof public.tracker_video
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shoot  public.tracker_shoot;
  v_item   jsonb;
  v_title  text;
  v_editor uuid;
  v_row    public.tracker_video;
begin
  -- Locked, so two passes at once count each other's videos.
  select * into v_shoot
  from public.tracker_shoot
  where id = p_shoot_id
  for update;
  if not found then
    raise exception 'That shoot is already gone.';
  end if;
  if v_shoot.member_id is distinct from p_member_id then
    raise exception 'You can only pass videos from your own shoots.';
  end if;
  if v_shoot.status = 'cancelled' then
    raise exception 'That shoot was cancelled. Reopen it first.';
  end if;

  -- Separate checks: jsonb_array_length fails on anything but an array.
  if jsonb_typeof(p_videos) is distinct from 'array' then
    raise exception 'Add between 1 and 30 videos.';
  end if;
  if jsonb_array_length(p_videos) not between 1 and 30 then
    raise exception 'Add between 1 and 30 videos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_videos) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Add between 1 and 30 videos.';
    end if;

    -- Tidied as the app tidies a title: runs of spaces become one.
    v_title := btrim(regexp_replace(coalesce(v_item ->> 'title', ''), '\s+', ' ', 'g'));
    if char_length(v_title) not between 1 and 200 then
      raise exception 'Give each video a title (up to 200 characters).';
    end if;

    -- Checked before the cast, which would fail with a message of its own.
    if coalesce(v_item ->> 'editor_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Pick an editor for each video.';
    end if;
    v_editor := (v_item ->> 'editor_id')::uuid;
    if not exists (
      select 1 from public.tracker_member
      where id = v_editor
        and archived_at is null
        and kind in ('editor', 'both')
    ) then
      raise exception 'Pick an editor who is on the team.';
    end if;

    insert into public.tracker_video
      (creator_id, title, editor_id, handler_id, shoot_id, created_by)
    values
      (v_shoot.creator_id, v_title, v_editor, p_member_id, p_shoot_id, p_user_id)
    returning * into v_row;
    return next v_row;
  end loop;

  update public.tracker_shoot
  set status = 'done',
      videos_shot = least(99, (
        select count(*) from public.tracker_video where shoot_id = p_shoot_id
      ))
  where id = p_shoot_id;

  return;
end;
$$;

-- 4. Lock down ------------------------------------------------------------------

-- Service role only, like every tracker table: the app calls it from a
-- server action behind requireStaff.
revoke execute on function public.tracker_pass_shoot(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.tracker_pass_shoot(uuid, uuid, uuid, jsonb)
  to service_role;
