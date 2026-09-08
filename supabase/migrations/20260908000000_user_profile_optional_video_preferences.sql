-- Setup now collects only what the business sells and who buys it.
-- Keep existing answers and vocabulary CHECKs; never guess either preference.
alter table public.user_profile
  alter column main_platform drop not null,
  alter column on_camera drop not null;
