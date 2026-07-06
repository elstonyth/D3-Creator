# Public-Page Aggregate RPCs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two full-history JS scans behind the public pages (`getLiveCreatorRows`, `loadContentRows`) with two Postgres aggregate RPCs, without changing any displayed number.

**Architecture:** Two additive `language sql stable` security-invoker functions aggregate `profile_snapshot`/`post_snapshot` server-side and return bounded per-profile / per-post rows. The app keeps its existing rollup/window/dedup JS, just fed cheap rows. A parity script proves RPC output == current JS output on prod data BEFORE any read is switched.

**Tech Stack:** Supabase Postgres (migration via Supabase MCP `apply_migration`), supabase-js (anon read client), TypeScript, tsx for the parity script.

**Spec:** `docs/superpowers/specs/2026-07-06-public-page-aggregate-rpcs-design.md`

## Global Constraints

- Displayed public numbers MUST NOT change. Semantics contract (from spec): followers = newest `profile_snapshot` row (`captured_at desc, id desc`, null→0); per-post views = `coalesce(max(views),0)` over ALL snapshots; engagement/caption/media/posted_at/duration = newest snapshot per post (`captured_at desc, id desc`); rednote excluded; zero-post profiles still get a row (LEFT JOIN).
- **PostgREST caps set-returning RPC responses at ~1000 rows.** `public_content_rows()` already exceeds that (~1.4k posts). BOTH RPC reads MUST page via the existing `fetchAllRows` helper, and BOTH functions MUST end with a stable `ORDER BY` so pages don't overlap/skip.
- Functions are security **invoker** (default), `stable`, `set search_path = ''`; revoke from `public`, grant EXECUTE to `anon, authenticated, service_role`. NO `security definer`.
- Prod migration is applied via Supabase MCP `apply_migration` on project `wmesjldkqvbzrcpitclu` — the tool's permission dialog is the user's approval gate. Parity must pass before Task 3/4 land.
- pnpm only; lint from repo root; production system — pages stay `force-dynamic`.
- Working branch: `perf/public-page-aggregate-rpcs` (already has the spec commits).

---

### Task 1: Migration — `public_creator_rows()` + `public_content_rows()`

**Files:**

- Create: `supabase/migrations/20260706080000_public_page_aggregate_rpcs.sql`

**Interfaces:**

