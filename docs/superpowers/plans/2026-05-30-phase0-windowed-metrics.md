# Phase 0 — Windowed-Metrics Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the verified windowed-metrics SQL functions to the live database and a thin, typed TypeScript wrapper that every later phase (public, admin, creator) calls to get views-gained / follower-delta / views-based engagement across 7d/30d/90d/lifetime windows.

**Architecture:** All metric math lives in two Postgres `language sql stable` functions (`creator_metrics_windowed`, `top_content_windowed`) — already written and read-only-proven. This plan applies them to prod, then adds `apps/frontend/src/lib/metrics-windowed.ts`: a pass-through that calls `.rpc()`, maps snake_case → camelCase, and wraps `media_url` through the existing image proxy. No business logic in TS — it stays in SQL so there is one source of truth.

**Tech Stack:** Postgres (Supabase), TypeScript, Next.js Server Components, `@supabase/supabase-js`. Migrations applied via the Supabase MCP (no local CLI in this repo). No JS test runner exists in the repo — verification is SQL-fixture assertions run through the MCP plus `pnpm typecheck` / `pnpm lint`.

---

## Pre-flight context (read before starting)

- **Migration file already written + committed:** `supabase/migrations/20260530000000_windowed_metrics_rpcs.sql`. The math is proven read-only (see `docs/superpowers/specs/2026-05-30-phase0-windowed-metrics-design.md` → Verification). This plan APPLIES it and builds the TS layer on top.
- **Project ref:** d3-creator = `wmesjldkqvbzrcpitclu` (org `clymqursncacptinqerf`, Free plan — no branching).
- **Data-maturity reality:** the DB currently holds only ONE snapshot day, so every window returns identical numbers until the daily cron accrues ≥2 days. This is expected; the `insufficient` flag drives the downstream "Building history…" UI state (Phases 1/3). Phase 0 just returns the flag correctly.
- **Read client:** `getSupabaseRead()` in `apps/frontend/src/lib/supabase-server.ts` (anon key, public-RLS). Admin/`/me` callers inject their own client.
- **No tests dir / runner.** Do NOT scaffold jest — `pnpm test` is a no-op and there are zero spec files. Verification is SQL + typecheck + lint, as written in each task.
- **Commands (run from repo root only):** `pnpm typecheck`, `pnpm lint`.

## File Structure

- **Apply (existing, no edit):** `supabase/migrations/20260530000000_windowed_metrics_rpcs.sql` — the two RPCs + indexes.
- **Existing verification SQL (no edit):** `supabase/tests/windowed_metrics_verify.sql` — seed-assert-rollback fixture test.
- **Create:** `apps/frontend/src/lib/metrics-windowed.ts` — typed wrapper: `MetricWindow` type, row types, `getCreatorMetricsWindowed()`, `getTopContentWindowed()`. One responsibility: turn an RPC call into typed, proxy-wrapped objects.
- **No other files.** Consumers (dashboard/leaderboard/admin/me) are out of scope — they belong to Phases 1–3.

---

### Task 1: Apply the windowed-metrics migration to the database

**Files:**
- Apply (no edit): `supabase/migrations/20260530000000_windowed_metrics_rpcs.sql`

- [ ] **Step 1: Confirm the migration is not yet applied**

Use the Supabase MCP `execute_sql` (read-only) against project `wmesjldkqvbzrcpitclu`:

```sql
select count(*) as fn_count
from pg_proc
where proname in ('creator_metrics_windowed','top_content_windowed');
```

