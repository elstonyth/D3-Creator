-- The account board's month output, as the owner asked on 2026-10-01:
-- videos are counted on Instagram, views on all four platforms. Supersedes
-- the Instagram-only views of 20260929132840.
--
-- `videos` is still every Instagram video published in [p_from, p_to): a
-- reel, or another video (the adapter's 'video': IGTV, a feed video).
-- `views` is now the latest views of every post published in the month on
-- Instagram, TikTok, Facebook and Douyin — each platform's copy of a clip
-- counts its own views. Image posts carry no views. RedNote is left out.
-- A creator with no Instagram now gets a row too (0 videos, its views).
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
      p.creator_id, p.platform, ps.content_type, ps.views
    from public.post_snapshot ps
    join public.profile p on p.id = ps.profile_id
    where ps.posted_at >= p_from and ps.posted_at < p_to
      and p.platform in ('instagram', 'tiktok', 'facebook', 'douyin')
    order by ps.profile_id, ps.external_post_id, ps.captured_at desc
  )
  select
    creator_id,
    (count(*) filter (
      where platform = 'instagram' and content_type in ('reel', 'video')
    ))::integer                     as videos,
    (count(*) filter (
      where platform = 'instagram' and content_type in ('reel', 'video')
    ))::integer                     as posts,
    coalesce(sum(views), 0)::bigint as views
  from latest
  group by creator_id;
$$;

revoke all on function public.tracker_creator_month_stats(timestamptz, timestamptz) from public, anon, authenticated;

comment on function public.tracker_creator_month_stats(timestamptz, timestamptz) is
  'Work tracker: per-creator Instagram videos (reels and other videos), and views across Instagram, TikTok, Facebook and Douyin, for posts published in [p_from, p_to). service_role only.';
