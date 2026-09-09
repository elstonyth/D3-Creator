-- Covering index for the public-page aggregate RPCs.
--
-- public_creator_rows() and public_content_rows() both compute
--   DISTINCT ON (profile_id, external_post_id) ... ORDER BY profile_id,
--   external_post_id, captured_at DESC, id DESC
-- and MAX(views) GROUP BY (profile_id, external_post_id) over the whole
-- post_snapshot table. The only matching index was on captured_date, so the
-- planner walked idx_post_snapshot_profile_post_date and fetched every one of
-- the ~124k heap tuples in index order: ~122k buffer hits per call, ~95k on
-- average across 89k production calls (pg_stat_statements, 2026-09-09).
-- With anon's 3 s statement_timeout that timed out on 353 of 1,655 homepage
-- renders in one day, and every timeout falls back to the synthetic demo rows.
--
-- This index matches the DISTINCT ON order exactly and carries the four
-- counters the creator RPC reads, so that RPC becomes an index-only scan with
-- no sort. The content RPC still needs caption/media columns from the heap
-- but no longer sorts.
create index if not exists post_snapshot_post_latest_idx
  on public.post_snapshot (profile_id, external_post_id, captured_at desc, id desc)
  include (views, likes, comments, shares);
