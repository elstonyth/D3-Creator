# Meta Owned-Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest owner-only Meta (IG + FB) insights for connected profiles into 3 private tables on a daily cron, and display them to the creator (`/me`) and agency (admin).

**Architecture:** A new cron loops active Meta `oauth_connection`s, decrypts the stored Page token (`getValidToken`), calls the v25.0 Graph API for account/demographics/per-post insights via pure, unit-tested mappers, and upserts 3 owner-only tables (service-role write, SECDEF-RPC read). Public surfaces are untouched. Mirrors Phase 1's crypto/RPC/cron patterns.

**Tech Stack:** Next.js App Router (Node-runtime route handler), React 19 Server Components, Supabase Postgres (SECURITY DEFINER RPCs), `@supabase/supabase-js`, Meta Graph API v25.0, Jest, pnpm.

## Global Constraints

- **Graph version = `v25.0`** (current; `config.ts` currently `v21.0` — bump it). Deprecations are global-date-based.
- **Never request dead metrics** (fails the whole call): IG `impressions`, `profile_views`; FB `page_impressions`, `page_fans`, `post_impressions`, `*_impressions_unique`. Full live-metric reference = spec §11.
- Owner insights are **private** — the 3 tables have **no anon RLS policy**; reads only via owner/admin SECDEF RPCs. Never feed public leaderboard/dashboard.
- Service-role writes via `getSupabaseAdmin()` from `@d3/database`; DB helpers return `Result<T>`.
- `next build` type-checks (`strictNullChecks` on). Worktree jest command (Windows glob gotcha): `cd apps/frontend && npx jest --testMatch "**/src/**/*.test.ts" --testMatch "**/src/**/*.test.tsx" --no-coverage`.
- Fetchers degrade gracefully: a per-metric Graph error records `null`, never fails the connection. Persist the full `raw` payload.

## Design source

Spec: [docs/superpowers/specs/2026-06-19-meta-owned-insights-design.md](../specs/2026-06-19-meta-owned-insights-design.md). **Read §11 (verified Graph facts) before Task 3.**

## File map

**Create**

- `supabase/migrations/20260619000000_owned_insights.sql` — 3 tables + 2 RPCs
- `apps/frontend/src/lib/oauth/tokens.ts` (+ `tokens.test.ts`)
- `apps/frontend/src/lib/oauth/insights-meta.ts` (+ `insights-meta.test.ts`)
- `libraries/database/src/owned-insights.ts`
- `apps/frontend/src/lib/owned-insights.ts` (frontend RPC readers, + `owned-insights.test.ts` optional)
- `apps/frontend/src/app/api/cron/owned-insights/route.ts`
- `apps/frontend/src/components/insights/demographic-bars.tsx`
- `apps/frontend/src/components/insights/insights-panel.tsx`
- `supabase/tests/owned-insights.mts`

**Modify**

- `apps/frontend/src/lib/oauth/config.ts` — `META_GRAPH_VERSION` → `v25.0`
- `libraries/database/src/index.ts` — export `owned-insights.ts`
- `apps/frontend/vercel.json` — add cron
- `apps/frontend/src/app/(creator)/me/connections/page.tsx` — render insights panel per connected profile
- `apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx` — render insights panel (admin reader)

---

### Task 1: Migration — 3 owner-only tables + 2 RPCs

**Files:** Create `supabase/migrations/20260619000000_owned_insights.sql`

**Interfaces — Produces:** tables `owned_profile_insight`, `owned_audience_demographic`, `owned_post_insight`; RPCs `get_my_owned_insights(uuid, int) returns jsonb`, `get_admin_owned_insights(uuid, int) returns jsonb`.

- [ ] **Step 1: Write the migration**