Expected: `fn_count = 0` (functions don't exist yet). If it's already 2, skip to Task 2.

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` (this is a WRITE — it will prompt for approval; that is expected and correct):
- `project_id`: `wmesjldkqvbzrcpitclu`
- `name`: `windowed_metrics_rpcs`
- `query`: the full contents of `supabase/migrations/20260530000000_windowed_metrics_rpcs.sql`

This is additive only (`create or replace function`, `create index if not exists`). It does not touch any table data — safe per CLAUDE.md deploy rules.

- [ ] **Step 3: Verify the functions and indexes now exist**

`execute_sql`:

```sql
select
  (select count(*) from pg_proc where proname in ('creator_metrics_windowed','top_content_windowed')) as fns,
  (select count(*) from pg_indexes where indexname in
     ('idx_profile_snapshot_profile_date','idx_post_snapshot_profile_post_date')) as idxs;
```

Expected: `fns = 2`. `idxs` = 0, 1, or 2 (some may have been pre-covered by the v1 unique constraints — Task 4 resolves this).

- [ ] **Step 4: Smoke-test both functions against real data**

`execute_sql`:

```sql
select count(*) as creator_rows from public.creator_metrics_windowed('30d');
select count(*) as content_rows from public.top_content_windowed('30d', 20);
```

Expected: `creator_rows` > 0 (currently 22), `content_rows` ≥ 0. No error.

- [ ] **Step 5: No commit needed**

The migration file is already committed. Applying it changes the DB, not the repo. Proceed to Task 2.

---

### Task 2: Verify the windowed math with the fixture assertion test

**Files:**
- Run (no edit): `supabase/tests/windowed_metrics_verify.sql`

This test seeds a worked-example fixture, asserts all four windows, and **rolls back** (touches no real rows). Because there is no local `psql`/`supabase` CLI in this repo, run its body through the MCP. The file wraps everything in `begin … rollback`, so nothing persists.

- [ ] **Step 1: Run the assertion test body**

Open `supabase/tests/windowed_metrics_verify.sql`, copy its full contents, and run it via the Supabase MCP `execute_sql` against `wmesjldkqvbzrcpitclu`.

The script seeds creator `00000000-0000-0000-0000-0000000c0001`, asserts each window with `raise exception` on mismatch, raises notice `ALL WINDOWED-METRICS ASSERTIONS PASSED`, then `rollback`.

Expected: completes with **no exception**. Expected per-window values it checks:

| window | views_gained | followers_delta | post_count | insufficient | engagement |
|---|---|---|---|---|---|
| 7d | 2000 | 100 | 2 | false | 0.0643 |
| 30d | 6000 | 200 | 2 | false | 0.0643 |
| 90d | 7000 | 0 | 2 | true | 0.0643 |
| lifetime | 7000 | 200 | 2 | false | 0.0643 |

If any `raise exception 'FAIL …'` fires, STOP — the applied functions differ from the proven SQL. Re-diff the applied function bodies against the migration file before continuing.

- [ ] **Step 2: Confirm the rollback left no fixture rows**

`execute_sql`:

```sql
select count(*) as leftover
from public.creator
where id = '00000000-0000-0000-0000-0000000c0001';
```

Expected: `leftover = 0` (the `rollback` removed the fixture).

- [ ] **Step 3: No commit needed**

Test file already committed; this task is a verification gate only.

---

### Task 3: Create the typed TypeScript wrapper

**Files:**
- Create: `apps/frontend/src/lib/metrics-windowed.ts`

The wrapper exposes the window type, the row shapes, and two async functions. It accepts an injected Supabase client so public pages can pass `getSupabaseRead()` (anon) while admin/`/me` pass their own client. It only maps fields and wraps `media_url` through the existing `/api/proxy-image` route — no math.

- [ ] **Step 1: Write the wrapper file**

Create `apps/frontend/src/lib/metrics-windowed.ts` with exactly:

```ts
/**
 * Phase 0 — typed access to the windowed-metrics SQL functions.
 *
 * All metric math lives in the Postgres functions creator_metrics_windowed /
 * top_content_windowed (migration 20260530000000_windowed_metrics_rpcs.sql).
 * This module is a thin pass-through: call the RPC, return typed rows, and
 * route post thumbnails through /api/proxy-image. No business logic here.
 *
 * Consumers inject a SupabaseClient so the right key is used:
 *   - public pages  -> getSupabaseRead() (anon, public-RLS)
 *   - admin / /me   -> their cookie-aware or service-role client
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseRead } from './supabase-server';

/** Time window for every windowed metric. */
export type MetricWindow = '7d' | '30d' | '90d' | 'lifetime';

/** One row from creator_metrics_windowed. */
export interface CreatorMetricWindowRow {
  creatorId: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryPlatform: string | null;
  followers: number;
  followersDelta: number;
  viewsGained: number;
  /** Ratio (e.g. 0.0643 = 6.43%). null when no qualifying posts. */
  engagement: number | null;
  postCount: number;
  /** True when there is no follower baseline in the window yet (no delta).
   *  Drives the "Building history…" UI state in later phases. */
  insufficient: boolean;
}

/** One row from top_content_windowed. */
export interface TopContentRow {
  externalPostId: string;
  profileId: string;
  creatorId: string;
  creatorName: string | null;
  platform: string;
  handle: string | null;
  captionExcerpt: string | null;
  /** Already routed through /api/proxy-image; null when no media. */
  thumbnailUrl: string | null;
  postedAt: string | null;
  viewsGained: number;
  currentViews: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface WindowedMetricsOpts {
  /** Defaults to the anon read client. Inject a different client for admin/me. */
  client?: SupabaseClient;
  creatorIds?: string[];
  profileIds?: string[];
}

export interface TopContentOpts extends WindowedMetricsOpts {
  /** Max rows to return. Defaults to 20. */
  limit?: number;
}

/** Route a social-CDN URL through our same-origin proxy. Null passes through. */
function viaProxy(url: string | null): string | null {
  if (!url || !url.startsWith('http')) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : v == null ? 0 : Number(v);
}

/**
 * Per-creator windowed metrics. Returns [] on error (logged) so Server
 * Components can fall back to an empty state instead of throwing.
 */
export async function getCreatorMetricsWindowed(
  window: MetricWindow,
  opts: WindowedMetricsOpts = {},
): Promise<CreatorMetricWindowRow[]> {
  const sb = opts.client ?? getSupabaseRead();
  const { data, error } = await sb.rpc('creator_metrics_windowed', {
    p_window: window,
    p_creator_ids: opts.creatorIds ?? null,
    p_profile_ids: opts.profileIds ?? null,
  });
  if (error) {
    console.error('[metrics-windowed] creator_metrics_windowed', error);
    return [];
  }
  return (data ?? []).map(
    (r: Record<string, unknown>): CreatorMetricWindowRow => ({
      creatorId: r.creator_id as string,
      displayName: (r.display_name as string | null) ?? null,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      primaryPlatform: (r.primary_platform as string | null) ?? null,
      followers: toNum(r.followers),
      followersDelta: toNum(r.followers_delta),
      viewsGained: toNum(r.views_gained),
      engagement: r.engagement == null ? null : toNum(r.engagement),
      postCount: toNum(r.post_count),
      insufficient: Boolean(r.insufficient),
    }),
  );
}

/**
 * Top posts by views_gained in the window. Returns [] on error (logged).
 */
export async function getTopContentWindowed(
  window: MetricWindow,
  opts: TopContentOpts = {},
): Promise<TopContentRow[]> {
  const sb = opts.client ?? getSupabaseRead();
  const { data, error } = await sb.rpc('top_content_windowed', {
    p_window: window,
    p_limit: opts.limit ?? 20,
    p_creator_ids: opts.creatorIds ?? null,
    p_profile_ids: opts.profileIds ?? null,
  });
  if (error) {
    console.error('[metrics-windowed] top_content_windowed', error);
    return [];
  }
  return (data ?? []).map(
    (r: Record<string, unknown>): TopContentRow => ({
      externalPostId: r.external_post_id as string,
      profileId: r.profile_id as string,
      creatorId: r.creator_id as string,
      creatorName: (r.creator_name as string | null) ?? null,
      platform: r.platform as string,
      handle: (r.handle as string | null) ?? null,
      captionExcerpt: (r.caption_excerpt as string | null) ?? null,
      thumbnailUrl: viaProxy((r.media_url as string | null) ?? null),
      postedAt: (r.posted_at as string | null) ?? null,
      viewsGained: toNum(r.views_gained),
      currentViews: toNum(r.current_views),
      likes: toNum(r.likes),
      comments: toNum(r.comments),
      shares: toNum(r.shares),
    }),
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `pnpm typecheck`

Expected: PASS (exit 0), no errors referencing `metrics-windowed.ts`.

- [ ] **Step 3: Lint**

Run from repo root: `pnpm lint`

Expected: PASS, no new warnings/errors for `metrics-windowed.ts`. (Do NOT add any `eslint-disable` — project rule.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/metrics-windowed.ts
git commit -m "feat(metrics): typed wrapper for windowed-metrics RPCs (Phase 0)

getCreatorMetricsWindowed + getTopContentWindowed over the
creator_metrics_windowed / top_content_windowed SQL functions. Thin
pass-through: typed rows, proxy-wrapped thumbnails, injectable client.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Resolve redundant indexes

The migration adds two indexes with `if not exists`. The v1 unique constraints (`profile_snapshot_unique_day` on `(profile_id, captured_date)`, `post_snapshot_unique_day` on `(profile_id, external_post_id, captured_date)`) may already serve the same range scans. Drop ours only if truly redundant — keeping a duplicate index wastes write throughput on every daily cron insert.

- [ ] **Step 1: Inspect existing indexes on both snapshot tables**

`execute_sql`:

```sql
select tablename, indexname, indexdef
from pg_indexes
where tablename in ('profile_snapshot','post_snapshot')
order by tablename, indexname;
```

- [ ] **Step 2: Decide and (if needed) drop**

Compare column order + sort direction:
- The unique constraints are ascending on `captured_date`; ours are `captured_date desc`. For `DISTINCT ON (...) ORDER BY ... captured_date DESC`, a descending index is a better match, so **keeping ours is usually justified** even alongside the unique index.
- If `EXPLAIN` (next step) shows the planner using the unique index and ignoring ours, drop ours:

```sql
-- ONLY if confirmed redundant by Step 3:
drop index if exists public.idx_profile_snapshot_profile_date;
drop index if exists public.idx_post_snapshot_profile_post_date;
```

If you drop them, also delete the two `create index if not exists` lines from the migration file so re-applying stays consistent, and commit that edit.

- [ ] **Step 3: Confirm the planner uses an index (not a seq scan)**

`execute_sql`:

```sql
explain
select distinct on (profile_id, external_post_id) profile_id, external_post_id, views
from public.post_snapshot
order by profile_id, external_post_id, captured_date desc;
```

Expected: plan shows an `Index Scan` / `Index Only Scan` (not a bare `Seq Scan` + `Sort` for large data). At current tiny scale a seq scan is acceptable; the index matters as snapshots accrue — note the result, keep the index if in doubt.

- [ ] **Step 4: Commit only if the migration file changed**

```bash
git add supabase/migrations/20260530000000_windowed_metrics_rpcs.sql
git commit -m "chore(db): drop windowed-metrics indexes already covered by unique constraints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Skip this commit if Step 2 decided to keep both indexes.)

---

### Task 5: Final Phase-0 gate

- [ ] **Step 1: Re-run the full verification suite**

1. `execute_sql`: `select count(*) from pg_proc where proname in ('creator_metrics_windowed','top_content_windowed');` → expect 2.
2. Re-run `supabase/tests/windowed_metrics_verify.sql` via MCP → expect no exception, fixture rolled back.
3. From root: `pnpm typecheck` → PASS.
4. From root: `pnpm lint` → PASS.

- [ ] **Step 2: Confirm prod data is untouched**

`execute_sql`:

```sql
select
  (select count(*) from public.creator) as creators,
  (select count(*) from public.profile) as profiles,
  (select count(*) from public.profile_snapshot) as profile_snaps,
  (select count(*) from public.post_snapshot) as post_snaps;
```

Expected: matches the pre-Phase-0 baseline (creators 22, profiles 63, profile_snaps 62, post_snaps 968) — Phase 0 adds functions/indexes only, never rows.

- [ ] **Step 3: Phase 0 done**

The data layer is live and typed. Phases 1–3 (public / admin / creator UI) can now be specced and built against `getCreatorMetricsWindowed` / `getTopContentWindowed`, reading the `insufficient` flag to render "Building history…".

---

## Self-Review

**Spec coverage** (against `2026-05-30-phase0-windowed-metrics-design.md`):
- Two RPCs (creator_metrics_windowed, top_content_windowed) → Task 1 applies them. ✓
- Window model 7d/30d/90d/lifetime → encoded in the migration + `MetricWindow` type (Task 3). ✓
- views_gained / followers_delta / engagement(÷views, guarded) / insufficient definitions → proven (Task 2 asserts all). ✓
- TS wrapper `lib/metrics-windowed.ts` with injectable client + proxy wrap → Task 3. ✓
- Insufficiency guard surfaced to TS → `insufficient` field (Task 3). ✓
- Indexes verify/dedupe → Task 4. ✓
- "Phase 0 does NOT touch UI / lib/queries.ts" → no such files in any task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command shows expected output. The only conditional ("drop index if redundant") has explicit decision criteria + the exact SQL. ✓

**Type consistency:** `MetricWindow` values match the SQL `case` arms (`7d/30d/90d/lifetime`). RPC param names (`p_window`, `p_limit`, `p_creator_ids`, `p_profile_ids`) match the migration signatures exactly. Row field names in the mappers (`creator_id`, `views_gained`, `media_url`, etc.) match the RPC `returns table (...)` columns. ✓

**Honest deviation from the skill's TDD default:** the repo has no JS test runner (`pnpm test` is a no-op, zero spec files). Rather than scaffold jest for one data module, verification uses the committed SQL fixture assertion (`windowed_metrics_verify.sql`, run via MCP) plus `pnpm typecheck`/`pnpm lint`. This is called out so no worker wastes time looking for a jest setup.
