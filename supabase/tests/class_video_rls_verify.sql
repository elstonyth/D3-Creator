-- supabase/tests/class_video_rls_verify.sql
-- Verifies class_video visibility per role. Runs in a rolled-back txn.
-- Usage: supabase db execute --file supabase/tests/class_video_rls_verify.sql

begin;

-- a non-admin member, used to simulate an authenticated session
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1','member@test.local')
  on conflict (id) do nothing;
-- handle_new_auth_user may have inserted a role row already; force it to member
insert into public.user_role (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1','member')
  on conflict (user_id) do update set role = 'member';

-- an admin, to verify admins see drafts
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c2','admin@test.local')
  on conflict (id) do nothing;
insert into public.user_role (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c2','admin')
  on conflict (user_id) do update set role = 'admin';

-- a revoked (none) user: must see only public, like anon
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c3','revoked@test.local')
  on conflict (id) do nothing;
insert into public.user_role (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c3','none')
  on conflict (user_id) do update set role = 'none';

insert into public.class_video (id, title, drive_file_id, visibility, is_published) values
  ('00000000-0000-0000-0000-0000000000d1','Public Live','idpub','public',true),
  ('00000000-0000-0000-0000-0000000000d2','Members Live','idmem','members',true),
  ('00000000-0000-0000-0000-0000000000d3','Draft','iddraft','members',false);

do $$
declare n int;
begin
  -- ANON: only the published public row
  set local role anon;
  select count(*) into n from public.class_video;
  if n is distinct from 1 then raise exception 'FAIL anon: expected 1 row, got %', n; end if;

  -- AUTHENTICATED member: both published rows, not the draft
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
  select count(*) into n from public.class_video;
  if n is distinct from 2 then raise exception 'FAIL member: expected 2 rows, got %', n; end if;
  select count(*) into n from public.class_video where is_published = false;
  if n is distinct from 0 then raise exception 'FAIL member: draft leaked'; end if;

  -- ADMIN: sees all 3 rows INCLUDING the draft (role is still authenticated;
  -- only the jwt sub changes to the admin user, and is_admin() keys off it)
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
  select count(*) into n from public.class_video;
  if n is distinct from 3 then raise exception 'FAIL admin: expected 3 rows, got %', n; end if;
  select count(*) into n from public.class_video where is_published = false;
  if n is distinct from 1 then raise exception 'FAIL admin: expected 1 draft visible, got %', n; end if;

  -- NONE (revoked): only the published public row, like anon
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
  select count(*) into n from public.class_video;
  if n is distinct from 1 then raise exception 'FAIL none: expected 1 public row, got %', n; end if;
  select count(*) into n from public.class_video where visibility = 'members';
  if n is distinct from 0 then raise exception 'FAIL none: saw a members-only row'; end if;

  reset role;
  raise notice 'CLASS_VIDEO RLS ASSERTIONS PASSED';
end $$;

rollback;
