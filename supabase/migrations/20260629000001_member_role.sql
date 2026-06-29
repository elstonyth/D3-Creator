-- supabase/migrations/20260629000001_member_role.sql
-- Re-open public signup: new self-signups become 'member' (online-class
-- watchers), not 'creator'. Admin provisioning (admin/actions.ts and
-- creators/[id]/actions.ts) now sets role='creator' explicitly after createUser,
-- so flipping the trigger default here does NOT make provisioned creators members.
-- Adds 'member' and 'none' (revoked) to the allowed role set.

alter table public.user_role drop constraint user_role_role_check;
alter table public.user_role add constraint user_role_role_check
  check (role in ('admin','creator','member','none'));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_emails text;
  v_role text := 'member';            -- was 'creator'; public signups are members now
begin
  v_admin_emails := coalesce(current_setting('app.admin_emails', true), '');
  if v_admin_emails <> '' and position(lower(new.email) in lower(v_admin_emails)) > 0 then
    v_role := 'admin';
  end if;

  insert into public.user_role (user_id, role) values (new.id, v_role);
  insert into public.creator_link (user_id) values (new.id);

  return new;
end;
$$;
