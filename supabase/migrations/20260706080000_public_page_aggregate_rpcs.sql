-- Public-page aggregate RPCs (spec: docs/superpowers/specs/2026-07-06-public-page-aggregate-rpcs-design.md)
--
-- The public pages (/, /dashboard, /leaderboard) are force-dynamic and used to
-- page the ENTIRE profile_snapshot + post_snapshot history through PostgREST on
-- every request, aggregating in JS (O(all history), growing ~1.2k rows/day).
-- These two functions push that aggregation into Postgres and return bounded
-- rows (one per profile / one per post).
--
-- Semantics MUST match the JS they replace (queries.ts) exactly:
--   * followers        = newest profile_snapshot row (captured_at desc, id desc), null -> 0
--   * per-post views   = coalesce(max(views), 0) across ALL snapshots of the post
--                        (monotonic-views guard — a transient bad re-scrape must not
--                        lower a post's recorded views; mirrors maxViewsPerPost)
--   * engagement/caption/media/posted_at/duration = newest snapshot per post
--   * rednote profiles excluded
--   * zero-post profiles STILL return a row (LEFT JOIN) — their followers must
--     keep counting toward the creator total
--
-- Security: invoker (anon already has SELECT on these tables — it reads them
-- directly today), stable, search_path pinned. Deterministic ORDER BY because
-- PostgREST caps set-returning RPC responses (~1000 rows) and the app pages
-- these with .range().

create or replace function public.public_creator_rows()
returns table (
  profile_id uuid,
  creator_id uuid,
  platform text,
  handle text,
  followers bigint,
  total_views bigint,
  total_engagement bigint,
  post_count bigint
)
language sql stable
set search_path to ''
as $$
  with scope_profile as (
    select pr.id, pr.creator_id, pr.platform, pr.handle
    from public.profile pr
    where pr.platform <> 'rednote'
  ),
  latest_followers as (
    select distinct on (ps.profile_id)
      ps.profile_id, coalesce(ps.followers, 0) as followers
    from public.profile_snapshot ps
    order by ps.profile_id, ps.captured_at desc, ps.id desc
  ),
  post_maxviews as (
    select pp.profile_id, pp.external_post_id, coalesce(max(pp.views), 0) as v
    from public.post_snapshot pp
    group by pp.profile_id, pp.external_post_id
  ),
  post_latest as (
    select distinct on (pp.profile_id, pp.external_post_id)
      pp.profile_id, pp.external_post_id,
      coalesce(pp.likes, 0) + coalesce(pp.comments, 0) + coalesce(pp.shares, 0)
        as engagement
    from public.post_snapshot pp
    order by pp.profile_id, pp.external_post_id, pp.captured_at desc, pp.id desc
  ),
  per_profile as (
    select mv.profile_id,
      sum(mv.v)          as total_views,
      sum(pl.engagement) as total_engagement,
      count(*)           as post_count
    from post_maxviews mv
    join post_latest pl
      on pl.profile_id = mv.profile_id
     and pl.external_post_id = mv.external_post_id
    group by mv.profile_id
  )
  select sp.id, sp.creator_id, sp.platform, sp.handle,
    coalesce(lf.followers, 0)::bigint,
    coalesce(pp.total_views, 0)::bigint,
    coalesce(pp.total_engagement, 0)::bigint,
    coalesce(pp.post_count, 0)::bigint
  from scope_profile sp
  left join latest_followers lf on lf.profile_id = sp.id
  left join per_profile pp on pp.profile_id = sp.id
  order by sp.id
$$;

create or replace function public.public_content_rows()
returns table (
  profile_id uuid,
  creator_id uuid,
  creator_name text,
  platform text,
  handle text,
  external_post_id text,
  current_views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  caption_excerpt text,
  media_url text,
  posted_at timestamptz,
  duration_seconds integer
)
language sql stable
set search_path to ''
as $$
  with scope_profile as (
    select pr.id, pr.creator_id, pr.platform, pr.handle
    from public.profile pr
    where pr.platform <> 'rednote'
  ),
  post_maxviews as (
    select pp.profile_id, pp.external_post_id, coalesce(max(pp.views), 0) as v
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
  select pl.profile_id, sp.creator_id, c.display_name, sp.platform, sp.handle,
    pl.external_post_id,
    mv.v::bigint,
    pl.likes::bigint, pl.comments::bigint, pl.shares::bigint,
    pl.caption_excerpt, pl.media_url, pl.posted_at,
    pl.duration_seconds::integer
  from post_latest pl
  join post_maxviews mv
    on mv.profile_id = pl.profile_id
   and mv.external_post_id = pl.external_post_id
  join scope_profile sp on sp.id = pl.profile_id
  join public.creator c on c.id = sp.creator_id
  order by pl.profile_id, pl.external_post_id
$$;

-- Tight execute surface (read RPCs for the public pages).
revoke execute on function public.public_creator_rows() from public;
revoke execute on function public.public_content_rows() from public;
grant execute on function public.public_creator_rows() to anon, authenticated, service_role;
grant execute on function public.public_content_rows() to anon, authenticated, service_role;
