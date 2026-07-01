-- Tighten class_video read policy: a 'none' (revoked) user must see only public
-- classes, like anon — not members-only content. The original authenticated
-- policy granted ALL published rows to any authenticated session regardless of
-- role, which let revoked users keep class access (contradicting the admin
-- "none revokes access" semantics). Members/creators/admins keep full access.

drop policy "authenticated reads published classes" on public.class_video;

create policy "authenticated reads published classes"
  on public.class_video for select to authenticated
  using (
    is_published and (
      visibility = 'public'
      or exists (
        select 1 from public.user_role ur
        where ur.user_id = (select auth.uid())
          and ur.role in ('member','creator','admin')
      )
    )
  );