- Produces: RPC `public.public_creator_rows()` → `(profile_id uuid, creator_id uuid, platform text, handle text, followers bigint, total_views bigint, total_engagement bigint, post_count bigint)` ordered by `profile_id`.
- Produces: RPC `public.public_content_rows()` → `(profile_id uuid, creator_id uuid, creator_name text, platform text, handle text, external_post_id text, current_views bigint, likes bigint, comments bigint, shares bigint, caption_excerpt text, media_url text, posted_at timestamptz, duration_seconds integer)` ordered by `(profile_id, external_post_id)`.

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- Public-page aggregate RPCs (spec: docs/superpowers/specs/2026-07-06-public-page-aggregate-rpcs-design.md)
--
-- The public pages (/, /dashboard, /leaderboard) are force-dynamic and used to
-- page the ENTIRE profile_snapshot + post_snapshot history through PostgREST on
-- every request, aggregating in JS (O(all history), growing ~1.2k rows/day).
-- These two functions push that aggregation into Postgres and return bounded
-- rows (one per profile / one per post).
--
-- Semantics MUST match the JS they replace (queries.ts) exactly:
--   * followers        = newest profile_snapshot row (captured_at desc, id desc), null -> 0
--   * per-post views   = coalesce(max(views), 0) across ALL snapshots of the post
--                        (monotonic-views guard — a transient bad re-scrape must not
--                        lower a post's recorded views; mirrors maxViewsPerPost)
--   * engagement/caption/media/posted_at/duration = newest snapshot per post
--   * rednote profiles excluded
--   * zero-post profiles STILL return a row (LEFT JOIN) — their followers must
--     keep counting toward the creator total
--
-- Security: invoker (anon already has SELECT on these tables — it reads them
-- directly today), stable, search_path pinned. Deterministic ORDER BY because
-- PostgREST caps set-returning RPC responses (~1000 rows) and the app pages
-- these with .range().

create or replace function public.public_creator_rows()
returns table (
  profile_id uuid,
  creator_id uuid,
  platform text,
  handle text,
  followers bigint,
  total_views bigint,
  total_engagement bigint,
  post_count bigint
)
language sql stable
set search_path to ''
as $$
  with scope_profile as (
    select pr.id, pr.creator_id, pr.platform, pr.handle
    from public.profile pr
    where pr.platform <> 'rednote'
  ),
  latest_followers as (
    select distinct on (ps.profile_id)
      ps.profile_id, coalesce(ps.followers, 0) as followers
    from public.profile_snapshot ps
    order by ps.profile_id, ps.captured_at desc, ps.id desc
  ),
  post_maxviews as (
    select pp.profile_id, pp.external_post_id, coalesce(max(pp.views), 0) as v
    from public.post_snapshot pp
    group by pp.profile_id, pp.external_post_id
  ),
  post_latest as (
    select distinct on (pp.profile_id, pp.external_post_id)
      pp.profile_id, pp.external_post_id,
      coalesce(pp.likes, 0) + coalesce(pp.comments, 0) + coalesce(pp.shares, 0)
        as engagement
    from public.post_snapshot pp
    order by pp.profile_id, pp.external_post_id, pp.captured_at desc, pp.id desc
  ),
  per_profile as (
    select mv.profile_id,
      sum(mv.v)          as total_views,
      sum(pl.engagement) as total_engagement,
      count(*)           as post_count
    from post_maxviews mv
    join post_latest pl
      on pl.profile_id = mv.profile_id
     and pl.external_post_id = mv.external_post_id
    group by mv.profile_id
  )
  select sp.id, sp.creator_id, sp.platform, sp.handle,
    coalesce(lf.followers, 0)::bigint,
    coalesce(pp.total_views, 0)::bigint,
    coalesce(pp.total_engagement, 0)::bigint,
    coalesce(pp.post_count, 0)::bigint
  from scope_profile sp
  left join latest_followers lf on lf.profile_id = sp.id
  left join per_profile pp on pp.profile_id = sp.id
  order by sp.id
$$;

create or replace function public.public_content_rows()
returns table (
  profile_id uuid,
  creator_id uuid,
  creator_name text,
  platform text,
  handle text,
  external_post_id text,
  current_views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  caption_excerpt text,
  media_url text,
  posted_at timestamptz,
  duration_seconds integer
)
language sql stable
set search_path to ''
as $$
  with scope_profile as (
    select pr.id, pr.creator_id, pr.platform, pr.handle
    from public.profile pr
    where pr.platform <> 'rednote'
  ),
  post_maxviews as (
    select pp.profile_id, pp.external_post_id, coalesce(max(pp.views), 0) as v
    from public.post_snapshot pp
    group by pp.profile_id, pp.external_post_id
  ),
  post_latest as (
    select distinct on (pp.profile_id, pp.external_post_id)
      pp.profile_id, pp.external_post_id, pp.posted_at, pp.caption_excerpt,
      pp.media_url, pp.duration_seconds,
      coalesce(pp.likes, 0)    as likes,
      coalesce(pp.comments, 0) as comments,
      coalesce(pp.shares, 0)   as shares
    from public.post_snapshot pp
    order by pp.profile_id, pp.external_post_id, pp.captured_at desc, pp.id desc
  )
  select pl.profile_id, sp.creator_id, c.display_name, sp.platform, sp.handle,
    pl.external_post_id,
    mv.v::bigint,
    pl.likes::bigint, pl.comments::bigint, pl.shares::bigint,
    pl.caption_excerpt, pl.media_url, pl.posted_at,
    pl.duration_seconds::integer
  from post_latest pl
  join post_maxviews mv
    on mv.profile_id = pl.profile_id
   and mv.external_post_id = pl.external_post_id
  join scope_profile sp on sp.id = pl.profile_id
  join public.creator c on c.id = sp.creator_id
  order by pl.profile_id, pl.external_post_id
$$;

-- Tight execute surface (read RPCs for the public pages).
revoke execute on function public.public_creator_rows() from public;
revoke execute on function public.public_content_rows() from public;
grant execute on function public.public_creator_rows() to anon, authenticated, service_role;
grant execute on function public.public_content_rows() to anon, authenticated, service_role;
```

- [ ] **Step 2: Apply to prod** via Supabase MCP `apply_migration` (project `wmesjldkqvbzrcpitclu`, name `public_page_aggregate_rpcs`) with the file's SQL. The MCP permission dialog is the approval gate. NOTE (memory): PostgREST schema-cache lag makes a brand-new RPC 404 (PGRST202) for ~1 min — verify with direct SQL first.

- [ ] **Step 3: Verify via direct SQL** (Supabase MCP `execute_sql`):

```sql
select count(*) as profiles from public.public_creator_rows();
select count(*) as posts from public.public_content_rows();
```

Expected: profiles ≈ 80+ (all non-rednote profiles), posts ≈ 1400+ (all distinct tracked posts). Both non-zero.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260706080000_public_page_aggregate_rpcs.sql
git commit -m "feat(db): public_creator_rows + public_content_rows aggregate RPCs"
```

---

### Task 2: Parity script — prove RPC == current JS on prod data

**Files:**

- Create: `supabase/tests/public-rpcs-parity.mts`

**Interfaces:**

- Consumes: the two RPCs from Task 1; raw `profile`/`creator`/`profile_snapshot`/`post_snapshot` reads (the OLD JS semantics, reimplemented standalone so the check outlives the queries.ts rewrite).
- Produces: exit 0 + "PARITY OK" when every per-profile aggregate and per-post row matches; exit 1 with a diff list otherwise.

- [ ] **Step 1: Write the script** with exactly this content:

```ts
/**
 * Parity check: the public-page aggregate RPCs must produce EXACTLY the same
 * numbers as the JS aggregation they replace (queries.ts before the rewrite).
 * Reimplements the old JS semantics here (raw table reads + JS rollup) and
 * diffs against public_creator_rows() / public_content_rows().
 *
 * Run (bash, repo root):
 *   set -a; . ./.env; set +a; npx tsx supabase/tests/public-rpcs-parity.mts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY must be set');
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE = 1000;
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    if (res.error) throw new Error(res.error.message);
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// ---------- OLD JS semantics (reference) ----------
interface RefProfileAgg {
  followers: number;
  totalViews: number;
  totalEng: number;
  count: number;
}

async function referenceAggregates() {
  const profiles = await fetchAll<{
    id: string;
    creator_id: string;
    platform: string;
    handle: string | null;
  }>((f, t) =>
    sb
      .from('profile')
      .select('id, creator_id, platform, handle')
      .neq('platform', 'rednote')
      .order('id')
      .range(f, t),
  );
  const snaps = await fetchAll<{
    profile_id: string;
    followers: number | null;
  }>((f, t) =>
    sb
      .from('profile_snapshot')
      .select('profile_id, captured_at, followers')
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(f, t),
  );
  const latestFollowers = new Map<string, number>();
  for (const s of snaps)
    if (!latestFollowers.has(s.profile_id))
      latestFollowers.set(s.profile_id, s.followers ?? 0);

  const posts = await fetchAll<{
    profile_id: string;
    external_post_id: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }>((f, t) =>
    sb
      .from('post_snapshot')
      .select(
        'profile_id, external_post_id, captured_at, likes, comments, shares, views',
      )
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(f, t),
  );

  const maxViews = new Map<string, number>();
  for (const p of posts) {
    const k = `${p.profile_id}:${p.external_post_id}`;
    const v = p.views ?? 0;
    if (v > (maxViews.get(k) ?? -1)) maxViews.set(k, v);
  }
  const perProfile = new Map<string, RefProfileAgg>();
  for (const p of profiles)
    perProfile.set(p.id, {
      followers: latestFollowers.get(p.id) ?? 0,
      totalViews: 0,
      totalEng: 0,
      count: 0,
    });
  const seen = new Set<string>();
  for (const p of posts) {
    const agg = perProfile.get(p.profile_id);
    if (!agg) continue; // rednote / unknown
    const k = `${p.profile_id}:${p.external_post_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    agg.totalViews += maxViews.get(k) ?? 0;
    agg.totalEng += (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
    agg.count += 1;
  }
  return { perProfile, maxViews };
}

// ---------- RPC side ----------
interface CreatorRpcRow {
  profile_id: string;
  followers: number;
  total_views: number;
  total_engagement: number;
  post_count: number;
}
interface ContentRpcRow {
  profile_id: string;
  external_post_id: string;
  current_views: number;
  likes: number;
  comments: number;
  shares: number;
}

async function main() {
  const [{ perProfile, maxViews }, creatorRows, contentRows] =
    await Promise.all([
      referenceAggregates(),
      fetchAll<CreatorRpcRow>((f, t) =>
        sb.rpc('public_creator_rows').range(f, t),
      ),
      fetchAll<ContentRpcRow>((f, t) =>
        sb.rpc('public_content_rows').range(f, t),
      ),
    ]);

  const diffs: string[] = [];

  // 1. Same profile set.
  const rpcProfiles = new Set(creatorRows.map((r) => r.profile_id));
  for (const id of perProfile.keys())
    if (!rpcProfiles.has(id)) diffs.push(`RPC missing profile ${id}`);
  for (const id of rpcProfiles)
    if (!perProfile.has(id)) diffs.push(`RPC extra profile ${id}`);

  // 2. Per-profile aggregates match exactly.
  for (const r of creatorRows) {
    const ref = perProfile.get(r.profile_id);
    if (!ref) continue;
    if (Number(r.followers) !== ref.followers)
      diffs.push(
        `${r.profile_id} followers rpc=${r.followers} ref=${ref.followers}`,
      );
    if (Number(r.total_views) !== ref.totalViews)
      diffs.push(
        `${r.profile_id} views rpc=${r.total_views} ref=${ref.totalViews}`,
      );
    if (Number(r.total_engagement) !== ref.totalEng)
      diffs.push(
        `${r.profile_id} eng rpc=${r.total_engagement} ref=${ref.totalEng}`,
      );
    if (Number(r.post_count) !== ref.count)
      diffs.push(`${r.profile_id} count rpc=${r.post_count} ref=${ref.count}`);
  }

  // 3. Content rows: every post's current_views == MAX(views), and the row set
  //    covers exactly the reference post set.
  const refPosts = new Set(
    [...maxViews.keys()].filter((k) => perProfile.has(k.split(':')[0])),
  );
  const rpcPosts = new Set(
    contentRows.map((r) => `${r.profile_id}:${r.external_post_id}`),
  );
  for (const k of refPosts)
    if (!rpcPosts.has(k)) diffs.push(`content RPC missing post ${k}`);
  for (const k of rpcPosts)
    if (!refPosts.has(k)) diffs.push(`content RPC extra post ${k}`);
  for (const r of contentRows) {
    const k = `${r.profile_id}:${r.external_post_id}`;
    const ref = maxViews.get(k);
    if (ref !== undefined && Number(r.current_views) !== ref)
      diffs.push(`${k} current_views rpc=${r.current_views} ref=${ref}`);
  }

  if (diffs.length) {
    console.error(`PARITY FAILED — ${diffs.length} diffs:`);
    for (const d of diffs.slice(0, 50)) console.error('  ' + d);
    process.exit(1);
  }
  console.log(
    `PARITY OK — ${creatorRows.length} profiles, ${contentRows.length} posts match exactly.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against prod** (bash, repo root):

```bash
set -a; . ./.env; set +a; npx tsx supabase/tests/public-rpcs-parity.mts
```

Expected: `PARITY OK — <n> profiles, <m> posts match exactly.` and exit 0. If it FAILS: fix the SQL (Task 1) and re-apply before proceeding — do NOT continue to Task 3.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/public-rpcs-parity.mts
git commit -m "test(db): parity check for public-page aggregate RPCs"
```

---

### Task 3: Rewrite `getLiveCreatorRows` to use `public_creator_rows()`

**Files:**

- Modify: `apps/frontend/src/lib/queries.ts` — replace the body between the `getLiveCreatorRows` doc comment and its final `return`; delete the now-orphaned `maxViewsPerPost` helper and its doc comment (lines ~111–129) IF no other caller remains (Task 4 removes the other caller; do the deletion in Task 4).

**Interfaces:**

- Consumes: RPC `public_creator_rows()` (Task 1).
- Produces: `getLiveCreatorRows(): Promise<LiveCreatorRow[] | null>` — signature and return shape 100% unchanged; all consumers (`summarizeCreatorRows`, `topCreatorRows`, `platformBreakdownFromRows`, pages) untouched.

- [ ] **Step 1: Replace the implementation.** Keep the existing doc comments above the function. New body:

```ts
/** Row shape returned by the public_creator_rows() aggregate RPC. */
interface PublicCreatorRpcRow {
  profile_id: string;
  creator_id: string;
  platform: string;
  handle: string | null;
  followers: number | string;
  total_views: number | string;
  total_engagement: number | string;
  post_count: number | string;
}

/** Guard a numeric RPC value (bigint may arrive as string) — NaN-safe, null → 0. */
function rpcNum(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getLiveCreatorRows(): Promise<LiveCreatorRow[] | null> {
  const sb = getSupabaseRead();

  // 1. Creators (names + avatars) — the RPC below carries everything else.
  const creators = await sb
    .from('creator')
    .select('id, display_name, avatar_url');
  if (creators.error || !creators.data || creators.data.length === 0) {
    if (creators.error)
      console.error('[queries] getLiveCreatorRows creators', creators.error);
    return null;
  }

  // 2. Per-profile aggregates from the DB (followers = newest snapshot,
  //    views = Σ MAX(views) per post, engagement = Σ newest-snapshot l+c+s).
  //    Replaces the old full-history profile_snapshot/post_snapshot scans —
  //    the aggregation now runs in Postgres (public_creator_rows RPC) and this
  //    fetch is one bounded row per profile. Paged because PostgREST caps
  //    set-returning RPC responses (~1000 rows) like any other response.
  const agg = await fetchAllRows<PublicCreatorRpcRow>((from, to) =>
    sb.rpc('public_creator_rows').range(from, to),
  );
  if (agg.error) {
    console.error(
      '[queries] getLiveCreatorRows public_creator_rows',
      agg.error,
    );
    return null;
  }
  const slotsByCreator = new Map<string, PublicCreatorRpcRow[]>();
  for (const r of agg.rows) {
    if (!slotsByCreator.has(r.creator_id)) slotsByCreator.set(r.creator_id, []);
    slotsByCreator.get(r.creator_id)!.push(r);
  }

  // 3. Roll up per creator, emitting a per-platform slot for each profile.
  const rows: Omit<LiveCreatorRow, 'rank'>[] = [];
  for (const c of creators.data) {
    const slots = slotsByCreator.get(c.id) ?? [];
    if (slots.length === 0) continue; // 0-profile creators are not "tracked"

    const platforms: CreatorPlatformMetric[] = [];
    let followers = 0;
    let totalViews = 0;
    let totalEngagement = 0;
    for (const s of slots) {
      const f = rpcNum(s.followers);
      const v = rpcNum(s.total_views);
      const e = rpcNum(s.total_engagement);
      followers += f;
      totalViews += v;
      totalEngagement += e;
      platforms.push({
        platform: dbPlatformToKey(s.platform),
        dbPlatform: s.platform,
        handle: s.handle,
        followers: f,
        totalViews: v,
        totalEngagement: e,
        postCount: rpcNum(s.post_count),
      });
    }

    // Highest-follower profile decides the primary platform + slug (matches the
    // admin/leaderboard convention; deterministic on a tie via the first seen).
    const primary = platforms.reduce(
      (best, slot) => (slot.followers > best.followers ? slot : best),
      platforms[0],
    );

    rows.push({
      creatorId: c.id,
      displayName: c.display_name ?? primary.handle ?? c.id.slice(0, 8),
      avatarUrl: resolveMediaUrl(c.avatar_url),
      primaryHandle: primary.handle,
      primaryPlatform: primary.platform,
      followers,
      totalViews,
      totalEngagement,
      platforms,
    });
  }

  if (rows.length === 0) return null;
  rows.sort((a, b) => b.followers - a.followers);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
```

- [ ] **Step 2: Typecheck** — `cd apps/frontend && npx tsc --noEmit -p tsconfig.json`. Expected: clean (or only pre-existing unrelated errors; there should be none).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/queries.ts
git commit -m "perf(queries): getLiveCreatorRows reads the public_creator_rows aggregate RPC"
```

---

### Task 4: Rewrite `loadContentRows` to use `public_content_rows()` + remove orphaned helper

**Files:**

- Modify: `apps/frontend/src/lib/queries.ts` — replace `loadContentRows` body; delete `maxViewsPerPost` (now orphaned).

**Interfaces:**

- Consumes: RPC `public_content_rows()` (Task 1).
- Produces: `loadContentRows(): Promise<TopContentRow[]>` unchanged shape; `getTopContent` / `getTopContentRankingsWindowed` untouched.

- [ ] **Step 1: Replace the implementation.** Keep the doc comment. New body:

```ts
/** Row shape returned by the public_content_rows() aggregate RPC. */
interface PublicContentRpcRow {
  profile_id: string;
  creator_id: string;
  creator_name: string | null;
  platform: string;
  handle: string | null;
  external_post_id: string;
  current_views: number | string;
  likes: number | string;
  comments: number | string;
  shares: number | string;
  caption_excerpt: string | null;
  media_url: string | null;
  posted_at: string | null;
  duration_seconds: number | null;
}

async function loadContentRows(): Promise<TopContentRow[]> {
  const sb = getSupabaseRead();

  // One bounded row per tracked post, aggregated in Postgres
  // (public_content_rows RPC): current_views = MAX(views) across the post's
  // snapshots (monotonic-views guard), everything else from the newest
  // snapshot. Replaces the old full-history post_snapshot scan. Paged because
  // PostgREST caps set-returning RPC responses (~1000 rows) and the tracked
  // post set already exceeds that.
  const posts = await fetchAllRows<PublicContentRpcRow>((from, to) =>
    sb.rpc('public_content_rows').range(from, to),
  );
  if (posts.error) {
    console.error('[queries] loadContentRows public_content_rows', posts.error);
    return [];
  }

  return posts.rows.map((p) => ({
    externalPostId: p.external_post_id,
    profileId: p.profile_id,
    creatorId: p.creator_id,
    creatorName: p.creator_name ?? p.handle ?? null,
    platform: p.platform,
    handle: p.handle,
    captionExcerpt: p.caption_excerpt ?? null,
    thumbnailUrl: resolveMediaUrl(p.media_url),
    postedAt: p.posted_at ?? null,
    viewsGained: rpcNum(p.current_views),
    currentViews: rpcNum(p.current_views),
    likes: rpcNum(p.likes),
    comments: rpcNum(p.comments),
    shares: rpcNum(p.shares),
    durationSeconds: p.duration_seconds ?? null,
  }));
}
```

- [ ] **Step 2: Delete `maxViewsPerPost`** (its two callers are gone) and its doc comment. Verify no references remain:

```bash
grep -rn "maxViewsPerPost" apps/frontend/src && echo "STILL REFERENCED — do not delete" || echo "orphaned — deleted OK"
```

Expected: `orphaned — deleted OK`. `fetchAllRows` STAYS (both rewrites use it).

- [ ] **Step 3: Typecheck + lint + tests**

```bash
cd apps/frontend && npx tsc --noEmit -p tsconfig.json
cd .. && npx eslint apps/frontend/src/lib/queries.ts
pnpm test
```

Expected: all clean/pass.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/queries.ts
git commit -m "perf(queries): loadContentRows reads the public_content_rows aggregate RPC"
```

---

### Task 5: End-to-end verification + PR

**Files:** none new.

- [ ] **Step 1: Full local production build** (proves the pages compile & the build stays fast):

```bash
set -a; . ./.env; set +a; export SENTRY_AUTH_TOKEN=""
pnpm --filter ./apps/frontend run build
```

Expected: exit 0; `/`, `/dashboard`, `/leaderboard` listed as `ƒ (Dynamic)`.

- [ ] **Step 2: Runtime smoke test** — start the app locally and diff rendered numbers against production (same DB, so they must match): fetch `http://localhost:4200/leaderboard` and `https://www.d3creator.com/leaderboard`, compare the first creator row's follower/view figures in the HTML. Numbers identical → the RPC path reproduces prod output.

- [ ] **Step 3: Re-run the parity script** (final gate):

```bash
set -a; . ./.env; set +a; npx tsx supabase/tests/public-rpcs-parity.mts
```

Expected: `PARITY OK`.

- [ ] **Step 4: Push + PR** targeting `main`, title `perf(public): aggregate public-page metrics in Postgres RPCs`; body cites the spec, the parity result, and before/after request cost (full-history scan → ~81 + ~1.5k bounded rows). Babysit CI + reviews per repo convention (resolve threads, never `--admin`).

```

## Self-Review

- **Spec coverage:** RPC 1 ✓ (Task 1), RPC 2 ✓ (Task 1), invoker+search_path+grants ✓ (Task 1), LEFT-JOIN zero-post profiles ✓ (Task 1 SQL), profile_id in RPC 2 ✓, parity-before-switch ✓ (Task 2 gates Tasks 3–4), pages stay force-dynamic ✓ (untouched), no caching ✓.
- **Placeholders:** none — every step has full code/commands.
- **Type consistency:** `rpcNum` defined in Task 3, used in Task 4 (same file, Task 3 lands first). `fetchAllRows` signature matches existing helper. RPC column names match between SQL (Task 1), parity script (Task 2), and TS interfaces (Tasks 3–4).
```
