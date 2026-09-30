-- creator_metrics_windowed: stop one bad profile from hiding a whole creator.
--
-- Two fixes, both about the follower baseline behind the admin "Top creators"
-- 30-day growth list:
--
-- 1. Skip snapshots whose followers is NULL. A banned/dead account keeps
--    getting snapshots with followers = NULL; when such a row landed on the
--    baseline date, base_f went NULL and the creator was flagged insufficient.
--    Current, earliest and baseline followers now read the nearest non-NULL
--    value instead.
--
-- 2. insufficient = bool_and (was bool_or). A creator is "Building history"
--    only when NONE of their profiles has a baseline. Previously a single
--    newly added or re-pointed profile demoted a long-tracked creator out of
--    the ranking for 30 days. Profiles without a baseline still contribute 0
--    to followers_delta, exactly as before.
create or replace function public.creator_metrics_windowed(
  p_window text default '30d',
  p_creator_ids uuid[] default null,
  p_profile_ids uuid[] default null
)
returns table(
  creator_id uuid, display_name text, avatar_url text,
  primary_platform text, primary_handle text,
  followers bigint, followers_delta bigint, views_gained bigint,
  engagement numeric, post_count integer, insufficient boolean
)
language plpgsql
stable
set search_path to ''
as $function$
#variable_conflict use_column
begin
  if p_window not in ('7d','30d','90d','lifetime') then
    raise exception 'invalid p_window: % (expected one of 7d, 30d, 90d, lifetime)', p_window;
  end if;

  return query
  with
  params as (
    select case p_window
      when '7d' then current_date - 7
      when '30d' then current_date - 30
      when '90d' then current_date - 90
      else null end as baseline
  ),
  scope_profile as (
    select pr.id, pr.creator_id, pr.platform, pr.handle from public.profile pr
    where pr.platform <> 'rednote'
      and (p_profile_ids is null or pr.id = any(p_profile_ids))
      and (p_creator_ids is null or pr.creator_id = any(p_creator_ids))
  ),
  cur_foll as (
    select distinct on (ps.profile_id) ps.profile_id, ps.followers as cur_f
    from public.profile_snapshot ps join scope_profile sp on sp.id = ps.profile_id
    where ps.followers is not null
    order by ps.profile_id, ps.captured_date desc
  ),
  early_foll as (
    select distinct on (ps.profile_id) ps.profile_id, ps.followers as early_f
    from public.profile_snapshot ps join scope_profile sp on sp.id = ps.profile_id
    where ps.followers is not null
    order by ps.profile_id, ps.captured_date asc
  ),
  base_foll as (
    select sp.id as profile_id,
      case when (select baseline from params) is null then ef.early_f
           else (select ps.followers from public.profile_snapshot ps
                 where ps.profile_id = sp.id and ps.captured_date <= (select baseline from params)
                   and ps.followers is not null
                 order by ps.captured_date desc limit 1)
      end as base_f
    from scope_profile sp left join early_foll ef on ef.profile_id = sp.id
  ),
  cur_post as (
    select distinct on (pp.profile_id, pp.external_post_id)
      pp.profile_id, pp.external_post_id, pp.views as cur_views,
      (coalesce(pp.likes,0)+coalesce(pp.comments,0)+coalesce(pp.shares,0)) as eng,
      pp.captured_date as cur_date
    from public.post_snapshot pp join scope_profile sp on sp.id = pp.profile_id
    order by pp.profile_id, pp.external_post_id, pp.captured_date desc
  ),
  base_post as (
    select cp.profile_id, cp.external_post_id,
      (select pp.views from public.post_snapshot pp
       where pp.profile_id = cp.profile_id and pp.external_post_id = cp.external_post_id
         and (select baseline from params) is not null
         and pp.captured_date <= (select baseline from params)
       order by pp.captured_date desc limit 1) as base_views
    from cur_post cp
  ),
  post_calc as (
    select cp.profile_id,
      greatest(coalesce(cp.cur_views,0) - coalesce(bp.base_views,0), 0) as gained,
      cp.cur_views, cp.eng,
      (coalesce(cp.cur_views,0) > 0
        and ((select baseline from params) is null or cp.cur_date >= (select baseline from params))) as qualifies
    from cur_post cp
    left join base_post bp on bp.profile_id = cp.profile_id and bp.external_post_id = cp.external_post_id
  ),
  post_calc_agg as (
    select profile_id,
      sum(gained) as views_gained,
      sum(eng) filter (where qualifies) as eng_sum,
      sum(cur_views) filter (where qualifies) as view_sum,
      count(*) filter (where qualifies) as qual_posts
    from post_calc
    group by profile_id
  ),
  per_profile as (
    select sp.id as profile_id, sp.creator_id, sp.platform, sp.handle,
      coalesce(cf.cur_f,0) as cur_f, bf.base_f,
      coalesce(pca.views_gained,0) as views_gained,
      coalesce(pca.eng_sum,0) as eng_sum,
      coalesce(pca.view_sum,0) as view_sum,
      coalesce(pca.qual_posts,0) as qual_posts
    from scope_profile sp
    left join cur_foll cf on cf.profile_id = sp.id
    left join base_foll bf on bf.profile_id = sp.id
    left join post_calc_agg pca on pca.profile_id = sp.id
  ),
  primary_pick as (
    select distinct on (creator_id) creator_id, platform, handle
    from per_profile order by creator_id, cur_f desc, platform
  )
  select c.id, c.display_name, c.avatar_url, pp.platform, pp.handle,
    sum(p.cur_f)::bigint,
    sum(case when p.base_f is null then 0 else p.cur_f - p.base_f end)::bigint,
    sum(p.views_gained)::bigint,
    round(coalesce(sum(p.eng_sum),0)::numeric / nullif(sum(p.view_sum),0), 4),
    sum(p.qual_posts)::int,
    bool_and(p.base_f is null)
  from per_profile p
  join public.creator c on c.id = p.creator_id
  left join primary_pick pp on pp.creator_id = p.creator_id
  group by c.id, c.display_name, c.avatar_url, pp.platform, pp.handle;
end;
$function$;
