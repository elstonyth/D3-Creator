# Online Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A members-only library of Google-Drive-hosted online-class videos, with admin catalog management, re-opened public signup, and an admin role-governance screen.

**Architecture:** New `class_video` table (Drive file IDs + visibility/publish/download flags) protected by RLS. Public `/classes` list + `/classes/[id]` Drive-embed player gated by login for members-only rows. Admin CRUD at `/admin/classes` and role management at `/admin/users`. Signup re-opened: the `handle_new_auth_user` trigger now defaults new logins to `member`; admin provisioning explicitly sets `creator`.

**Tech Stack:** Next.js App Router (React 19) Server Components + Server Actions, Supabase Postgres + RLS, Tailwind 3, Jest (frontend unit tests), psql/`supabase db execute` (SQL RLS tests).

## Global Constraints

- pnpm only. Lint runs from repo root. `pnpm lint` and `pnpm test` do **not** run `tsc`; the CI `build` job does — keep types clean.
- Frontend unit tests run: `cd apps/frontend && npx jest --testMatch "**/src/**/*.test.ts" --testMatch "**/src/**/*.test.tsx" --no-coverage` (worktree-safe form).
- Migrations live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_<slug>.sql`. All new functions/triggers: `security definer` + `set search_path = ''` (existing hardening convention).
- Supabase clients: `getSupabaseRead()` = anon read-only (public showcase); `getSupabaseRoute()` = cookie-aware (session-scoped, respects RLS); `getSupabaseAdmin()` from `@d3/database` = service_role (admin pages/actions, bypasses RLS). Import alias for frontend code is `@gitroom/frontend/...`.
- Admin actions re-check `requireAdmin()` (defense-in-depth) and return result objects, never throw to the client. Mirror `apps/frontend/src/app/(admin)/admin/actions.ts`.
- UI must match `DESIGN.md` and reuse `apps/frontend/src/components/ui/`. Use existing tokens (`glass-elevated`, `text-fg`, `text-fgMuted`, `border-borderGlass`, `text-aurora-cta`, etc.).
- Roles are a fixed set: `admin` | `creator` | `member` | `none`. No runtime role creation.

---

### Task 1: `class_video` table + RLS

**Files:**

- Create: `supabase/migrations/20260629000000_class_video.sql`
- Test: `supabase/tests/class_video_rls_verify.sql`

**Interfaces:**

- Produces: table `public.class_video(id uuid, title text, description text, drive_file_id text, visibility text, is_published boolean, allow_download boolean, sort_order int, created_at, updated_at)`. RLS: anon → published+public; authenticated → all published; admin (`is_admin()`) → all + write.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260629000000_class_video.sql
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
```

- [ ] **Step 2: Write the RLS verification test**

```sql
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

insert into public.class_video (id, title, drive_file_id, visibility, is_published) values
  ('00000000-0000-0000-0000-0000000000d1','Public Live','idpub','public','true'),
  ('00000000-0000-0000-0000-0000000000d2','Members Live','idmem','members','true'),
  ('00000000-0000-0000-0000-0000000000d3','Draft','iddraft','members','false');

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

  reset role;
  raise notice 'CLASS_VIDEO RLS ASSERTIONS PASSED';
end $$;

rollback;
```

- [ ] **Step 3: Apply the migration (requires user approval for prod)**

Apply via the Supabase MCP `apply_migration` (per `[[supabase-migration-apply-gotchas]]` the classifier needs explicit per-action OK), OR `supabase db push` if reconciled. Name: `class_video`.

- [ ] **Step 4: Run the RLS test**

