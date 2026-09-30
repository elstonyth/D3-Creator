-- Serve the public pages' post aggregates from a materialized view.
--
-- public_creator_rows() and public_content_rows() rebuilt the same per-post
-- aggregate on every call: MAX(views) and the latest snapshot's fields for
-- each of ~16k posts, found by walking all ~139k post_snapshot rows. On the
-- burstable Micro instance that took 3.7 s and 6.5 s as anon (2026-09-30),
-- past the role's 3 s statement timeout, so every 10-minute cache refresh of
-- /, /leaderboard and /creators failed (57014) and the pages kept serving the
-- last good numbers. The cost also grows with every day of history.
--
-- Now that aggregate is materialized once in private.post_latest, refreshed
-- every 15 minutes by pg_cron, and both RPCs read ~16k precomputed rows
-- (~120 ms). Scrapes land hourly, so the 15-minute lag is invisible next to
-- the pages' own 10-minute cache. Verified row-for-row identical against the
-- old functions in production (content 16,116 rows, creators 143 rows,
-- 0 differences either way) before replacing them. Both RPCs keep their
-- signatures, so CREATE OR REPLACE keeps the existing grants.
--
-- The view lives outside `public` so PostgREST does not expose it as a table.
-- It holds only data post_snapshot already serves to anon (public read).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create materialized view private.post_latest as
  with post_maxviews as (
    select pp.profile_id, pp.external_post_id, coalesce(max(pp.views), 0) as max_views
    from public.post_snapshot pp
    group by pp.profile_id, pp.external_post_id
  ),
  post_latest as (
    select distinct on (pp.profile_id, pp.external_post_id)
      pp.profile_id, pp.external_post_id, pp.posted_at, pp.caption_excerpt,
      pp.media_url, pp.duration_seconds,
      coalesce(pp.likes, 0)    as likes,
      coalesce(pp.comments, 0) as comments,
      coalesce(pp.shares, 0)   as shares
    from public.post_snapshot pp
    order by pp.profile_id, pp.external_post_id, pp.captured_at desc, pp.id desc
  )
  select pl.profile_id, pl.external_post_id, mv.max_views,
    pl.likes, pl.comments, pl.shares,
    pl.caption_excerpt, pl.media_url, pl.posted_at, pl.duration_seconds
  from post_latest pl
  join post_maxviews mv
    on mv.profile_id = pl.profile_id
   and mv.external_post_id = pl.external_post_id;

-- Required by REFRESH ... CONCURRENTLY, and serves the RPCs' ORDER BY.
create unique index post_latest_pkey
  on private.post_latest (profile_id, external_post_id);

revoke all on private.post_latest from public;
grant select on private.post_latest to anon, authenticated, service_role;

create or replace function public.public_content_rows()
returns table(
  profile_id uuid, creator_id uuid, creator_name text, platform text,
  handle text, external_post_id text, current_views bigint, likes bigint,
  comments bigint, shares bigint, caption_excerpt text, media_url text,
  posted_at timestamp with time zone, duration_seconds integer
)
language sql
stable
set search_path to ''
as $function$
  select pl.profile_id, pr.creator_id, c.display_name, pr.platform, pr.handle,
    pl.external_post_id,
    pl.max_views::bigint,
    pl.likes::bigint, pl.comments::bigint, pl.shares::bigint,
    pl.caption_excerpt, pl.media_url, pl.posted_at,
    pl.duration_seconds::integer
  from private.post_latest pl
  join public.profile pr on pr.id = pl.profile_id and pr.platform <> 'rednote'
  join public.creator c on c.id = pr.creator_id
  order by pl.profile_id, pl.external_post_id
$function$;

create or replace function public.public_creator_rows()
returns table(
  profile_id uuid, creator_id uuid, platform text, handle text,
  followers bigint, total_views bigint, total_engagement bigint,
  post_count bigint
)
language sql
stable
set search_path to ''
as $function$
  with per_profile as (
    select pl.profile_id,
      sum(pl.max_views)                          as total_views,
      sum(pl.likes + pl.comments + pl.shares)    as total_engagement,
      count(*)                                   as post_count
    from private.post_latest pl
    group by pl.profile_id
  )
  select pr.id, pr.creator_id, pr.platform, pr.handle,
    coalesce(lf.followers, 0)::bigint,
    coalesce(pp.total_views, 0)::bigint,
    coalesce(pp.total_engagement, 0)::bigint,
    coalesce(pp.post_count, 0)::bigint
  from public.profile pr
  -- Latest snapshot per profile: one index probe each instead of sorting
  -- the whole profile_snapshot table.
  left join lateral (
    select coalesce(ps.followers, 0) as followers
    from public.profile_snapshot ps
    where ps.profile_id = pr.id
    order by ps.captured_at desc, ps.id desc
    limit 1
  ) lf on true
  left join per_profile pp on pp.profile_id = pr.id
  where pr.platform <> 'rednote'
  order by pr.id
$function$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-post-latest') then
    perform cron.unschedule('refresh-post-latest');
  end if;
end$$;

select cron.schedule(
  'refresh-post-latest',
  '*/15 * * * *',
  $job$ refresh materialized view concurrently private.post_latest $job$
);
