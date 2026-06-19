# TikTok Owned-Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest owner-only TikTok account + per-video stats for connected TikTok profiles into the existing owned-insight tables on the existing daily cron, and surface them in the existing `InsightsPanel`.

**Architecture:** Reuse the merged Meta-insight infra (3 owned tables, 2 RPCs, `/api/cron/owned-insights`, `InsightsPanel`). Add a TikTok branch: pure mappers + fetchers in `insights-tiktok.ts`, a real lazy token refresh in `getValidToken` (TikTok access expires ~24h), and a one-line CHECK-constraint widening. No demographics.

**Tech Stack:** Next.js Node-runtime cron, Supabase Postgres, TikTok Open API (Display) v2, `@supabase/supabase-js`, Node `crypto`, Jest, pnpm.

## Global Constraints

- Owner insights private — reuse the existing no-anon RLS + SECDEF RPCs. Never public.
- TikTok refresh tokens are **rotated** on every refresh — persist the new one (re-encrypted).
- `getValidToken` is changing from sync → **async**; the existing Meta call site in the cron must `await` it.
- Worktree jest: `cd apps/frontend && npx jest --testMatch "**/src/**/*.test.ts" --testMatch "**/src/**/*.test.tsx" --no-coverage`.
- `next build` type-checks (`strictNullChecks` on).

## Design source

Spec: [docs/superpowers/specs/2026-06-19-tiktok-owned-insights-design.md](../specs/2026-06-19-tiktok-owned-insights-design.md).

## File map

**Create**

- `supabase/migrations/20260619100000_owned_insight_allow_tiktok.sql`
- `apps/frontend/src/lib/oauth/insights-tiktok.ts` (+ `insights-tiktok.test.ts`)

**Modify**

- `apps/frontend/src/lib/oauth/tokens.ts` (+ `tokens.test.ts`) — async + TikTok refresh
- `libraries/database/src/owned-insights.ts` — `updateConnectionTokens` helper
- `libraries/database/src/index.ts` — export it
- `apps/frontend/src/app/api/cron/owned-insights/route.ts` — tiktok filter + branch + `await getValidToken`
- `apps/frontend/src/components/insights/insights-panel.tsx` — Engaged tile fallback
- `supabase/tests/owned-insights.mts` — tiktok upsert + token-update assertions

---

### Task 1: Migration — allow `platform='tiktok'`

**Files:** Create `supabase/migrations/20260619100000_owned_insight_allow_tiktok.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Allow TikTok rows in owned_profile_insight (Meta spec restricted it to ig/fb).
alter table public.owned_profile_insight drop constraint owned_profile_insight_platform_check;
alter table public.owned_profile_insight add constraint owned_profile_insight_platform_check
  check (platform in ('instagram','facebook','tiktok'));
```

- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` (name `owned_insight_allow_tiktok`) or `supabase db push`.
- [ ] **Step 3: Verify**

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='owned_profile_insight_platform_check';
```

Expected: includes `'tiktok'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619100000_owned_insight_allow_tiktok.sql
git commit -m "feat(insights): allow tiktok in owned_profile_insight"
```

---

### Task 2: TikTok fetchers + pure mappers (`insights-tiktok.ts`)

**Files:** Create `apps/frontend/src/lib/oauth/insights-tiktok.ts` + `insights-tiktok.test.ts`

**Interfaces — Produces:**

- `TikTokAccountRow { follower_total: number|null; total_interactions: number|null; following_count: number|null; video_count: number|null }`
- `TikTokVideoRow { external_post_id: string; views: number|null; interactions: number|null; raw: unknown }`
- `mapTikTokAccount(json): TikTokAccountRow`, `mapTikTokVideos(videos): TikTokVideoRow[]`, `sumVideoViews(videos): number`
- `fetchUserStats(token): Promise<unknown>`, `fetchVideoList(token): Promise<unknown[]>`

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
import {
  mapTikTokAccount,
  mapTikTokVideos,
  sumVideoViews,
} from './insights-tiktok';

