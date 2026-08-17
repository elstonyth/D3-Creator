-- Drop the dead OAuth / owned-insights schema.
--
-- The owned-accounts "Connect your accounts" feature (Meta + TikTok) was removed
-- in PR #50 (35b73c36) after Meta App Review was abandoned. That PR deliberately
-- deferred the irreversible half: these tables, their RPCs, and the
-- profile_claim.claimed_via 'oauth' value. This is that follow-up.
--
-- Verified 2026-08-17: all four tables hold 0 rows, no profile_claim row uses
-- claimed_via='oauth', nothing in apps/ or libraries/ references these objects,
-- and no view depends on them.
--
-- Clears 8 of 13 Supabase security-advisor lints (4x rls_enabled_no_policy +
-- 4x authenticated_security_definer_function_executable) that were noise for
-- deleted code and were burying the real ones.
--
-- NOTE: these tables were RLS-enabled with no policies (deny-all) and the admin
-- RPC was is_admin()-gated, so this is housekeeping, not a vulnerability fix.

-- Functions first: they reference the tables.
drop function if exists public.get_my_oauth_connections();
drop function if exists public.get_admin_oauth_connections(uuid);
drop function if exists public.get_my_owned_insights(uuid, integer);
drop function if exists public.get_admin_owned_insights(uuid, integer);

-- Then the tables. No CASCADE on purpose: if something unexpected depends on
-- these, this migration must fail loudly rather than silently drop the dependent.
drop table if exists public.owned_audience_demographic;
drop table if exists public.owned_post_insight;
drop table if exists public.owned_profile_insight;
drop table if exists public.oauth_connection;

-- Retire the now-unreachable 'oauth' claim source. Safe only because no row uses
-- it; a surviving row would abort the whole migration.
alter table public.profile_claim
  drop constraint if exists profile_claim_claimed_via_check;
alter table public.profile_claim
  add constraint profile_claim_claimed_via_check
  check (claimed_via = any (array['manual'::text, 'auto_discovery'::text, 'admin_assigned'::text]));
