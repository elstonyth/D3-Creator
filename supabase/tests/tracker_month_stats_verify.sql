-- Regression guard for the account board's month numbers
-- (tracker_creator_month_stats, migration 20260929120000): Instagram only,
-- videos only (reels and the adapter's other 'video' posts), each post once at
-- its latest snapshot, inside the month. Not run by CI — run it by hand
-- against the local stack (or any database) after touching the function.
--
-- Runs inside a transaction that is ROLLED BACK at the end — touches no real
-- data. Raises on the first failed assertion; prints success then rolls back.
--
-- Usage:
--   docker exec -i supabase_db_D3-Creator psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/tracker_month_stats_verify.sql

begin;

insert into public.creator (id, display_name) values
  ('00000000-0000-0000-0000-00000000a501', 'MONTH-STATS Creator'),
  ('00000000-0000-0000-0000-00000000a502', 'MONTH-STATS TikTok only');

insert into public.profile (id, creator_id, platform, profile_url, handle) values
  ('00000000-0000-0000-0000-00000000a511', '00000000-0000-0000-0000-00000000a501',
   'instagram', 'https://instagram.com/monthstats', 'monthstats'),
  ('00000000-0000-0000-0000-00000000a512', '00000000-0000-0000-0000-00000000a501',
   'tiktok', 'https://tiktok.com/@monthstats', 'monthstats'),
  ('00000000-0000-0000-0000-00000000a513', '00000000-0000-0000-0000-00000000a502',
   'tiktok', 'https://tiktok.com/@monthstats2', 'monthstats2');

insert into public.post_snapshot
  (profile_id, external_post_id, captured_date, captured_at, posted_at, content_type, views) values
  -- A reel seen twice: counted once, at its latest views (500, not 100).
  ('00000000-0000-0000-0000-00000000a511', 'reel-A', '2099-01-10', '2099-01-10T01:00:00Z', '2099-01-05T12:00:00+08', 'reel', 100),
  ('00000000-0000-0000-0000-00000000a511', 'reel-A', '2099-01-11', '2099-01-11T01:00:00Z', '2099-01-05T12:00:00+08', 'reel', 500),
  -- Another kind of Instagram video (IGTV, a feed video): counted.
  ('00000000-0000-0000-0000-00000000a511', 'video-B', '2099-01-11', '2099-01-11T01:00:00Z', '2099-01-20T12:00:00+08', 'video', 200),
  -- An image post: not a video.
  ('00000000-0000-0000-0000-00000000a511', 'image-C', '2099-01-11', '2099-01-11T01:00:00Z', '2099-01-21T12:00:00+08', 'image', null),
  -- A reel from the month before (23:59 +08 on the last day): not this month.
  ('00000000-0000-0000-0000-00000000a511', 'reel-D', '2099-01-11', '2099-01-11T01:00:00Z', '2098-12-31T23:59:00+08', 'reel', 7777),
  -- The same creator's TikTok: another platform, not counted.
  ('00000000-0000-0000-0000-00000000a512', 'short-E', '2099-01-11', '2099-01-11T01:00:00Z', '2099-01-06T12:00:00+08', 'short', 9999),
  ('00000000-0000-0000-0000-00000000a513', 'short-F', '2099-01-11', '2099-01-11T01:00:00Z', '2099-01-06T12:00:00+08', 'short', 8888);

do $$
declare
  r record;
  n int;
begin
  select count(*) into n
  from public.tracker_creator_month_stats('2099-01-01T00:00:00+08', '2099-02-01T00:00:00+08')
  where creator_id = '00000000-0000-0000-0000-00000000a502';
  if n <> 0 then
    raise exception 'FAIL: a TikTok-only creator got a row (%)', n;
  end if;

  select * into r
  from public.tracker_creator_month_stats('2099-01-01T00:00:00+08', '2099-02-01T00:00:00+08')
  where creator_id = '00000000-0000-0000-0000-00000000a501';
  if r is null then
    raise exception 'FAIL: no row for the Instagram creator';
  end if;
  if r.videos <> 2 or r.posts <> 2 or r.views <> 700 then
    raise exception 'FAIL: expected 2 videos / 2 posts / 700 views, got % / % / %',
      r.videos, r.posts, r.views;
  end if;

  raise notice 'PASS: tracker_creator_month_stats counts Instagram videos once, in the month';
end $$;

rollback;
