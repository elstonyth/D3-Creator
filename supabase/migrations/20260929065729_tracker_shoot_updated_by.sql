-- Who last changed a shoot: moved it, gave it another account, cancelled or
-- reopened it. The app stamps it on every such change (shoot-actions.ts), so
-- a change someone else made for a person — the admin — pops up for them
-- (WorkAlerts). Nullable: shoots changed before this, and a login since
-- deleted, name nobody. Additive: the running app never reads it.
alter table public.tracker_shoot
  add column updated_by uuid references auth.users (id) on delete set null;
