-- Index for the Work Tracker's monthly stats RPC.
--
-- tracker_creator_month_stats(p_from, p_to) filters post_snapshot on
-- posted_at, and nothing indexed that column: the planner walked the whole
-- table (128,613 rows, 125,354 removed by the filter) for a 3,259-row month.
-- Measured 2026-09-22: 3.5 s for that scan alone, 2.5 s mean / 8.0 s max
-- across 61 production calls, and two /admin/tracker renders hit the
-- statement timeout on the first day.
create index if not exists post_snapshot_posted_at_idx
  on public.post_snapshot (posted_at);