Run: `supabase db execute --file supabase/tests/class_video_rls_verify.sql`
Expected: `NOTICE: CLASS_VIDEO RLS ASSERTIONS PASSED` (no FAIL exception).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260629000000_class_video.sql supabase/tests/class_video_rls_verify.sql
git commit -m "feat(classes): class_video table + RLS"
```

---

### Task 2: Drive file-ID parser

**Files:**

- Create: `apps/frontend/src/lib/drive.ts`
- Test: `apps/frontend/src/lib/drive.test.ts`

**Interfaces:**

- Produces: `parseDriveFileId(input: string): string | null` — extracts the file ID from any common Drive URL shape or a bare ID; returns `null` if none. `drivePreviewUrl(id)` and `driveDownloadUrl(id)` builders.

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/lib/drive.test.ts
import { parseDriveFileId, drivePreviewUrl, driveDownloadUrl } from './drive';

const ID = '1AbC_def-GHI23';

describe('parseDriveFileId', () => {
  it('parses /file/d/<id>/view', () => {
    expect(
      parseDriveFileId(
        `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
      ),
    ).toBe(ID);
  });
  it('parses open?id=<id>', () => {
    expect(parseDriveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });
  it('parses uc?id=<id>', () => {
    expect(
      parseDriveFileId(`https://drive.google.com/uc?export=download&id=${ID}`),
    ).toBe(ID);
  });
  it('accepts a bare id', () => {
    expect(parseDriveFileId(ID)).toBe(ID);
  });
  it('rejects junk', () => {
    expect(parseDriveFileId('https://example.com/not-drive')).toBeNull();
    expect(parseDriveFileId('')).toBeNull();
  });
});