```sql
-- Owned Meta insights — 3 private tables + 2 status RPCs (2026-06-19).
-- Service-role write; owner/admin read via SECDEF RPCs. NO anon policy.

create table public.owned_profile_insight (
  id bigserial primary key,
  profile_id uuid not null references public.profile(id) on delete cascade,
  captured_date date not null default current_date,
  captured_at timestamptz not null default now(),
  platform text not null check (platform in ('instagram','facebook')),
  reach bigint, views bigint, accounts_engaged bigint, total_interactions bigint,
  page_engagements bigint, follower_delta bigint, follower_total bigint,
  raw jsonb,
  unique (profile_id, captured_date)
);
create table public.owned_audience_demographic (
  id bigserial primary key,
  profile_id uuid not null references public.profile(id) on delete cascade,
  captured_date date not null default current_date,
  dimension text not null check (dimension in ('age','gender','country','city')),
  bucket text not null,
  value bigint not null,
  unique (profile_id, captured_date, dimension, bucket)
);
create table public.owned_post_insight (
  id bigserial primary key,
  profile_id uuid not null references public.profile(id) on delete cascade,
  external_post_id text not null,
  captured_date date not null default current_date,
  captured_at timestamptz not null default now(),
  views bigint, reach bigint, saves bigint, interactions bigint,
  raw jsonb,
  unique (profile_id, external_post_id, captured_date)
);

create index owned_profile_insight_idx on public.owned_profile_insight (profile_id, captured_date desc);
create index owned_audience_demographic_idx on public.owned_audience_demographic (profile_id, captured_date desc);
create index owned_post_insight_idx on public.owned_post_insight (profile_id, captured_date desc);

alter table public.owned_profile_insight enable row level security;
alter table public.owned_audience_demographic enable row level security;
alter table public.owned_post_insight enable row level security;
-- No anon/authenticated policies => service-role only; reads via RPCs below.

-- Owner read: returns null when the caller does not own the profile.
create or replace function public.get_my_owned_insights(p_profile_id uuid, p_days int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when not exists (
      select 1 from public.profile_claim
      where user_id = (select auth.uid()) and profile_id = p_profile_id
    ) then null::jsonb
    else jsonb_build_object(
      'profile', (select coalesce(jsonb_agg(to_jsonb(t) order by t.captured_date), '[]'::jsonb)
        from (select captured_date, reach, views, accounts_engaged, total_interactions,
                     page_engagements, follower_delta, follower_total
              from public.owned_profile_insight
              where profile_id = p_profile_id and captured_date >= current_date - p_days) t),
      'demographics', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
        from (select dimension, bucket, value from public.owned_audience_demographic
              where profile_id = p_profile_id
                and captured_date = (select max(captured_date) from public.owned_audience_demographic
                                     where profile_id = p_profile_id)) d),
      'posts', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select external_post_id, views, reach, saves, interactions
              from public.owned_post_insight
              where profile_id = p_profile_id
                and captured_date = (select max(captured_date) from public.owned_post_insight
                                     where profile_id = p_profile_id)) p)
    )
  end;
$$;

-- Admin read: same shape, gated by is_admin().
create or replace function public.get_admin_owned_insights(p_profile_id uuid, p_days int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not public.is_admin() then null::jsonb
    else jsonb_build_object(
      'profile', (select coalesce(jsonb_agg(to_jsonb(t) order by t.captured_date), '[]'::jsonb)
        from (select captured_date, reach, views, accounts_engaged, total_interactions,
                     page_engagements, follower_delta, follower_total
              from public.owned_profile_insight
              where profile_id = p_profile_id and captured_date >= current_date - p_days) t),
      'demographics', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
        from (select dimension, bucket, value from public.owned_audience_demographic
              where profile_id = p_profile_id
                and captured_date = (select max(captured_date) from public.owned_audience_demographic
                                     where profile_id = p_profile_id)) d),
      'posts', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select external_post_id, views, reach, saves, interactions
              from public.owned_post_insight
              where profile_id = p_profile_id
                and captured_date = (select max(captured_date) from public.owned_post_insight
                                     where profile_id = p_profile_id)) p)
    )
  end;
$$;

revoke execute on function public.get_my_owned_insights(uuid, int)    from public, anon;
revoke execute on function public.get_admin_owned_insights(uuid, int) from public, anon;
grant  execute on function public.get_my_owned_insights(uuid, int)    to authenticated;
grant  execute on function public.get_admin_owned_insights(uuid, int) to authenticated;
```

- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` (name `owned_insights`) — approve the prompt — or `supabase db push`.
- [ ] **Step 3: Verify**

Run (`execute_sql`):

```sql
select to_regclass('public.owned_profile_insight') is not null
   and to_regclass('public.owned_audience_demographic') is not null
   and to_regclass('public.owned_post_insight') is not null as tables_ok,
  (select count(*) from pg_proc where proname in ('get_my_owned_insights','get_admin_owned_insights')) as rpc_count;
```

Expected: `tables_ok=true`, `rpc_count=2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000000_owned_insights.sql
git commit -m "feat(insights): owned-insights tables + owner/admin RPCs"
```

---

### Task 2: Graph version bump + `getValidToken`

**Files:** Modify `apps/frontend/src/lib/oauth/config.ts`; Create `apps/frontend/src/lib/oauth/tokens.ts` + `tokens.test.ts`

**Interfaces — Produces:** `getValidToken(c: OAuthConnectionRow): string`; `interface OAuthConnectionRow { id; platform; access_ct; access_iv; access_tag; status }`.

- [ ] **Step 1: Bump the version**

In `apps/frontend/src/lib/oauth/config.ts`, change:

```ts
export const META_GRAPH_VERSION = 'v25.0'; // bump to latest stable if needed
```

(was `v21.0`. The OAuth dialog/token/`/me/accounts` endpoints used by Phase 1 are version-stable, so the connect flow is unaffected; v21.0 would start rejecting deprecated insight metrics.)

- [ ] **Step 2: Write the failing test**

```ts
/** @jest-environment node */
import { getValidToken } from './tokens';
import { encryptToken } from './crypto';

const KEY = Buffer.alloc(32, 5).toString('base64');
beforeEach(() => {
  process.env.OAUTH_ENC_KEY = KEY;
});

function conn(over: Partial<Record<string, string>> = {}) {
  const b = encryptToken('PAGE_TOKEN_123');
  return {
    id: 'c1',
    platform: 'instagram',
    status: 'active',
    access_ct: b.ct,
    access_iv: b.iv,
    access_tag: b.tag,
    ...over,
  };
}

