-- Fix admin-email matching in handle_new_auth_user.
--
-- The prior implementation (carried since 20260528000000, recreated in
-- 20260629000001) used substring matching:
--   position(lower(new.email) in lower(v_admin_emails)) > 0
-- so a configured admin 'alice@example.com' would ALSO grant admin to anyone
-- signing up as 'lice@example.com' (a substring) — a privilege-escalation hole,
-- now reachable since public signup is open.
--
-- Fix: split app.admin_emails into trimmed, lowercased tokens and require an
-- EXACT equality match. Only the email-match logic changes; the member default
-- and the user_role + creator_link inserts are unchanged from 20260629000001.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_emails text;
  v_role text := 'member';
begin
  v_admin_emails := trim(coalesce(current_setting('app.admin_emails', true), ''));
  if v_admin_emails <> ''
     and lower(new.email) = any(
       regexp_split_to_array(lower(v_admin_emails), '\s*,\s*')
     ) then
    v_role := 'admin';
  end if;

  insert into public.user_role (user_id, role) values (new.id, v_role);
  insert into public.creator_link (user_id) values (new.id);

  return new;
end;
$$;
