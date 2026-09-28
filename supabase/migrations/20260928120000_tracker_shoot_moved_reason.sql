-- Why a shoot was moved to another day or time. The owner: staff change a
-- shoot's time themselves, and say why (the client changed it, and so on).
-- The app writes it when a shoot's day changes, or a time it had changes;
-- only the latest reason is kept. NULL = never moved.
--
-- The check passes on NULL; a reason written must be 1-200 characters.
--
-- Apply BEFORE deploying the app that reads it: the new app selects the
-- column on every shoot read. The old app never names it, so applying first
-- breaks nothing.
alter table public.tracker_shoot
  add column moved_reason text
  check (char_length(moved_reason) between 1 and 200);