describe('getValidToken', () => {
  it('returns the decrypted page token for an active connection', () => {
    expect(getValidToken(conn())).toBe('PAGE_TOKEN_123');
  });
  it('throws for a revoked connection', () => {
    expect(() => getValidToken(conn({ status: 'revoked' }))).toThrow(
      /not active/,
    );
  });
  it('throws when the token blob was wiped', () => {
    expect(() => getValidToken(conn({ access_ct: '' }))).toThrow(/not active/);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`...jest src/lib/oauth/tokens` style full-suite command) — "Cannot find module './tokens'".

- [ ] **Step 4: Implement**

```ts
// apps/frontend/src/lib/oauth/tokens.ts
import { decryptToken } from './crypto';

export interface OAuthConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
}

/**
 * Return a usable access token for a connection. For Meta the stored blob is a
 * long-lived Page token (Phase 1) — no proactive refresh; if Graph later returns
 * 401/code 190 the caller marks the connection 'expired' (reconnect to recover).
 */
export function getValidToken(c: OAuthConnectionRow): string {
  if (c.status !== 'active' || !c.access_ct) {
    throw new Error('connection not active');
  }
  return decryptToken({ ct: c.access_ct, iv: c.access_iv, tag: c.access_tag });
}
```

- [ ] **Step 5: Run — expect PASS** (3 tests).
- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/oauth/config.ts apps/frontend/src/lib/oauth/tokens.ts apps/frontend/src/lib/oauth/tokens.test.ts
git commit -m "feat(insights): pin Graph v25.0 + getValidToken for Meta"
```

---

### Task 3: Graph fetchers + pure mappers (`insights-meta.ts`)

**Files:** Create `apps/frontend/src/lib/oauth/insights-meta.ts` + `insights-meta.test.ts`. **Read spec §11 first** for exact endpoints/params.

**Interfaces — Produces:**

- Types: `IgAccountRow {reach,views,accounts_engaged,total_interactions,follower_delta}`, `DemographicRow {dimension,bucket,value}`, `MediaRow {views,reach,saves,interactions}`, `FbPageRow {views,page_engagements,reach}`, `FbPostRow {views,interactions}`.
- Pure mappers: `pickMetric`, `mapIgAccount`, `mapDemographics`, `mapMedia`, `mapFbPage`, `mapFbPost`.
- Async fetchers: `fetchIgAccount`, `fetchFollowerTotal`, `fetchIgDemographics`, `fetchIgMedia`, `fetchFbPage`, `fetchFbPostInsight`.

- [ ] **Step 1: Write the failing test** (covers the pure mappers — the volatile, logic-bearing part)

```ts
/** @jest-environment node */
import {
  pickMetric,
  mapIgAccount,
  mapDemographics,
  mapMedia,
} from './insights-meta';

describe('insights-meta mappers', () => {
  it('pickMetric reads total_value then values[0]', () => {
    const data = [
      { name: 'views', total_value: { value: 500 } },
      { name: 'follower_count', values: [{ value: 12 }] },
    ];
    expect(pickMetric(data, 'views')).toBe(500);
    expect(pickMetric(data, 'follower_count')).toBe(12);
    expect(pickMetric(data, 'missing')).toBeNull();
  });

  it('mapIgAccount maps live metrics, never reads dead ones', () => {
    const row = mapIgAccount({
      data: [
        { name: 'reach', total_value: { value: 800 } },
        { name: 'views', total_value: { value: 1500 } },
        { name: 'accounts_engaged', total_value: { value: 90 } },
        { name: 'total_interactions', total_value: { value: 240 } },
        { name: 'follower_count', values: [{ value: 7 }] },
      ],
    });
    expect(row).toEqual({
      reach: 800,
      views: 1500,
      accounts_engaged: 90,
      total_interactions: 240,
      follower_delta: 7,
    });
  });

  it('mapDemographics flattens breakdowns to rows', () => {
    const rows = mapDemographics('country', {
      data: [
        {
          name: 'follower_demographics',
          total_value: {
            breakdowns: [
              {
                dimension_keys: ['country'],
                results: [
                  { dimension_values: ['MY'], value: 300 },
                  { dimension_values: ['SG'], value: 120 },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(rows).toEqual([
      { dimension: 'country', bucket: 'MY', value: 300 },
      { dimension: 'country', bucket: 'SG', value: 120 },
    ]);
  });

  it('mapMedia reads per-media values', () => {
    expect(
      mapMedia({
        data: [
          { name: 'views', values: [{ value: 999 }] },
          { name: 'reach', values: [{ value: 600 }] },
          { name: 'saved', values: [{ value: 22 }] },
          { name: 'total_interactions', values: [{ value: 80 }] },
        ],
      }),
    ).toEqual({ views: 999, reach: 600, saves: 22, interactions: 80 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/insights-meta.ts
// Meta Graph v25.0 owner insights. Live metrics only (spec §11). Fetchers degrade
// gracefully — a metric the API rejects yields null, never throws past the caller.
import { META_GRAPH_VERSION } from './config';

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TIMEOUT = 15000;

interface MetricEntry {
  name: string;
  total_value?: {
    value?: number;
    breakdowns?: Array<{
      dimension_keys?: string[];
      results?: Array<{ dimension_values?: string[]; value?: number }>;
    }>;
  };
  values?: Array<{ value?: number | Record<string, number> }>;
}
interface InsightsResponse {
  data?: MetricEntry[];
}

export function pickMetric(
  data: MetricEntry[] | undefined,
  name: string,
): number | null {
  const e = (data ?? []).find((m) => m.name === name);
  if (!e) return null;
  if (typeof e.total_value?.value === 'number') return e.total_value.value;
  const v = e.values?.[0]?.value;
  return typeof v === 'number' ? v : null;
}

export interface IgAccountRow {
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  follower_delta: number | null;
}
export function mapIgAccount(json: InsightsResponse): IgAccountRow {
  const d = json.data;
  return {
    reach: pickMetric(d, 'reach'),
    views: pickMetric(d, 'views'),
    accounts_engaged: pickMetric(d, 'accounts_engaged'),
    total_interactions: pickMetric(d, 'total_interactions'),
    follower_delta: pickMetric(d, 'follower_count'),
  };
}

export interface DemographicRow {
  dimension: string;
  bucket: string;
  value: number;
}
export function mapDemographics(
  dimension: string,
  json: InsightsResponse,
): DemographicRow[] {
  const e = (json.data ?? []).find((m) => m.name === 'follower_demographics');
  const out: DemographicRow[] = [];
  for (const b of e?.total_value?.breakdowns ?? []) {
    for (const r of b.results ?? []) {
      const bucket = r.dimension_values?.[0];
      if (bucket != null && typeof r.value === 'number')
        out.push({ dimension, bucket, value: r.value });
    }
  }
  return out;
}

export interface MediaRow {
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
}
export function mapMedia(json: InsightsResponse): MediaRow {
  const d = json.data;
  return {
    views: pickMetric(d, 'views'),
    reach: pickMetric(d, 'reach'),
    saves: pickMetric(d, 'saved'),
    interactions: pickMetric(d, 'total_interactions'),
  };
}

export interface FbPageRow {
  views: number | null;
  page_engagements: number | null;
  reach: number | null;
}
export function mapFbPage(json: InsightsResponse): FbPageRow {
  const d = json.data;
  return {
    views: pickMetric(d, 'page_media_view'),
    page_engagements: pickMetric(d, 'page_post_engagements'),
    reach: pickMetric(d, 'page_total_media_view_unique'),
  };
}

export interface FbPostRow {
  views: number | null;
  interactions: number | null;
}
export function mapFbPost(
  viewsJson: InsightsResponse,
  engagedJson: InsightsResponse,
): FbPostRow {
  return {
    views: pickMetric(viewsJson.data, 'post_media_view'),
    interactions: pickMetric(engagedJson.data, 'post_engaged_users'),
  };
}

// ---- Fetchers (verified against Explorer with a real connected account before trusting) ----
async function getJson(
  url: string,
): Promise<InsightsResponse & { error?: { code?: number; message?: string } }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const json = await res.json();
  if (!res.ok || json.error) {
    const err = new Error(
      `Graph ${res.status}: ${json?.error?.message ?? 'error'}`,
    ) as Error & { graphCode?: number; httpStatus?: number };
    err.graphCode = json?.error?.code;
    err.httpStatus = res.status;
    throw err;
  }
  return json;
}

const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

export function fetchIgAccount(igId: string, token: string) {
  return getJson(
    `${GRAPH}/${igId}/insights?${q({ metric: 'reach,views,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', access_token: token })}`,
  ).then(mapIgAccount);
}
export async function fetchFollowerCountDay(
  igId: string,
  token: string,
): Promise<number | null> {
  const json = await getJson(
    `${GRAPH}/${igId}/insights?${q({ metric: 'follower_count', period: 'day', access_token: token })}`,
  );
  return pickMetric(json.data, 'follower_count');
}
export async function fetchFollowerTotal(
  nodeId: string,
  token: string,
): Promise<number | null> {
  const res = await fetch(
    `${GRAPH}/${nodeId}?${q({ fields: 'followers_count', access_token: token })}`,
    { signal: AbortSignal.timeout(TIMEOUT) },
  );
  const json = await res.json();
  return typeof json?.followers_count === 'number'
    ? json.followers_count
    : null;
}
export async function fetchIgDemographics(
  igId: string,
  token: string,
): Promise<DemographicRow[]> {
  const dims = ['age', 'gender', 'country', 'city'];
  const out: DemographicRow[] = [];
  for (const dim of dims) {
    try {
      const json = await getJson(
        `${GRAPH}/${igId}/insights?${q({ metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'last_90_days', breakdown: dim, access_token: token })}`,
      );
      out.push(...mapDemographics(dim, json));
    } catch {
      /* a dimension failing (e.g. <100 followers) is non-fatal */
    }
  }
  return out;
}
export function fetchIgMedia(mediaId: string, token: string) {
  return getJson(
    `${GRAPH}/${mediaId}/insights?${q({ metric: 'views,reach,saved,total_interactions', access_token: token })}`,
  ).then(mapMedia);
}
export function fetchFbPage(pageId: string, token: string) {
  return getJson(
    `${GRAPH}/${pageId}/insights?${q({ metric: 'page_media_view,page_post_engagements,page_total_media_view_unique', period: 'day', access_token: token })}`,
  ).then(mapFbPage);
}
export async function fetchFbPostInsight(
  postId: string,
  token: string,
): Promise<FbPostRow> {
  // post_media_view must be requested SOLO (can't combine in one call — spec §11).
  const views = await getJson(
    `${GRAPH}/${postId}/insights?${q({ metric: 'post_media_view', period: 'lifetime', access_token: token })}`,
  ).catch(() => ({ data: [] }));
  const engaged = await getJson(
    `${GRAPH}/${postId}/insights?${q({ metric: 'post_engaged_users', period: 'lifetime', access_token: token })}`,
  ).catch(() => ({ data: [] }));
  return mapFbPost(views, engaged);
}
```

- [ ] **Step 4: Run — expect PASS** (mappers, 4 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/insights-meta.ts apps/frontend/src/lib/oauth/insights-meta.test.ts
git commit -m "feat(insights): Meta Graph fetchers + pure mappers (v25.0 live metrics)"
```

---

### Task 4: DB upsert helpers (`@d3/database`)

**Files:** Create `libraries/database/src/owned-insights.ts`; Modify `libraries/database/src/index.ts`; Create `supabase/tests/owned-insights.mts`

**Interfaces — Consumes:** `getSupabaseAdmin`. **Produces:** `upsertProfileInsight`, `replaceAudienceDemographics`, `upsertPostInsight`, `setConnectionStatus`.

- [ ] **Step 1: Implement helpers**

```ts
// libraries/database/src/owned-insights.ts
import { getSupabaseAdmin } from './supabase-server';
import type { Result } from './types';

export interface ProfileInsightInput {
  profile_id: string;
  platform: 'instagram' | 'facebook';
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  page_engagements: number | null;
  follower_delta: number | null;
  follower_total: number | null;
  raw: unknown;
}
export async function upsertProfileInsight(
  i: ProfileInsightInput,
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('owned_profile_insight')
    .upsert(
      { ...i, captured_at: new Date().toISOString() },
      { onConflict: 'profile_id,captured_date' },
    );
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}

export interface DemographicInput {
  dimension: string;
  bucket: string;
  value: number;
}
/** Replace today's demographics for a profile (delete-then-insert in one day window). */
export async function replaceAudienceDemographics(
  profile_id: string,
  rows: DemographicInput[],
): Promise<Result<number>> {
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const del = await db
    .from('owned_audience_demographic')
    .delete()
    .eq('profile_id', profile_id)
    .eq('captured_date', today);
  if (del.error) return { ok: false, error: del.error.message };
  if (rows.length === 0) return { ok: true, value: 0 };
  const ins = await db
    .from('owned_audience_demographic')
    .insert(rows.map((r) => ({ profile_id, captured_date: today, ...r })));
  return ins.error
    ? { ok: false, error: ins.error.message }
    : { ok: true, value: rows.length };
}

export interface PostInsightInput {
  profile_id: string;
  external_post_id: string;
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
  raw: unknown;
}
export async function upsertPostInsight(
  i: PostInsightInput,
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('owned_post_insight')
    .upsert(
      { ...i, captured_at: new Date().toISOString() },
      { onConflict: 'profile_id,external_post_id,captured_date' },
    );
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}

export async function setConnectionStatus(
  connection_id: string,
  status: 'active' | 'expired' | 'revoked',
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('oauth_connection')
    .update({ status })
    .eq('id', connection_id);
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}
```

- [ ] **Step 2: Export from index** — in `libraries/database/src/index.ts` after the `./oauth` block add:

```ts
export {
  upsertProfileInsight,
  replaceAudienceDemographics,
  upsertPostInsight,
  setConnectionStatus,
  type ProfileInsightInput,
  type DemographicInput,
  type PostInsightInput,
} from './owned-insights';
```

- [ ] **Step 3: Integration test**

```ts
// supabase/tests/owned-insights.mts  — run: npx tsx supabase/tests/owned-insights.mts
import 'dotenv/config';
import {
  getSupabaseAdmin,
  upsertProfileInsight,
  replaceAudienceDemographics,
  upsertPostInsight,
} from '../../libraries/database/src/index';

const db = getSupabaseAdmin();
let pass = 0,
  fail = 0;
const check = (n: string, c: boolean) =>
  c ? (pass++, console.log(`ok  ${n}`)) : (fail++, console.error(`FAIL ${n}`));
let creatorId = '',
  profileId = '';
try {
  const { data: creator } = await db
    .from('creator')
    .insert({ display_name: 'Insights Test' })
    .select('id')
    .single();
  if (!creator) throw new Error('creator insert');
  creatorId = creator.id;
  const { data: profile } = await db
    .from('profile')
    .insert({
      creator_id: creatorId,
      platform: 'instagram',
      profile_url: `https://www.instagram.com/ins_test_${Date.now()}`,
      handle: 'ins_test',
    })
    .select('id')
    .single();
  if (!profile) throw new Error('profile insert');
  profileId = profile.id;

  const pi = await upsertProfileInsight({
    profile_id: profileId,
    platform: 'instagram',
    reach: 800,
    views: 1500,
    accounts_engaged: 90,
    total_interactions: 240,
    page_engagements: null,
    follower_delta: 7,
    follower_total: 5000,
    raw: { x: 1 },
  });
  check('profile insight upsert', pi.ok === true);

  const dem = await replaceAudienceDemographics(profileId, [
    { dimension: 'country', bucket: 'MY', value: 300 },
    { dimension: 'country', bucket: 'SG', value: 120 },
  ]);
  check('demographics replace', dem.ok === true && dem.value === 2);
  // idempotent replace
  const dem2 = await replaceAudienceDemographics(profileId, [
    { dimension: 'country', bucket: 'MY', value: 350 },
  ]);
  const { count } = await db
    .from('owned_audience_demographic')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);
  check('demographics replaced not appended', dem2.ok === true && count === 1);

  const po = await upsertPostInsight({
    profile_id: profileId,
    external_post_id: 'M1',
    views: 999,
    reach: 600,
    saves: 22,
    interactions: 80,
    raw: {},
  });
  check('post insight upsert', po.ok === true);

  const { data: read } = await db
    .from('owned_profile_insight')
    .select('views')
    .eq('profile_id', profileId)
    .single();
  check('readback views', read?.views === 1500);
} finally {
  if (profileId) {
    await db.from('owned_post_insight').delete().eq('profile_id', profileId);
    await db
      .from('owned_audience_demographic')
      .delete()
      .eq('profile_id', profileId);
    await db.from('owned_profile_insight').delete().eq('profile_id', profileId);
  }
  if (creatorId) {
    await db.from('profile').delete().eq('creator_id', creatorId);
    await db.from('creator').delete().eq('id', creatorId);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 4: Run** (after Task 1 applied): `npx tsx supabase/tests/owned-insights.mts` → `5 passed, 0 failed`.
- [ ] **Step 5: Commit**

```bash
git add libraries/database/src/owned-insights.ts libraries/database/src/index.ts supabase/tests/owned-insights.mts
git commit -m "feat(insights): owned-insights db upsert helpers + integration test"
```

---

### Task 5: Ingest cron + schedule

**Files:** Create `apps/frontend/src/app/api/cron/owned-insights/route.ts`; Modify `apps/frontend/vercel.json`

**Interfaces — Consumes:** `getValidToken`, fetchers from `insights-meta`, db helpers from `@d3/database`, `getSupabaseAdmin`. The cron reads `oauth_connection` directly via the admin client (service role) for token blobs.

- [ ] **Step 1: Implement the cron**

```ts
// apps/frontend/src/app/api/cron/owned-insights/route.ts
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@d3/database';
import {
  upsertProfileInsight,
  replaceAudienceDemographics,
  upsertPostInsight,
  setConnectionStatus,
} from '@d3/database';
import {
  getValidToken,
  type OAuthConnectionRow,
} from '@gitroom/frontend/lib/oauth/tokens';
import { withTimeout } from '@gitroom/frontend/lib/with-timeout';
import {
  fetchIgAccount,
  fetchFollowerCountDay,
  fetchFollowerTotal,
  fetchIgDemographics,
  fetchIgMedia,
  fetchFbPage,
  fetchFbPostInsight,
} from '@gitroom/frontend/lib/oauth/insights-meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PER_CONNECTION_MS = 60000;
const MEDIA_LIMIT = 12; // recent posts to pull per-post insights for

function assertAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected)
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  const auth = request.headers.get('authorization') || '';
  const full = `Bearer ${expected}`;
  if (
    auth.length !== full.length ||
    !timingSafeEqual(Buffer.from(auth), Buffer.from(full))
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

function isAuthError(e: unknown): boolean {
  const x = e as { graphCode?: number; httpStatus?: number };
  return x?.httpStatus === 401 || x?.graphCode === 190;
}

async function ingestConnection(
  conn: OAuthConnectionRow & {
    profile_id: string;
    external_account_id: string;
  },
) {
  const token = getValidToken(conn);
  if (conn.platform === 'instagram') {
    const igId = conn.external_account_id;
    const [account, followerDelta, followerTotal] = await Promise.all([
      fetchIgAccount(igId, token).catch(() => null),
      fetchFollowerCountDay(igId, token).catch(() => null),
      fetchFollowerTotal(igId, token).catch(() => null),
    ]);
    await upsertProfileInsight({
      profile_id: conn.profile_id,
      platform: 'instagram',
      reach: account?.reach ?? null,
      views: account?.views ?? null,
      accounts_engaged: account?.accounts_engaged ?? null,
      total_interactions: account?.total_interactions ?? null,
      page_engagements: null,
      follower_delta: followerDelta,
      follower_total: followerTotal,
      raw: account,
    });
    const demographics = await fetchIgDemographics(igId, token).catch(() => []);
    await replaceAudienceDemographics(conn.profile_id, demographics);
    // recent media → per-post insights
    const db = getSupabaseAdmin();
    const { data: posts } = await db
      .from('post_snapshot')
      .select('external_post_id')
      .eq('profile_id', conn.profile_id)
      .order('captured_at', { ascending: false })
      .limit(MEDIA_LIMIT);
    const seen = new Set<string>();
    for (const p of posts ?? []) {
      const pid = p.external_post_id as string;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const m = await fetchIgMedia(pid, token).catch(() => null);
      if (m)
        await upsertPostInsight({
          profile_id: conn.profile_id,
          external_post_id: pid,
          views: m.views,
          reach: m.reach,
          saves: m.saves,
          interactions: m.interactions,
          raw: m,
        });
    }
  } else {
    const pageId = conn.external_account_id;
    const [page, followerTotal] = await Promise.all([
      fetchFbPage(pageId, token).catch(() => null),
      fetchFollowerTotal(pageId, token).catch(() => null),
    ]);
    await upsertProfileInsight({
      profile_id: conn.profile_id,
      platform: 'facebook',
      reach: page?.reach ?? null,
      views: page?.views ?? null,
      accounts_engaged: null,
      total_interactions: null,
      page_engagements: page?.page_engagements ?? null,
      follower_delta: null,
      follower_total: followerTotal,
      raw: page,
    });
    const db = getSupabaseAdmin();
    const { data: posts } = await db
      .from('post_snapshot')
      .select('external_post_id')
      .eq('profile_id', conn.profile_id)
      .order('captured_at', { ascending: false })
      .limit(MEDIA_LIMIT);
    const seen = new Set<string>();
    for (const p of posts ?? []) {
      const pid = p.external_post_id as string;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const fp = await fetchFbPostInsight(pid, token).catch(() => null);
      if (fp)
        await upsertPostInsight({
          profile_id: conn.profile_id,
          external_post_id: pid,
          views: fp.views,
          reach: null,
          saves: null,
          interactions: fp.interactions,
          raw: fp,
        });
    }
  }
}

export async function GET(request: Request): Promise<Response> {
  const fail = assertAuth(request);
  if (fail) return fail;
  const db = getSupabaseAdmin();
  const { data: conns, error } = await db
    .from('oauth_connection')
    .select(
      'id, platform, status, access_ct, access_iv, access_tag, profile_id, external_account_id',
    )
    .eq('status', 'active')
    .in('platform', ['instagram', 'facebook']);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{
    connection_id: string;
    platform: string;
    status: string;
    error?: string;
  }> = [];
  for (const c of conns ?? []) {
    try {
      await withTimeout(
        ingestConnection(
          c as OAuthConnectionRow & {
            profile_id: string;
            external_account_id: string;
          },
        ),
        PER_CONNECTION_MS,
      );
      results.push({ connection_id: c.id, platform: c.platform, status: 'ok' });
    } catch (e) {
      if (isAuthError(e)) {
        await setConnectionStatus(c.id, 'expired').catch(() => {});
        results.push({
          connection_id: c.id,
          platform: c.platform,
          status: 'expired',
        });
      } else {
        console.error('[owned-insights] failed', {
          connection_id: c.id,
          platform: c.platform,
          error: (e as Error).message,
        });
        results.push({
          connection_id: c.id,
          platform: c.platform,
          status: 'failed',
          error: (e as Error).message,
        });
      }
    }
  }
  return NextResponse.json(
    {
      processed: results.length,
      by_status: results.reduce<Record<string, number>>(
        (a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a),
        {},
      ),
      results,
    },
    { status: 200 },
  );
}
```

- [ ] **Step 2: Add the cron schedule** — in `apps/frontend/vercel.json` add to `crons`:

```json
{
  "path": "/api/cron/owned-insights",
  "schedule": "30 1 * * *"
}
```

- [ ] **Step 3: Type-check** — `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` → exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/cron/owned-insights apps/frontend/vercel.json
git commit -m "feat(insights): daily owned-insights ingest cron + schedule"
```

---

### Task 6: Frontend RPC readers

**Files:** Create `apps/frontend/src/lib/owned-insights.ts`

**Interfaces — Produces:** `getMyOwnedInsights(client, profileId)`, `getAdminOwnedInsights(client, profileId)` → `OwnedInsights | null`; `interface OwnedInsights { profile: ProfileDay[]; demographics: DemoRow[]; posts: PostRow[] }`.

- [ ] **Step 1: Implement**

```ts
// apps/frontend/src/lib/owned-insights.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileDay {
  captured_date: string;
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  page_engagements: number | null;
  follower_delta: number | null;
  follower_total: number | null;
}
export interface DemoRow {
  dimension: string;
  bucket: string;
  value: number;
}
export interface PostRow {
  external_post_id: string;
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
}
export interface OwnedInsights {
  profile: ProfileDay[];
  demographics: DemoRow[];
  posts: PostRow[];
}

function normalize(data: unknown): OwnedInsights | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<OwnedInsights>;
  return {
    profile: d.profile ?? [],
    demographics: d.demographics ?? [],
    posts: d.posts ?? [],
  };
}

export async function getMyOwnedInsights(
  client: SupabaseClient,
  profileId: string,
  days = 30,
): Promise<OwnedInsights | null> {
  const { data, error } = await client.rpc('get_my_owned_insights', {
    p_profile_id: profileId,
    p_days: days,
  });
  if (error) throw error;
  return normalize(data);
}
export async function getAdminOwnedInsights(
  client: SupabaseClient,
  profileId: string,
  days = 30,
): Promise<OwnedInsights | null> {
  const { data, error } = await client.rpc('get_admin_owned_insights', {
    p_profile_id: profileId,
    p_days: days,
  });
  if (error) throw error;
  return normalize(data);
}
```

- [ ] **Step 2: Type-check** → exit 0.
- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/owned-insights.ts
git commit -m "feat(insights): typed RPC readers for owned insights"
```

---

### Task 7: Demographic bars + insights panel components

**Files:** Create `apps/frontend/src/components/insights/demographic-bars.tsx`, `apps/frontend/src/components/insights/insights-panel.tsx`. Read `DESIGN.md` + `dashboard-showcase/sparkline.tsx` first to match the design language.

**Interfaces — Consumes:** `OwnedInsights` from `lib/owned-insights`. **Produces:** `<DemographicBars rows={DemoRow[]} dimension="country" />`, `<InsightsPanel data={OwnedInsights} />`.

- [ ] **Step 1: Demographic bars**

```tsx
// apps/frontend/src/components/insights/demographic-bars.tsx
import type { DemoRow } from '@gitroom/frontend/lib/owned-insights';

export function DemographicBars({
  rows,
  dimension,
  title,
}: {
  rows: DemoRow[];
  dimension: string;
  title: string;
}) {
  const filtered = rows
    .filter((r) => r.dimension === dimension)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  if (filtered.length === 0) return null;
  const max = Math.max(...filtered.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-caption text-fgSubtle uppercase tracking-wide">
        {title}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {filtered.map((r) => (
          <li key={r.bucket} className="flex items-center gap-3">
            <span className="text-caption text-fgMuted w-20 truncate">
              {r.bucket}
            </span>
            <div className="flex-1 h-2 rounded-full bg-borderGlass overflow-hidden">
              <div
                className="h-full rounded-full bg-aurora-cta"
                style={{ width: `${Math.round((r.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-caption text-fg tabular-nums w-12 text-right">
              {r.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Insights panel**

```tsx
// apps/frontend/src/components/insights/insights-panel.tsx
import type { OwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { DemographicBars } from './demographic-bars';

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="glass-base border border-borderGlass rounded-xl px-4 py-3 flex flex-col gap-1">
      <span className="text-caption text-fgSubtle">{label}</span>
      <span className="text-heading text-fg tabular-nums">
        {value == null ? '—' : value.toLocaleString()}
      </span>
    </div>
  );
}

export function InsightsPanel({ data }: { data: OwnedInsights }) {
  const latest = data.profile[data.profile.length - 1];
  if (!latest && data.demographics.length === 0) return null;
  return (
    <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-heading text-fg">Owner insights</h3>
        <p className="text-caption text-fgSubtle mt-1">
          Official metrics from your connected account · latest day
        </p>
      </div>
      {latest ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Reach" value={latest.reach} />
          <StatTile label="Views" value={latest.views} />
          <StatTile
            label="Engaged"
            value={latest.accounts_engaged ?? latest.page_engagements}
          />
          <StatTile label="Followers" value={latest.follower_total} />
        </div>
      ) : null}
      {data.demographics.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <DemographicBars
            rows={data.demographics}
            dimension="country"
            title="Top countries"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="age"
            title="Age"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="gender"
            title="Gender"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="city"
            title="Top cities"
          />
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Type-check** → exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/insights
git commit -m "feat(insights): demographic bars + insights panel components"
```

---

### Task 8: Creator display (`/me/connections`)

**Files:** Modify `apps/frontend/src/app/(creator)/me/connections/page.tsx`

**Interfaces — Consumes:** `getMyOwnedInsights`, `InsightsPanel`. The page already loads `getMyConnections(sb)` and has a cookie-aware `sb`.

- [ ] **Step 1: Render a panel per connected profile**

In `page.tsx`, add imports at top:

```tsx
import { getMyOwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { InsightsPanel } from '@gitroom/frontend/components/insights/insights-panel';
```

The connection rows from `get_my_oauth_connections()` do not include `profile_id`. Add a small server query to map each connection to its profile via `oauth_connection` is service-role-only — instead fetch the caller's owned profile ids through the existing claim path. Simplest: query insights by the connection's profile through a new RPC arg is overkill; reuse the owner claim. Add, after `const connections = await getMyConnections(sb);`:

```tsx
// Pull insights for each owned profile the user has (owner claims). The RPC is
// owner-guarded, so a non-owned profile returns null and is skipped.
const { data: claims } = await sb
  .from('profile_claim')
  .select('profile_id')
  .eq('claim_kind', 'owner');
const insightsByProfile = await Promise.all(
  (claims ?? []).map(async (c) => ({
    profileId: c.profile_id as string,
    data: await getMyOwnedInsights(sb, c.profile_id as string),
  })),
);
```

Then render below the "Connected accounts" section:

```tsx
{
  insightsByProfile
    .filter((x) => x.data)
    .map((x) => <InsightsPanel key={x.profileId} data={x.data!} />);
}
```

- [ ] **Step 2: Type-check** → exit 0. Dev-smoke optional (no connected data until the cron runs against a real account).
- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/app/(creator)/me/connections/page.tsx"
git commit -m "feat(insights): show owner insights on /me/connections"
```

---

### Task 9: Admin display (`/admin/creators/[id]`)

**Files:** Modify `apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx`

**Interfaces — Consumes:** `getAdminOwnedInsights`, `InsightsPanel`, the existing `CreatorConnections` section.

- [ ] **Step 1: Render admin insights per connected profile of the creator**

Add imports:

```tsx
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAdminOwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { InsightsPanel } from '@gitroom/frontend/components/insights/insights-panel';
```

After the `detail` is loaded, gather the creator's profiles that have a connection and pull admin insights:

```tsx
const sb = await getSupabaseRoute();
const { data: profs } = await getSupabaseAdmin()
  .from('profile')
  .select('id')
  .eq('creator_id', id);
const adminInsights = await Promise.all(
  (profs ?? []).map(async (p) => ({
    profileId: p.id as string,
    data: await getAdminOwnedInsights(sb, p.id as string),
  })),
);
```

Render after `<CreatorConnections creatorId={id} />`:

```tsx
{
  adminInsights
    .filter(
      (x) =>
        x.data && (x.data.profile.length > 0 || x.data.demographics.length > 0),
    )
    .map((x) => <InsightsPanel key={x.profileId} data={x.data!} />);
}
```

(`getSupabaseAdmin` is already imported in this file from Phase 1; `getAdminOwnedInsights` runs on the cookie-aware `sb` so the `is_admin()` gate applies.)

- [ ] **Step 2: Type-check** → exit 0.
- [ ] **Step 3: Final full check** — `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` and the full jest suite (expect prior 110 + new: tokens 3 + insights-meta 4 = ~117 passing).
- [ ] **Step 4: Commit**

```bash
git add "apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx"
git commit -m "feat(insights): show owner insights on admin creator detail"
```

---

### Task 10: Live verification note (post-build, owner-gated)

Not code — a checklist the owner runs once a real account is connected (several FB metrics are medium-confidence per spec §11):

- [ ] In Graph API Explorer with the connected Page token, confirm each fetcher's metric list returns data (not an "invalid metric" error): IG `reach,views,accounts_engaged,total_interactions`, `follower_count`, `follower_demographics` (per breakdown), media `views,reach,saved,total_interactions`; FB `page_media_view,page_post_engagements,page_total_media_view_unique`, `post_media_view` (solo), `post_engaged_users`.
- [ ] Any metric that errors → remove it from that fetcher's `metric=` list (the column just stays null; `raw` still captures whatever returned).
- [ ] Trigger the cron once manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://www.d3creator.com/api/cron/owned-insights` and confirm rows land in the 3 tables.

---

## Self-review

**Spec coverage:** §2 decisions → all honored. §4 tables → Task 1 (corrected columns). §5 `getValidToken` → Task 2. §6 ingest cron → Task 5; fetchers/mappers → Task 3. §7 display → Tasks 7–9. §9 testing → Tasks 2/3 (unit), 4 (integration). §10 security → Task 1 RLS + RPCs. §11 live metrics → Task 3 fetchers + Task 10 verify.

**Placeholder scan:** none — every code step has complete code. Task 10 is explicitly a human verification checklist, not a code placeholder.

**Type consistency:** `OwnedInsights {profile,demographics,posts}` consistent across Task 6 reader, Task 7 components, Tasks 8–9 pages. Mapper row types (`IgAccountRow` etc.) in Task 3 feed `upsertProfileInsight`/`upsertPostInsight` inputs in Task 4 (field names align: reach/views/accounts_engaged/total_interactions/follower_delta/follower_total; views/reach/saves/interactions). RPC names `get_my_owned_insights`/`get_admin_owned_insights` consistent between Task 1 SQL and Task 6 readers. `setConnectionStatus`/`getValidToken`/`OAuthConnectionRow` consistent between Tasks 2/4 and the Task 5 cron.

**Known medium-confidence (flagged, handled):** FB `page_media_view`/`page_post_engagements`/`page_total_media_view_unique` and whether `metric_type=total_value` is needed — fetchers degrade to null on error; Task 10 verifies live. Demographics need >100 followers; `fetchIgDemographics` swallows per-dimension errors.
