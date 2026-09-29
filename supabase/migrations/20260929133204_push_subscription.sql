-- Push notifications for the Work Tracker (the owner's call, 2026-09-29):
-- the pop-up's news reaches a phone with the portal closed.
--
-- push_subscription: one row per browser that turned notifications on
-- (lib/team/push-actions.ts), filed under the signed-in login. Saving again
-- from the same browser moves it to whoever is signed in there now. The
-- server reads it with the service role to send (lib/team/push.ts); nobody
-- else can read or write it.
create table public.push_subscription (
  endpoint   text primary key check (char_length(endpoint) <= 1000),
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) <= 100),
  auth       text not null check (char_length(auth) <= 30),
  -- The device's language: pushes are worded in it.
  locale     text not null default 'en' check (locale in ('en', 'zh')),
  -- Where a tap lands, on the host the device subscribed from.
  path       text not null default '/' check (char_length(path) <= 61),
  created_at timestamptz not null default now()
);

create index push_subscription_user_id_idx on public.push_subscription (user_id);

revoke all on table public.push_subscription from anon, authenticated;
alter table public.push_subscription enable row level security;

-- The due-shoot reminder (app/api/cron/work-due): the push time a shoot was
-- last reminded for. A moved shoot has a new push time, so it is reminded
-- again; the same one never twice.
alter table public.tracker_shoot add column due_pushed_for timestamptz;