describe('insights-tiktok mappers', () => {
  it('mapTikTokAccount pulls stats', () => {
    expect(
      mapTikTokAccount({
        data: {
          user: {
            follower_count: 41230,
            following_count: 88,
            likes_count: 990000,
            video_count: 412,
          },
        },
      }),
    ).toEqual({
      follower_total: 41230,
      total_interactions: 990000,
      following_count: 88,
      video_count: 412,
    });
  });
  it('mapTikTokAccount tolerates missing fields', () => {
    expect(mapTikTokAccount({})).toEqual({
      follower_total: null,
      total_interactions: null,
      following_count: null,
      video_count: null,
    });
  });
  it('mapTikTokVideos sums engagement into interactions', () => {
    const rows = mapTikTokVideos([
      {
        id: 'v1',
        view_count: 1000,
        like_count: 80,
        comment_count: 12,
        share_count: 8,
      },
      {
        id: 'v2',
        view_count: 500,
        like_count: 10,
        comment_count: 0,
        share_count: 0,
      },
    ]);
    expect(rows).toEqual([
      {
        external_post_id: 'v1',
        views: 1000,
        interactions: 100,
        raw: rows[0].raw,
      },
      {
        external_post_id: 'v2',
        views: 500,
        interactions: 10,
        raw: rows[1].raw,
      },
    ]);
  });
  it('sumVideoViews adds view_count', () => {
    expect(
      sumVideoViews([
        { view_count: 1000 },
        { view_count: 500 },
        { view_count: undefined },
      ]),
    ).toBe(1500);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/insights-tiktok.ts
// TikTok Open API (Display) v2. Account stats (user.info.stats) + recent videos
// (video.list). Stable field set; defensive — a failed call yields null/[].
const USERINFO = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST = 'https://open.tiktokapis.com/v2/video/list/';
const TIMEOUT = 15000;
const VIDEO_FETCH_LIMIT = 20;

interface TikTokVideo {
  id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  [k: string]: unknown;
}

export interface TikTokAccountRow {
  follower_total: number | null;
  total_interactions: number | null;
  following_count: number | null;
  video_count: number | null;
}
export function mapTikTokAccount(json: {
  data?: { user?: Record<string, unknown> };
}): TikTokAccountRow {
  const u = json?.data?.user ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    follower_total: num(u.follower_count),
    total_interactions: num(u.likes_count),
    following_count: num(u.following_count),
    video_count: num(u.video_count),
  };
}

export interface TikTokVideoRow {
  external_post_id: string;
  views: number | null;
  interactions: number | null;
  raw: unknown;
}
export function mapTikTokVideos(videos: TikTokVideo[]): TikTokVideoRow[] {
  return (videos ?? [])
    .filter((v) => typeof v.id === 'string')
    .map((v) => ({
      external_post_id: v.id as string,
      views: typeof v.view_count === 'number' ? v.view_count : null,
      interactions:
        (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0),
      raw: v,
    }));
}
export function sumVideoViews(videos: TikTokVideo[]): number {
  return (videos ?? []).reduce(
    (acc, v) => acc + (typeof v.view_count === 'number' ? v.view_count : 0),
    0,
  );
}

export async function fetchUserStats(
  token: string,
): Promise<{ data?: { user?: Record<string, unknown> } }> {
  const fields =
    'open_id,follower_count,following_count,likes_count,video_count';
  const res = await fetch(`${USERINFO}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    const err = new Error(`TikTok user/info failed: ${res.status}`) as Error & {
      httpStatus?: number;
    };
    err.httpStatus = res.status;
    throw err;
  }
  return json;
}

export async function fetchVideoList(token: string): Promise<TikTokVideo[]> {
  const fields =
    'id,view_count,like_count,comment_count,share_count,title,create_time';
  const res = await fetch(`${VIDEO_LIST}?fields=${fields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: VIDEO_FETCH_LIMIT }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    const err = new Error(
      `TikTok video/list failed: ${res.status}`,
    ) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  return (json.data?.videos ?? []) as TikTokVideo[];
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/insights-tiktok.ts apps/frontend/src/lib/oauth/insights-tiktok.test.ts
git commit -m "feat(insights): TikTok stats + video-list fetchers + mappers"
```

---

### Task 3: `updateConnectionTokens` + async `getValidToken` with TikTok refresh

**Files:** Modify `libraries/database/src/owned-insights.ts`, `libraries/database/src/index.ts`, `apps/frontend/src/lib/oauth/tokens.ts` (+ `tokens.test.ts`)

**Interfaces:**

- Consumes: `tiktok.refresh`, `encryptToken`/`decryptToken`, `tiktokClientKey`/`tiktokClientSecret` from config.
- Produces: `updateConnectionTokens(connection_id, {access,refresh,access_expires_at,refresh_expires_at}): Promise<Result<true>>`; `getValidToken(c): Promise<string>`; extended `OAuthConnectionRow` (adds `refresh_ct/iv/tag: string|null`, `access_expires_at: string|null`).

- [ ] **Step 1: Add the DB helper** — in `libraries/database/src/owned-insights.ts` append:

```ts
import type { EncryptedBlob } from './oauth';

export async function updateConnectionTokens(
  connection_id: string,
  input: {
    access: EncryptedBlob;
    refresh: EncryptedBlob;
    access_expires_at: string;
    refresh_expires_at: string;
  },
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('oauth_connection')
    .update({
      access_ct: input.access.ct,
      access_iv: input.access.iv,
      access_tag: input.access.tag,
      refresh_ct: input.refresh.ct,
      refresh_iv: input.refresh.iv,
      refresh_tag: input.refresh.tag,
      access_expires_at: input.access_expires_at,
      refresh_expires_at: input.refresh_expires_at,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('id', connection_id);
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}
```

Export it from `libraries/database/src/index.ts` (add to the existing `./owned-insights` export block): `updateConnectionTokens`.

- [ ] **Step 2: Write the failing test** (`tokens.test.ts`, replacing the file — keep the 3 existing Meta cases, add TikTok)

```ts
/** @jest-environment node */
import { getValidToken, type OAuthConnectionRow } from './tokens';
import { encryptToken } from './crypto';

const KEY = Buffer.alloc(32, 5).toString('base64');
beforeEach(() => {
  process.env.OAUTH_ENC_KEY = KEY;
  process.env.TIKTOK_CLIENT_KEY = 'ck';
  process.env.TIKTOK_CLIENT_SECRET = 'cs';
  jest.resetModules();
});

const META_BLOB = () => encryptToken('PAGE_TOKEN_123');

function metaConn(over: Partial<OAuthConnectionRow> = {}): OAuthConnectionRow {
  const b = META_BLOB();
  return {
    id: 'c1',
    platform: 'instagram',
    status: 'active',
    access_ct: b.ct,
    access_iv: b.iv,
    access_tag: b.tag,
    refresh_ct: null,
    refresh_iv: null,
    refresh_tag: null,
    access_expires_at: null,
    ...over,
  };
}

describe('getValidToken — Meta', () => {
  it('returns decrypted page token', async () => {
    expect(await getValidToken(metaConn())).toBe('PAGE_TOKEN_123');
  });
  it('throws for revoked', async () => {
    await expect(
      getValidToken(metaConn({ status: 'revoked' })),
    ).rejects.toThrow(/not active/);
  });
  it('throws for wiped blob', async () => {
    await expect(getValidToken(metaConn({ access_ct: '' }))).rejects.toThrow(
      /not active/,
    );
  });
});
```

Add a second test file section for the TikTok refresh branch using jest mocks. Create it inline at the bottom of `tokens.test.ts`:

```ts
import * as tiktok from './tiktok';
import * as db from '@d3/database';

function ttConn(
  expISO: string | null,
  over: Partial<OAuthConnectionRow> = {},
): OAuthConnectionRow {
  const a = encryptToken('OLD_ACCESS');
  const r = encryptToken('OLD_REFRESH');
  return {
    id: 't1',
    platform: 'tiktok',
    status: 'active',
    access_ct: a.ct,
    access_iv: a.iv,
    access_tag: a.tag,
    refresh_ct: r.ct,
    refresh_iv: r.iv,
    refresh_tag: r.tag,
    access_expires_at: expISO,
    ...over,
  };
}

describe('getValidToken — TikTok', () => {
  it('returns decrypted access when not near expiry (no refresh)', async () => {
    const spy = jest.spyOn(tiktok, 'refresh');
    const far = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(await getValidToken(ttConn(far))).toBe('OLD_ACCESS');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('refreshes + persists rotated token when near expiry', async () => {
    jest.spyOn(tiktok, 'refresh').mockResolvedValue({
      access_token: 'NEW_ACCESS',
      refresh_token: 'NEW_REFRESH',
      expires_in: 86400,
      refresh_expires_in: 31536000,
      open_id: 'o',
      scope: 's',
    });
    const upd = jest
      .spyOn(db, 'updateConnectionTokens')
      .mockResolvedValue({ ok: true, value: true });
    const near = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min left
    expect(await getValidToken(ttConn(near))).toBe('NEW_ACCESS');
    expect(upd).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (async signature / TikTok branch not implemented).

- [ ] **Step 4: Implement** — replace `apps/frontend/src/lib/oauth/tokens.ts`:

```ts
// apps/frontend/src/lib/oauth/tokens.ts
import { decryptToken, encryptToken } from './crypto';
import { refresh as tiktokRefresh } from './tiktok';
import { tiktokClientKey, tiktokClientSecret } from './config';
import { updateConnectionTokens } from '@d3/database';

export interface OAuthConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
  refresh_ct: string | null;
  refresh_iv: string | null;
  refresh_tag: string | null;
  access_expires_at: string | null;
}

const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Usable access token for a connection.
 *  - Meta (instagram/facebook): the stored blob is a long-lived Page token — no
 *    refresh; just decrypt.
 *  - TikTok: access expires ~24h. Refresh when near/past expiry, persist the
 *    rotated access+refresh, and return the fresh access token.
 */
export async function getValidToken(c: OAuthConnectionRow): Promise<string> {
  if (c.status !== 'active' || !c.access_ct) {
    throw new Error('connection not active');
  }
  if (c.platform === 'tiktok') {
    const expMs = c.access_expires_at ? Date.parse(c.access_expires_at) : 0;
    const needsRefresh =
      !c.access_expires_at || expMs - Date.now() < REFRESH_SKEW_MS;
    if (needsRefresh) {
      if (!c.refresh_ct) throw new Error('no refresh token');
      const refreshToken = decryptToken({
        ct: c.refresh_ct,
        iv: c.refresh_iv as string,
        tag: c.refresh_tag as string,
      });
      const tok = await tiktokRefresh({
        clientKey: tiktokClientKey(),
        clientSecret: tiktokClientSecret(),
        refreshToken,
      });
      const now = Date.now();
      await updateConnectionTokens(c.id, {
        access: encryptToken(tok.access_token),
        refresh: encryptToken(tok.refresh_token),
        access_expires_at: new Date(now + tok.expires_in * 1000).toISOString(),
        refresh_expires_at: new Date(
          now + tok.refresh_expires_in * 1000,
        ).toISOString(),
      });
      return tok.access_token;
    }
  }
  return decryptToken({ ct: c.access_ct, iv: c.access_iv, tag: c.access_tag });
}
```

- [ ] **Step 5: Run — expect PASS** (5 tests). Then `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` → exit 0 (the cron still calls `getValidToken` sync — it will type-error until Task 4; if so, proceed to Task 4 before final tsc, or temporarily `await` is added in Task 4. Run tsc after Task 4.)
- [ ] **Step 6: Commit**

```bash
git add libraries/database/src/owned-insights.ts libraries/database/src/index.ts apps/frontend/src/lib/oauth/tokens.ts apps/frontend/src/lib/oauth/tokens.test.ts
git commit -m "feat(insights): async getValidToken with TikTok refresh + updateConnectionTokens"
```

---

### Task 4: Cron — TikTok branch + `await getValidToken`

**Files:** Modify `apps/frontend/src/app/api/cron/owned-insights/route.ts`

**Interfaces — Consumes:** `getValidToken` (now async), `fetchUserStats`/`fetchVideoList`/`mapTikTokAccount`/`mapTikTokVideos`/`sumVideoViews`, `upsertProfileInsight`/`upsertPostInsight`.

- [ ] **Step 1: Imports + connection select + filter**

Add to the insights imports:

```ts
import {
  fetchUserStats,
  fetchVideoList,
  mapTikTokAccount,
  mapTikTokVideos,
  sumVideoViews,
} from '@gitroom/frontend/lib/oauth/insights-tiktok';
```

Extend the `ConnectionRow` interface with the refresh columns + expiry:

```ts
interface ConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
  refresh_ct: string | null;
  refresh_iv: string | null;
  refresh_tag: string | null;
  access_expires_at: string | null;
  profile_id: string;
  external_account_id: string;
}
```

Update the DB select + filter in `GET`:

```ts
const { data: conns, error } = await db
  .from('oauth_connection')
  .select(
    'id, platform, status, access_ct, access_iv, access_tag, refresh_ct, refresh_iv, refresh_tag, access_expires_at, profile_id, external_account_id',
  )
  .eq('status', 'active')
  .in('platform', ['instagram', 'facebook', 'tiktok']);
```

- [ ] **Step 2: `await` the token + add the TikTok branch** in `ingestConnection`

Change `const token = getValidToken(conn);` → `const token = await getValidToken(conn);`.

After the existing `} else {` (facebook) block closes, restructure so platform dispatch is explicit. Replace the `if (conn.platform === 'instagram') { … } else { … }` with `if (instagram) {…} else if (facebook) {…} else if (tiktok) {…}`. The tiktok branch:

```ts
  } else if (conn.platform === 'tiktok') {
    const [statsJson, videos] = await Promise.all([
      fetchUserStats(token).catch(() => ({})),
      fetchVideoList(token).catch(() => [] as unknown[]),
    ]);
    const account = mapTikTokAccount(statsJson as { data?: { user?: Record<string, unknown> } });
    const vids = videos as Parameters<typeof mapTikTokVideos>[0];
    await upsertProfileInsight({
      profile_id: conn.profile_id,
      captured_date: capturedDate,
      platform: 'tiktok',
      reach: null,
      views: sumVideoViews(vids),
      accounts_engaged: null,
      total_interactions: account.total_interactions,
      page_engagements: null,
      follower_delta: null,
      follower_total: account.follower_total,
      raw: { account: statsJson, video_count: account.video_count, following_count: account.following_count },
    });
    for (const row of mapTikTokVideos(vids)) {
      await upsertPostInsight({
        profile_id: conn.profile_id,
        external_post_id: row.external_post_id,
        captured_date: capturedDate,
        views: row.views,
        reach: null,
        saves: null,
        interactions: row.interactions,
        raw: row.raw,
      });
    }
  }
```

Note: the cron's `runOne` passes `c as ConnectionRow`; `ingestConnection(c as OAuthConnectionRow & { profile_id; external_account_id }, capturedDate)` — `OAuthConnectionRow` is the extended type from Task 3, so `c`'s refresh columns satisfy it. Keep the existing cast shape.

- [ ] **Step 3: Type-check** — `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` → exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/cron/owned-insights/route.ts
git commit -m "feat(insights): ingest TikTok stats + videos in owned-insights cron"
```

---

### Task 5: Display — surface TikTok likes

**Files:** Modify `apps/frontend/src/components/insights/insights-panel.tsx`

- [ ] **Step 1: Engaged tile fallback**

In `InsightsPanel`, change the Engaged tile so TikTok's likes (in `total_interactions`) show:

```tsx
<StatTile
  label="Engaged"
  value={
    latest.accounts_engaged ??
    latest.page_engagements ??
    latest.total_interactions
  }
/>
```

(`ProfileDay` already includes `total_interactions` — no type change.)

- [ ] **Step 2: Type-check** → exit 0.
- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/insights/insights-panel.tsx
git commit -m "feat(insights): show TikTok likes in the Engaged tile"
```

---

### Task 6: Integration test — TikTok upsert + token update

**Files:** Modify `supabase/tests/owned-insights.mts`

- [ ] **Step 1: Add TikTok assertions** — after the existing IG checks (before the `finally`), add:

```ts
// TikTok account row uses the same table (platform check now allows it).
const tt = await upsertProfileInsight({
  profile_id: profileId,
  captured_date: today,
  platform: 'tiktok',
  reach: null,
  views: 4321,
  accounts_engaged: null,
  total_interactions: 990000,
  page_engagements: null,
  follower_delta: null,
  follower_total: 41230,
  raw: { demo: true },
});
check('tiktok profile insight upsert', tt.ok === true);
const { data: ttRead } = await db
  .from('owned_profile_insight')
  .select('platform, follower_total')
  .eq('profile_id', profileId)
  .eq('platform', 'tiktok')
  .maybeSingle();
check(
  'tiktok row stored',
  ttRead?.platform === 'tiktok' && ttRead?.follower_total === 41230,
);
```

(The `upsertProfileInsight` onConflict is `profile_id,captured_date`, so this overwrites the IG row for the same day — acceptable for the test; assert on the tiktok platform value. If you want both rows, use a second profile; the single-profile overwrite is fine to prove the constraint accepts `tiktok`.)

Also import + exercise `updateConnectionTokens` is covered by the jest unit test (Task 3) — no DB integration needed here.

- [ ] **Step 2: Run** (after Task 1 applied): `npx tsx supabase/tests/owned-insights.mts` → all checks pass (now includes the 2 tiktok checks).
- [ ] **Step 3: Commit**

```bash
git add supabase/tests/owned-insights.mts
git commit -m "test(insights): tiktok owned_profile_insight upsert path"
```

---

### Task 7: Sandbox verification (post-build, owner-gated)

Not code — owner runs once a TikTok account is connected:

- [ ] Trigger the cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://www.d3creator.com/api/cron/owned-insights` → confirm a `tiktok` row in `owned_profile_insight` + `owned_post_insight` rows.
- [ ] Confirm `/me/connections` shows the TikTok panel (Followers, Views, Engaged=likes) for the connected creator.

---

## Self-review

**Spec coverage:** §2 decisions → all tasks. §4 migration → Task 1. §5 metric mapping → Task 2 (mappers) + Task 4 (cron assembly, views=Σ). §6 token refresh → Task 3. §7 ingest → Task 4. §8 display → Task 5. §9 testing → Tasks 2/3 (unit), 6 (integration), 7 (sandbox).

**Placeholder scan:** none — complete code throughout. Task 7 is an explicit owner checklist.

**Type consistency:** `OAuthConnectionRow` extended in Task 3 (adds refresh\_\*/access_expires_at) and the cron's `ConnectionRow` mirrors it in Task 4 + select includes the columns. `getValidToken` is `Promise<string>` in Task 3 and `await`ed in Task 4. `updateConnectionTokens` signature consistent between Task 3 definition and the `tokens.ts` call + the jest mock. `mapTikTokAccount`/`mapTikTokVideos`/`sumVideoViews` names consistent between Task 2 and the Task 4 cron. `ProfileDay.total_interactions` (existing) used in Task 5.

**Known build note:** after Task 3 alone, `tsc` errors at the cron's sync `getValidToken` call — resolved in Task 4 (the `await`). Run the full `tsc` after Task 4, not between 3 and 4.
