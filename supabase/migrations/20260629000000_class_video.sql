-- Online-classes catalog. Videos are embedded from Google Drive (file ID only;
-- not re-hosted). RLS is the real gate: anon sees published+public, any
-- authenticated user (member/creator/admin) sees all published, admins manage
-- everything including drafts. Writes are admin-only (no anon/auth write policy).

create table public.class_video (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  drive_file_id  text not null,
  visibility     text not null default 'members' check (visibility in ('public','members')),
  is_published   boolean not null default false,
  allow_download boolean not null default false,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index class_video_published_idx on public.class_video (is_published, sort_order);

create trigger class_video_updated_at before update on public.class_video
  for each row execute function public.set_updated_at();

alter table public.class_video enable row level security;

-- anon: only published public rows
create policy "anon reads public classes"
  on public.class_video for select to anon
  using (is_published and visibility = 'public');

-- any logged-in user (member/creator/admin): all published rows
create policy "authenticated reads published classes"
  on public.class_video for select to authenticated
  using (is_published);

-- admins: full read (incl. drafts) + write
create policy "admin manages class_video"
  on public.class_video for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
