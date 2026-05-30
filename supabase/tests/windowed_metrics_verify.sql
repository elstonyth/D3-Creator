-- Standalone verification for the Phase 0 windowed-metrics RPCs.
--
-- Runs entirely inside a transaction that is ROLLED BACK at the end, so it
-- touches no real data. Safe to run against any environment that already has
-- the RPCs applied (the migration 20260530000000_windowed_metrics_rpcs.sql).
--
-- Usage (pick one):
--   supabase db execute --file supabase/tests/windowed_metrics_verify.sql
--   psql "$DATABASE_URL" -f supabase/tests/windowed_metrics_verify.sql
--
-- It RAISES EXCEPTION on the first failed assertion (non-zero exit), prints
-- "ALL WINDOWED-METRICS ASSERTIONS PASSED" on success, then rolls back.

begin;

-- ---- Seed fixture (fixed UUIDs) ------------------------------------------
insert into public.creator (id, display_name)
values ('00000000-0000-0000-0000-0000000c0001','TEST Creator');

insert into public.profile (id, creator_id, platform, profile_url, handle)
values ('00000000-0000-0000-0000-0000000d0001',
        '00000000-0000-0000-0000-0000000c0001',
        'tiktok','https://tiktok.com/@test','test');

insert into public.profile_snapshot (profile_id, captured_date, followers) values
  ('00000000-0000-0000-0000-0000000d0001', current_date-40, 1000),
  ('00000000-0000-0000-0000-0000000d0001', current_date-7,  1100),
  ('00000000-0000-0000-0000-0000000d0001', current_date-0,  1200);

insert into public.post_snapshot
  (profile_id, external_post_id, captured_date, views, likes, comments, shares) values
  ('00000000-0000-0000-0000-0000000d0001','A', current_date-40, 1000,0,0,0),
  ('00000000-0000-0000-0000-0000000d0001','A', current_date-7,  4500,0,0,0),
  ('00000000-0000-0000-0000-0000000d0001','A', current_date-0,  5000,200,50,50),
  ('00000000-0000-0000-0000-0000000d0001','B', current_date-20, 500,0,0,0),
  ('00000000-0000-0000-0000-0000000d0001','B', current_date-0,  2000,100,20,30),
  ('00000000-0000-0000-0000-0000000d0001','C', current_date-0,  0,80,10,0);

-- ---- Assert creator_metrics_windowed across all 4 windows ----------------
do $$
declare
  r record;
  expected jsonb := jsonb_build_object(
    -- window -> [views_gained, followers_delta, post_count, insufficient(0/1)]
    '7d',       jsonb_build_array(2000, 100, 2, 0),
    '30d',      jsonb_build_array(6000, 200, 2, 0),
    '90d',      jsonb_build_array(7000, 0,   2, 1),
    'lifetime', jsonb_build_array(7000, 200, 2, 0)
  );
  w text;
  exp jsonb;
begin
  foreach w in array array['7d','30d','90d','lifetime'] loop
    select * into r from public.creator_metrics_windowed(w)
      where creator_id = '00000000-0000-0000-0000-0000000c0001';
    exp := expected -> w;

    if r.views_gained <> (exp->>0)::bigint then
      raise exception 'FAIL %: views_gained = % (expected %)', w, r.views_gained, exp->>0;
    end if;
    if r.followers_delta <> (exp->>1)::bigint then
      raise exception 'FAIL %: followers_delta = % (expected %)', w, r.followers_delta, exp->>1;
    end if;
    if r.post_count <> (exp->>2)::int then
      raise exception 'FAIL %: post_count = % (expected %)', w, r.post_count, exp->>2;
    end if;
    if (r.insufficient)::int <> (exp->>3)::int then
      raise exception 'FAIL %: insufficient = % (expected %)', w, r.insufficient, exp->>3;
    end if;
    -- engagement = (200+50+50 + 100+20+30) / (5000+2000) = 450/7000 = 0.0643
    if round(r.engagement, 4) <> 0.0643 then
      raise exception 'FAIL %: engagement = % (expected 0.0643)', w, r.engagement;
    end if;
  end loop;

  -- ---- Assert top_content_windowed ranking + no-view exclusion -----------
  -- Top by 30d views_gained must be A(4000), then B(2000), then C(0).
  perform 1;
  if (select array_agg(external_post_id order by views_gained desc)
        from public.top_content_windowed('30d', 10)
        where creator_id = '00000000-0000-0000-0000-0000000c0001')
     <> array['A','B','C'] then
    raise exception 'FAIL top_content_windowed: ranking mismatch';
  end if;

  raise notice 'ALL WINDOWED-METRICS ASSERTIONS PASSED';
end $$;

rollback;