describe('url builders', () => {
  it('builds preview + download urls', () => {
    expect(drivePreviewUrl(ID)).toBe(
      `https://drive.google.com/file/d/${ID}/preview`,
    );
    expect(driveDownloadUrl(ID)).toBe(
      `https://drive.google.com/uc?export=download&id=${ID}`,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx jest --testMatch "**/src/lib/drive.test.ts" --no-coverage`
Expected: FAIL — `Cannot find module './drive'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/frontend/src/lib/drive.ts
/**
 * Google Drive file-ID parsing + embed/download URL builders for the online
 * classes catalog. Admins paste any Drive link; we store only the file ID.
 */
const FILE_D = /\/file\/d\/([a-zA-Z0-9_-]+)/; // /file/d/<id>/view
const ID_PARAM = /[?&]id=([a-zA-Z0-9_-]+)/; // open?id=<id> / uc?id=<id>
const BARE = /^[a-zA-Z0-9_-]{10,}$/; // a bare id

export function parseDriveFileId(input: string): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = s.match(FILE_D) ?? s.match(ID_PARAM);
  if (m) return m[1];
  if (BARE.test(s)) return s;
  return null;
}

export function drivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function driveDownloadUrl(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${id}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx jest --testMatch "**/src/lib/drive.test.ts" --no-coverage`
Expected: PASS (all 7 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/drive.ts apps/frontend/src/lib/drive.test.ts
git commit -m "feat(classes): drive file-id parser + url builders"
```

---

### Task 3: Public `/classes` list + `/classes/[id]` player

**Files:**

- Create: `apps/frontend/src/app/(public)/classes/page.tsx`
- Create: `apps/frontend/src/app/(public)/classes/[id]/page.tsx`

**Interfaces:**

- Consumes: `getSupabaseRoute()`, `getAuthContext()`, `parseDriveFileId`/`drivePreviewUrl`/`driveDownloadUrl` (Task 2), `class_video` table (Task 1), `isUuid` from `@gitroom/frontend/lib/ids`.

> The list/player use `getSupabaseRoute()` (session-aware). RLS does the gating automatically: anon → published+public only; logged-in → all published. The player additionally redirects anon away from members-only rows so they get a login prompt rather than a silent "not found".

- [ ] **Step 1: Write the list page**

```tsx
// apps/frontend/src/app/(public)/classes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Online Classes — D3 Creator' };

export default async function ClassesPage() {
  const auth = await getAuthContext();
  const supabase = await getSupabaseRoute();
  const { data: videos } = await supabase
    .from('class_video')
    .select('id, title, description, visibility')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-8 py-12 flex flex-col gap-8">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Online classes.</h1>
        <p className="text-body-lg text-fgMuted">
          Watch our class library.{' '}
          {auth
            ? 'You have member access.'
            : 'Public sessions are open to all.'}
        </p>
      </header>

      {!auth && (
        <Link
          href="/login?redirectTo=/classes"
          className="glass-subtle border border-borderGlass rounded-xl px-5 py-4 text-label text-aurora-cta hover:bg-white/[0.04] transition-colors"
        >
          Log in to unlock member classes →
        </Link>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(videos ?? []).map((v) => (
          <Link
            key={v.id}
            href={`/classes/${v.id}`}
            className="glass-elevated rounded-2xl p-5 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-caption text-fgSubtle uppercase tracking-wide">
                {v.visibility === 'members' ? 'Members' : 'Public'}
              </span>
            </div>
            <h2 className="text-heading text-fg">{v.title}</h2>
            {v.description && (
              <p className="text-caption text-fgMuted line-clamp-2">
                {v.description}
              </p>
            )}
          </Link>
        ))}
        {(videos ?? []).length === 0 && (
          <p className="text-body text-fgMuted">No classes published yet.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Write the player page**

```tsx
// apps/frontend/src/app/(public)/classes/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { drivePreviewUrl, driveDownloadUrl } from '@gitroom/frontend/lib/drive';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Class — D3 Creator' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClassPlayerPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const auth = await getAuthContext();
  const supabase = await getSupabaseRoute();
  const { data: video } = await supabase
    .from('class_video')
    .select('id, title, description, drive_file_id, visibility, allow_download')
    .eq('id', id)
    .maybeSingle();

  // RLS already hides drafts + (for anon) members-only rows. If a not-logged-in
  // user requested a members-only class, RLS returns null — send them to login
  // instead of a bare 404 so they can sign in and come back.
  if (!video) {
    if (!auth) redirect(`/login?redirectTo=/classes/${id}`);
    notFound();
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 md:px-8 py-12 flex flex-col gap-6">
      <Link
        href="/classes"
        className="text-caption text-fgMuted hover:text-fg transition-colors"
      >
        ← All classes
      </Link>
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-borderGlass bg-black">
        <iframe
          src={drivePreviewUrl(video.drive_file_id)}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full"
          title={video.title}
        />
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-display-2 text-fg">{video.title}</h1>
        {video.description && (
          <p className="text-body text-fgMuted">{video.description}</p>
        )}
        {video.allow_download && (
          <a
            href={driveDownloadUrl(video.drive_file_id)}
            className="text-label text-aurora-cta underline underline-offset-4 w-fit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download video
          </a>
        )}
      </header>
    </div>
  );
}
```

- [ ] **Step 3: Add a "Classes" link to the public navigation**

In the public header/nav component (find it under `apps/frontend/src/components/layout/` — the one rendering the public top bar), add a `<NavLink href="/classes">Classes</NavLink>` alongside the existing public links, matching their markup. (If no shared public nav exists, add the link to `apps/frontend/src/app/(public)/layout.tsx` header.)

- [ ] **Step 4: Verify types + lint**

Run: `cd apps/frontend && npx tsc --noEmit && cd ../.. && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Start preview (port 4200). As anon, `/classes` shows only public classes + the login banner; opening a members-only id redirects to `/login`. (Full member-visible check happens after Task 6 enables signup; for now log in as the seeded admin is bounced to /admin — verify anon behavior here.)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/(public)/classes
git commit -m "feat(classes): public list + drive-embed player"
```

---

### Task 4: Admin `/admin/classes` CRUD

**Files:**

- Create: `apps/frontend/src/app/(admin)/admin/classes/actions.ts`
- Create: `apps/frontend/src/app/(admin)/admin/classes/page.tsx`
- Create: `apps/frontend/src/app/(admin)/admin/classes/class-manager.tsx`
- Modify: `apps/frontend/src/app/(admin)/layout.tsx` (add nav link)

**Interfaces:**

- Consumes: `requireAdmin`, `getSupabaseAdmin`, `parseDriveFileId` (Task 2), `isUuid`.
- Produces: server actions `createClassVideo(_prev, formData)`, `updateClassVideo(_prev, formData)`, `deleteClassVideo(id)`, each returning `{ ok: boolean; message: string }`.

- [ ] **Step 1: Write the actions**

```ts
// apps/frontend/src/app/(admin)/admin/classes/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { parseDriveFileId } from '@gitroom/frontend/lib/drive';

export interface ClassResult {
  ok: boolean;
  message: string;
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : 'Unexpected error';
}

function readFields(fd: FormData) {
  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim() || null;
  const driveFileId = parseDriveFileId(String(fd.get('drive_link') ?? ''));
  const visibility = fd.get('visibility') === 'public' ? 'public' : 'members';
  const is_published = fd.get('is_published') === 'on';
  const allow_download = fd.get('allow_download') === 'on';
  const sort_order =
    Number.parseInt(String(fd.get('sort_order') ?? '0'), 10) || 0;
  return {
    title,
    description,
    driveFileId,
    visibility,
    is_published,
    allow_download,
    sort_order,
  };
}

export async function createClassVideo(
  _prev: ClassResult | null,
  fd: FormData,
): Promise<ClassResult> {
  try {
    await requireAdmin();
    const f = readFields(fd);
    if (!f.title) return { ok: false, message: 'Title is required.' };
    if (!f.driveFileId)
      return {
        ok: false,
        message: 'Could not read a Google Drive file ID from that link.',
      };
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('class_video').insert({
      title: f.title,
      description: f.description,
      drive_file_id: f.driveFileId,
      visibility: f.visibility,
      is_published: f.is_published,
      allow_download: f.allow_download,
      sort_order: f.sort_order,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: `Added "${f.title}".` };
  } catch (e) {
    return { ok: false, message: err(e) };
  }
}

export async function updateClassVideo(
  _prev: ClassResult | null,
  fd: FormData,
): Promise<ClassResult> {
  try {
    await requireAdmin();
    const id = String(fd.get('id') ?? '');
    if (!isUuid(id)) return { ok: false, message: 'Invalid id.' };
    const f = readFields(fd);
    if (!f.title) return { ok: false, message: 'Title is required.' };
    if (!f.driveFileId)
      return {
        ok: false,
        message: 'Could not read a Google Drive file ID from that link.',
      };
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('class_video')
      .update({
        title: f.title,
        description: f.description,
        drive_file_id: f.driveFileId,
        visibility: f.visibility,
        is_published: f.is_published,
        allow_download: f.allow_download,
        sort_order: f.sort_order,
      })
      .eq('id', id);
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    return { ok: false, message: err(e) };
  }
}

export async function deleteClassVideo(id: string): Promise<ClassResult> {
  try {
    await requireAdmin();
    if (!isUuid(id)) return { ok: false, message: 'Invalid id.' };
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('class_video').delete().eq('id', id);
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/classes');
    revalidatePath('/classes');
    return { ok: true, message: 'Deleted.' };
  } catch (e) {
    return { ok: false, message: err(e) };
  }
}
```

- [ ] **Step 2: Write the admin page (server component)**

```tsx
// apps/frontend/src/app/(admin)/admin/classes/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { ClassManager } from './class-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Classes — D3 Admin' };

export default async function AdminClassesPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  const { data: videos } = await admin
    .from('class_video')
    .select(
      'id, title, description, drive_file_id, visibility, is_published, allow_download, sort_order',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-8 pt-12 pb-24">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Online classes.</h1>
        <p className="text-body-lg text-fgMuted">
          Add classes by pasting a Google Drive link. Drive files must be shared
          “anyone with the link can view” to play.
        </p>
      </header>
      <ClassManager videos={videos ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Write the client manager (form + list with toggles/delete)**

```tsx
// apps/frontend/src/app/(admin)/admin/classes/class-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import {
  createClassVideo,
  updateClassVideo,
  deleteClassVideo,
} from './actions';

interface Video {
  id: string;
  title: string;
  description: string | null;
  drive_file_id: string;
  visibility: string;
  is_published: boolean;
  allow_download: boolean;
  sort_order: number;
}

export function ClassManager({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onCreate(fd: FormData) {
    setPending(true);
    const res = await createClassVideo(null, fd);
    setMsg(res.message);
    setPending(false);
    if (res.ok) router.refresh();
  }
  async function onUpdate(fd: FormData) {
    setPending(true);
    const res = await updateClassVideo(null, fd);
    setMsg(res.message);
    setPending(false);
    if (res.ok) router.refresh();
  }
  async function onDelete(id: string) {
    if (!confirm('Delete this class?')) return;
    const res = await deleteClassVideo(id);
    setMsg(res.message);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {msg && (
        <p className="text-caption text-aurora-cta" role="status">
          {msg}
        </p>
      )}

      {/* Add new */}
      <form
        action={onCreate}
        className="glass-elevated rounded-2xl p-6 flex flex-col gap-3"
      >
        <h2 className="text-section text-fg">Add a class</h2>
        <Input name="title" required placeholder="Title" maxLength={200} />
        <Input
          name="description"
          placeholder="Description (optional)"
          maxLength={500}
        />
        <Input name="drive_link" required placeholder="Google Drive link" />
        <div className="flex flex-wrap gap-4 text-label text-fgMuted items-center">
          <label className="flex items-center gap-2">
            Visibility
            <select
              name="visibility"
              className="bg-canvas border border-borderGlass rounded-md px-2 py-1"
            >
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_published" /> Visible
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allow_download" /> Allow download
          </label>
          <label className="flex items-center gap-2">
            Order <Input name="sort_order" defaultValue="0" className="w-16" />
          </label>
        </div>
        <Button type="submit" disabled={pending} className="w-fit">
          Add class
        </Button>
      </form>

      {/* Existing */}
      <div className="flex flex-col gap-3">
        {videos.map((v) => (
          <form
            key={v.id}
            action={onUpdate}
            className="glass-elevated rounded-2xl p-5 flex flex-col gap-3"
          >
            <input type="hidden" name="id" value={v.id} />
            <Input
              name="title"
              defaultValue={v.title}
              required
              maxLength={200}
            />
            <Input
              name="description"
              defaultValue={v.description ?? ''}
              placeholder="Description"
              maxLength={500}
            />
            <Input name="drive_link" defaultValue={v.drive_file_id} required />
            <div className="flex flex-wrap gap-4 text-label text-fgMuted items-center">
              <label className="flex items-center gap-2">
                Visibility
                <select
                  name="visibility"
                  defaultValue={v.visibility}
                  className="bg-canvas border border-borderGlass rounded-md px-2 py-1"
                >
                  <option value="members">Members</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_published"
                  defaultChecked={v.is_published}
                />{' '}
                Visible
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allow_download"
                  defaultChecked={v.allow_download}
                />{' '}
                Allow download
              </label>
              <label className="flex items-center gap-2">
                Order{' '}
                <Input
                  name="sort_order"
                  defaultValue={String(v.sort_order)}
                  className="w-16"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="w-fit">
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDelete(v.id)}
                className="w-fit text-danger-fg"
              >
                Delete
              </Button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
```

> Note: confirm `Button` supports a `variant="ghost"` prop; if not, drop the prop and use a plain styled `<Button>` for delete. Check `apps/frontend/src/components/ui/button.tsx` first.

- [ ] **Step 4: Add the admin nav link**

Modify `apps/frontend/src/app/(admin)/layout.tsx` — in the `<nav>` (after the Accounts NavLink, ~line 58) add:

```tsx
<NavLink href="/admin/classes">Classes</NavLink>
```

- [ ] **Step 5: Verify types + lint + browser**

Run: `cd apps/frontend && npx tsc --noEmit && cd ../.. && pnpm lint`
Then as admin in the browser: add a class via a Drive link, toggle Visible/Public, confirm it appears on `/classes` (public when public+visible), edit, delete.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/(admin)/admin/classes apps/frontend/src/app/(admin)/layout.tsx
git commit -m "feat(classes): admin CRUD for class videos"
```

---

### Task 5: Role-model migration + role-set in admin provisioning

**Files:**

- Create: `supabase/migrations/20260629000001_member_role.sql`
- Modify: `apps/frontend/src/lib/auth.ts` (UserRole type)
- Modify: `apps/frontend/src/app/(admin)/admin/actions.ts` (set role='creator')
- Modify: `apps/frontend/src/app/(admin)/admin/creators/[id]/actions.ts` (set role='creator')

**Interfaces:**

- Produces: `user_role.role` now allows `'admin'|'creator'|'member'|'none'`; trigger `handle_new_auth_user` defaults new logins to `'member'`; `UserRole` type updated. Admin provisioning explicitly writes `'creator'`.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Update the `UserRole` type**

In `apps/frontend/src/lib/auth.ts:16`:

```ts
export type UserRole = 'admin' | 'creator' | 'member' | 'none';
```

Leave the `?? 'creator'` fallback at line 58 as-is (legacy users with no row; the trigger always inserts a row for new users).

- [ ] **Step 3: Set role='creator' explicitly in `admin/actions.ts`**

In `apps/frontend/src/app/(admin)/admin/actions.ts`, immediately after the `userId` is obtained (after line 93), before `ensureCreatorForUser`:

```ts
// Trigger now defaults new logins to 'member'; provisioned accounts are creators.
const roleSet = await admin
  .from('user_role')
  .update({ role: 'creator' })
  .eq('user_id', userId);
if (roleSet.error) {
  return {
    ok: false,
    message: `Login created but role assignment failed: ${roleSet.error.message}`,
    credentials: { email, password },
  };
}
```

- [ ] **Step 4: Set role='creator' explicitly in `creators/[id]/actions.ts`**

In `apps/frontend/src/app/(admin)/admin/creators/[id]/actions.ts`, after the `createUser` call (~line 273) where the new login is created, add the same explicit role update on the new user's id (match the surrounding variable name for the created user id):

```ts
    await admin.from('user_role').update({ role: 'creator' }).eq('user_id', <createdUserId>);
```

Replace `<createdUserId>` with the actual id variable used there (read the function first).

- [ ] **Step 5: Apply migration + verify provisioning still yields creators**

Apply `20260629000001_member_role.sql` (per migration-apply gotchas). Then run the existing provisioning test:

Run: `cd apps/frontend && npx tsx ../../supabase/tests/provision-creator.mts` (or the documented invocation)
Expected: provisioned account has role `creator` (test should still pass; if it doesn't assert role, add an assertion that `user_role.role === 'creator'`).

- [ ] **Step 6: Type-check + commit**

```bash
cd apps/frontend && npx tsc --noEmit && cd ../..
git add supabase/migrations/20260629000001_member_role.sql apps/frontend/src/lib/auth.ts apps/frontend/src/app/(admin)/admin/actions.ts "apps/frontend/src/app/(admin)/admin/creators/[id]/actions.ts"
git commit -m "feat(auth): add member/none roles; default new signups to member"
```

---

### Task 6: Re-open signup (form, route, middleware)

**Files:**

- Create: `apps/frontend/src/components/auth/sign-up-form.tsx`
- Create: `apps/frontend/src/app/(auth)/signup/page.tsx`
- Modify: `apps/frontend/src/proxy.ts` (remove signup kill, role union, landing/bounce logic)
- Modify: `apps/frontend/src/app/(creator)/layout.tsx` (defense-in-depth member bounce)
- Modify: `apps/frontend/src/components/auth/sign-in-form.tsx` (add link to signup)

**Interfaces:**

- Consumes: `getSupabaseBrowser`, `safeRedirect`, `AuthShell`. Signup uses `supabase.auth.signUp`; the DB trigger (Task 5) assigns `role='member'` automatically.

- [ ] **Step 1: Write the sign-up form**

```tsx
// apps/frontend/src/components/auth/sign-up-form.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AtSignIcon } from 'lucide-react';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import { getSupabaseBrowser } from '@gitroom/frontend/lib/supabase-browser';

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const supabase = getSupabaseBrowser();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }
    // If email confirmation is required, there's no active session yet.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setPending(false);
      return;
    }
    // Trigger assigned role='member'; middleware routes members to /classes.
    router.push('/classes');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-label text-fgMuted">Email</span>
        <div className="relative">
          <AtSignIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fgSubtle pointer-events-none" />
          <Input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
          />
        </div>
      </label>
      <label className="block space-y-1.5">
        <span className="text-label text-fgMuted">Password</span>
        <Input
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="text-caption text-danger-fg" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-caption text-aurora-cta" role="status">
          {notice}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-caption text-fgMuted text-center">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-aurora-cta underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Write the signup page**

```tsx
// apps/frontend/src/app/(auth)/signup/page.tsx
import type { Metadata } from 'next';
import { AuthShell } from '@gitroom/frontend/components/auth/auth-shell';
import { SignUpForm } from '@gitroom/frontend/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Sign up — D3 Creator' };

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Sign up"
      heading="Join the classes."
      subheading="Create a free account to watch member classes."
    >
      <SignUpForm />
    </AuthShell>
  );
}
```

- [ ] **Step 3: Update middleware (`proxy.ts`)**

Make these edits in `apps/frontend/src/proxy.ts`:

(a) Delete the signup kill-redirect (lines ~47–52):

```ts
// DELETE these lines:
if (pathname === '/signup') {
  return NextResponse.redirect(new URL('/login', request.url));
}
```

(b) Widen the role type + add a home() helper. Replace the role cast (line ~106) region:

```ts
const role =
  (roleRow?.role as 'admin' | 'creator' | 'member' | 'none' | undefined) ??
  'creator';
const home =
  role === 'admin' ? '/admin' : role === 'creator' ? '/me' : '/classes';
```

(c) Auth-page landing (lines ~108–111) — use `home`:

```ts
if (isAuthPage) {
  return NextResponse.redirect(new URL(home, request.url));
}
```

(d) Admin confinement (lines ~117–119) stays: admins bounced off non-admin routes to `/admin`. Then replace the admin-route guard for non-admins (lines ~121–124) so members go to `/classes`, creators to `/me`:

```ts
if (isAdminRoute && role !== 'admin') {
  return NextResponse.redirect(new URL(home, request.url));
}
```

(e) Add: bounce non-creators off creator routes (`/me`, `/onboarding`). After the admin-route guard:

```ts
// Creator dashboard is for creators (+ admins, handled above). Members/none
// have no creator data — send them to the classes library instead.
if (isCreatorRoute && role !== 'creator') {
  return NextResponse.redirect(new URL('/classes', request.url));
}
```

> `/classes` and `/signup` are NOT in `ADMIN_PREFIXES`/`CREATOR_PREFIXES`/`AUTH_PAGES`, so anon reaches them freely; only the admin-confinement rule pulls signed-in admins to `/admin`.

- [ ] **Step 4: Defense-in-depth bounce in the creator layout**

In `apps/frontend/src/app/(creator)/layout.tsx`, after line 22 (`if (!auth) redirect('/login');`) add:

```tsx
if (auth.role !== 'creator' && auth.role !== 'admin') redirect('/classes');
```

- [ ] **Step 5: Link signup from the sign-in form**

In `apps/frontend/src/components/auth/sign-in-form.tsx`, after the submit `<Button>` (line ~85), add (import `Link from 'next/link'` at top):

```tsx
<p className="text-caption text-fgMuted text-center">
  New here?{' '}
  <Link href="/signup" className="text-aurora-cta underline underline-offset-4">
    Create an account
  </Link>
</p>
```

- [ ] **Step 6: Verify types + lint + end-to-end**

Run: `cd apps/frontend && npx tsc --noEmit && cd ../.. && pnpm lint`
In the browser: sign up a new account → lands on `/classes` (or sees the confirm-email notice). The new member can watch members-only classes; cannot reach `/me` (redirects to `/classes`) or `/admin` (redirects to `/classes`).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/auth/sign-up-form.tsx apps/frontend/src/components/auth/sign-in-form.tsx apps/frontend/src/app/(auth)/signup apps/frontend/src/proxy.ts "apps/frontend/src/app/(creator)/layout.tsx"
git commit -m "feat(auth): re-open public signup as member role"
```

---

### Task 7: Admin `/admin/users` role management

**Files:**

- Create: `apps/frontend/src/app/(admin)/admin/users/actions.ts`
- Create: `apps/frontend/src/app/(admin)/admin/users/page.tsx`
- Create: `apps/frontend/src/app/(admin)/admin/users/role-table.tsx`
- Modify: `apps/frontend/src/app/(admin)/layout.tsx` (add nav link)

**Interfaces:**

- Consumes: `requireAdmin`, `getAuthContext`, `getSupabaseAdmin`, `isUuid`.
- Produces: server action `setUserRole(userId, role)` returning `{ ok, message }`; guards against self-demotion.

- [ ] **Step 1: Write the action**

```ts
// apps/frontend/src/app/(admin)/admin/users/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin, getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';

const ROLES = ['admin', 'creator', 'member', 'none'] as const;
type Role = (typeof ROLES)[number];

export interface RoleResult {
  ok: boolean;
  message: string;
}

export async function setUserRole(
  userId: string,
  role: string,
): Promise<RoleResult> {
  try {
    await requireAdmin();
    if (!isUuid(userId)) return { ok: false, message: 'Invalid user id.' };
    if (!ROLES.includes(role as Role))
      return { ok: false, message: 'Invalid role.' };

    // Prevent an admin from demoting themselves (and locking themselves out).
    const me = await getAuthContext();
    if (me && me.userId === userId && role !== 'admin') {
      return { ok: false, message: 'You cannot change your own admin role.' };
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('user_role')
      .update({ role })
      .eq('user_id', userId);
    if (error) return { ok: false, message: error.message };
    revalidatePath('/admin/users');
    return { ok: true, message: 'Role updated.' };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unexpected error',
    };
  }
}
```

- [ ] **Step 2: Write the page (joins user_role with auth user emails)**

```tsx
// apps/frontend/src/app/(admin)/admin/users/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { RoleTable } from './role-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Users — D3 Admin' };

export default async function AdminUsersPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  // Emails live in auth.users (not exposed via PostgREST) — use the admin auth API.
  const [{ data: roleRows }, { data: usersList }] = await Promise.all([
    admin.from('user_role').select('user_id, role, created_at'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const emailById = new Map(
    (usersList?.users ?? []).map((u) => [u.id, u.email ?? '']),
  );
  const rows = (roleRows ?? []).map((r) => ({
    user_id: r.user_id as string,
    role: r.role as string,
    created_at: r.created_at as string,
    email: emailById.get(r.user_id as string) ?? '(unknown)',
  }));

  return (
    <div className="flex flex-col gap-8 pt-12 pb-24">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Users &amp; roles.</h1>
        <p className="text-body-lg text-fgMuted">
          Assign each account a role. Members watch classes; creators get the
          /me dashboard; “none” revokes access. Public listing still requires
          the provision-creator flow.
        </p>
      </header>
      <RoleTable rows={rows} selfId={auth.userId} />
    </div>
  );
}
```

- [ ] **Step 3: Write the client role table**

```tsx
// apps/frontend/src/app/(admin)/admin/users/role-table.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUserRole } from './actions';

interface Row {
  user_id: string;
  role: string;
  created_at: string;
  email: string;
}
const ROLES = ['admin', 'creator', 'member', 'none'];

export function RoleTable({ rows, selfId }: { rows: Row[]; selfId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function change(userId: string, role: string) {
    const res = await setUserRole(userId, role);
    setMsg(res.message);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && (
        <p className="text-caption text-aurora-cta" role="status">
          {msg}
        </p>
      )}
      <div className="glass-elevated rounded-2xl overflow-hidden">
        <table className="w-full text-label">
          <thead className="text-caption text-fgMuted border-b border-borderGlass">
            <tr>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Joined</th>
              <th className="text-left p-4">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-borderGlass/50">
                <td className="p-4 text-fg">{r.email}</td>
                <td className="p-4 text-fgMuted">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="p-4">
                  <select
                    defaultValue={r.role}
                    disabled={r.user_id === selfId}
                    onChange={(e) => change(r.user_id, e.target.value)}
                    className="bg-canvas border border-borderGlass rounded-md px-2 py-1 text-fg disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the admin nav link**

In `apps/frontend/src/app/(admin)/layout.tsx` `<nav>`, after the Classes link:

```tsx
<NavLink href="/admin/users">Users</NavLink>
```

- [ ] **Step 5: Verify types + lint + browser**

Run: `cd apps/frontend && npx tsc --noEmit && cd ../.. && pnpm lint`
In the browser as admin: `/admin/users` lists accounts; change a member → creator (they now reach `/me`); the admin's own row is disabled.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/(admin)/admin/users apps/frontend/src/app/(admin)/layout.tsx
git commit -m "feat(admin): user role-management screen"
```

---

## Self-Review

**Spec coverage:**

- `class_video` table + RLS → Task 1 ✅
- Public `/classes` list + `/classes/[id]` player + download → Task 3 ✅
- Admin `/admin/classes` CRUD + Drive parse + 3 toggles + reorder + delete → Tasks 2, 4 ✅
- Re-open signup + `member` role default + middleware → Tasks 5, 6 ✅
- `/admin/users` role governance (member/creator/admin/none) → Task 7 ✅
- Role vs creator-entity kept separate (no provisioning in role screen) → Task 7 page copy + action ✅
- Operational Drive-sharing note → surfaced in admin page copy (Task 4) ✅
- Tests: RLS (Task 1), Drive parser (Task 2), provisioning-still-creator (Task 5) ✅

**Placeholder scan:** one intentional placeholder remains — `<createdUserId>` in Task 5 Step 4, flagged with an instruction to read the function and use the real variable (the surrounding code wasn't read in full during planning). All other steps contain complete code.

**Type consistency:** `UserRole = 'admin'|'creator'|'member'|'none'` (Task 5) matches the role union in `proxy.ts` (Task 6) and the `ROLES` arrays in Tasks 7. Result objects (`{ ok, message }`) consistent across all actions. `parseDriveFileId`/`drivePreviewUrl`/`driveDownloadUrl` names consistent between Tasks 2, 3, 4.

**Open verification items (not blockers):**

- Confirm `Button` `variant="ghost"` exists (Task 4 Step 3 note).
- Confirm the public nav location (Task 3 Step 3).
- `admin.auth.admin.listUsers` perPage=1000 is fine for current scale; paginate later if users exceed 1000.
