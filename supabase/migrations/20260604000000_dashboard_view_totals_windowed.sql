-- Dashboard "Total Views" period filter — windowed view totals by POST AGE,
-- broken out PER CREATOR × platform so the whole dashboard (hero, platform
-- breakdown, AND the Top Creators ranking) can follow the active period pill.
--
-- Additive shape note: returns one row per (creator × platform × window). The
-- caller (lib/metrics-windowed.getDashboardViewTotalsWindowed) rolls this up two
-- ways — Σ creators → per-platform (hero + breakdown), and per-creator (Top
-- Creators re-rank). This single function is the sole source of windowed view
-- totals for the dashboard.
--
-- SEMANTIC: total_views(win) = Σ current_views of posts PUBLISHED within the
-- window (posted_at >= today - N). Content-recency, NOT a views-gained delta —
-- needs no snapshot baseline history, so every window yields a distinct, nested
-- total immediately (1D ⊆ 1W ⊆ … ⊆ Lifetime).
--   current_views = newest post_snapshot per (profile, external_post_id).
--   posted_at = publish time (verified 100% populated). Lifetime (null window)
--   includes every post.
--
-- Intentionally distinct from creator_metrics_windowed's views_gained
-- (migration 20260530000000), which is the leaderboard's growth metric bounded
-- by snapshot history. rednote (xiaohongshu) excluded before aggregation,
-- matching getLiveCreatorRows / the windowed RPCs. p_creator_ids defaults to all
-- (public dashboard); the verification fixture passes it to scope to seeded rows.
--
-- DROP first: the return shape changed (added creator_id, and an earlier
-- revision used a views_gained column), and CREATE OR REPLACE can't alter the
-- OUT columns of an existing function. Safe — only the (unshipped) dashboard
-- hero/cards call it.

drop function if exists public.dashboard_view_totals_windowed(uuid[]);

create function public.dashboard_view_totals_windowed(
  p_creator_ids uuid[] default null
)
returns table (creator_id uuid, platform text, win text, total_views bigint)
language sql stable as $$
  with
  scope_profile as (
    select pr.id, pr.creator_id, pr.platform
    from public.profile pr
    where pr.platform <> 'rednote'  -- xiaohongshu archived: excluded before aggregation
      and (p_creator_ids is null or pr.creator_id = any(p_creator_ids))
  ),
  -- Newest snapshot per distinct post → its current cumulative view count + the
  -- post's publish time (dedup so a post snapshotted across days counts once).
  cur_post as (
    select distinct on (pp.profile_id, pp.external_post_id)
      sp.creator_id, sp.platform, coalesce(pp.views, 0) as cur_views, pp.posted_at
    from public.post_snapshot pp
    join scope_profile sp on sp.id = pp.profile_id
    order by pp.profile_id, pp.external_post_id, pp.captured_date desc
  ),
  -- 'win' not 'window' (reserved word). null `since` => lifetime (all posts).
  windows(win, since) as (
    values
      ('1d',       current_date - 1),
      ('1w',       current_date - 7),
      ('1m',       current_date - 30),
      ('3m',       current_date - 90),
      ('6m',       current_date - 180),
      ('12m',      current_date - 365),
      ('lifetime', null::date)
  )
  -- Conditional SUM over the full posts × windows cross join (NOT a WHERE
  -- filter) so every (creator × platform × window) yields a row — 0 when no post
  -- qualifies — rather than an absent cell that the UI would misread.
  select cp.creator_id, cp.platform, w.win,
    coalesce(
      sum(cp.cur_views) filter (where w.since is null or cp.posted_at >= w.since),
      0
    )::bigint as total_views
  from cur_post cp
  cross join windows w
  group by cp.creator_id, cp.platform, w.win;
$$;
