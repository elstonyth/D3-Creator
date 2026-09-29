-- The account board's month output counts Instagram only (the owner's call,
-- 2026-09-29). Summed across platforms it did not add up: one clip posted on
-- four platforms counted four platforms' views, and folding the copies into
-- one "video" leaned on a guess (same duration, same caption hook).
--
-- `videos` is now every Instagram reel published in [p_from, p_to), and
-- `views` their latest views. Image posts are not videos and carry no views.
-- `posts` stays in the result, equal to `videos`, so the function keeps its
-- shape and the code reading it works before and after this lands.
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
      p.creator_id, ps.views
    from public.post_snapshot ps
    join public.profile p on p.id = ps.profile_id
    where ps.posted_at >= p_from and ps.posted_at < p_to
      and p.platform = 'instagram'
      and ps.content_type = 'reel'
    order by ps.profile_id, ps.external_post_id, ps.captured_at desc
  )
  select
    creator_id,
    count(*)::integer               as videos,
    count(*)::integer               as posts,
    coalesce(sum(views), 0)::bigint as views
  from latest
  group by creator_id;
$$;

revoke all on function public.tracker_creator_month_stats(timestamptz, timestamptz) from public, anon, authenticated;

comment on function public.tracker_creator_month_stats(timestamptz, timestamptz) is
  'Work tracker: per-creator Instagram reels and their views for posts published in [p_from, p_to). service_role only.';
