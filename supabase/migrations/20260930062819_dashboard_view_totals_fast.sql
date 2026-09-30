-- Speed up dashboard_view_totals_windowed (same output, ~17x faster).
--
-- In production the old plan ran ~4 s: a per-profile nested-loop index scan
-- over post_snapshot, then every post cross-joined against the seven windows
-- and re-sorted. That crosses the anon role's 3 s statement timeout, so every
-- cache refresh of the public dashboard failed (57014) and /dashboard kept
-- serving its last good numbers from 2026-09-29 while /leaderboard, fed by
-- public_creator_rows, moved on. The two pages' "Total Views" drifted ~25M apart.
--
-- Now: one hash aggregate per post, one pass of conditional sums per
-- (creator, platform), then unpivot into the same (creator_id, platform, win,
-- total_views) rows. Verified row-for-row identical against the old function
-- (931 rows, 0 differences) before replacing it. CREATE OR REPLACE keeps the
-- existing grants.

create or replace function public.dashboard_view_totals_windowed(
  p_creator_ids uuid[] default null
)
returns table (creator_id uuid, platform text, win text, total_views bigint)
language sql
stable
set search_path = ''
as $$
  with
  cur_post as (
    select pp.profile_id,
      coalesce(max(pp.views), 0) as cur_views,
      max(pp.posted_at) as posted_at
    from public.post_snapshot pp
    group by pp.profile_id, pp.external_post_id
  ),
  per_slot as (
    select pr.creator_id, pr.platform,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '1 day')    as d1,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '7 days')   as w1,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '30 days')  as m1,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '90 days')  as m3,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '180 days') as m6,
      sum(cp.cur_views) filter (where cp.posted_at >= now() - interval '365 days') as m12,
      sum(cp.cur_views)                                                            as lt
    from cur_post cp
    join public.profile pr on pr.id = cp.profile_id
    where pr.platform <> 'rednote'
      and (p_creator_ids is null or pr.creator_id = any(p_creator_ids))
    group by pr.creator_id, pr.platform
  )
  select s.creator_id, s.platform, w.win, coalesce(w.total, 0)::bigint
  from per_slot s
  cross join lateral (values
    ('1d', s.d1), ('1w', s.w1), ('1m', s.m1), ('3m', s.m3),
    ('6m', s.m6), ('12m', s.m12), ('lifetime', s.lt)
  ) as w(win, total);
$$;
