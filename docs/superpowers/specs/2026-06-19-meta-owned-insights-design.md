# Meta Owned-Insights — Ingest + Display

**Date:** 2026-06-19
**Status:** Approved design, pre-implementation
**Builds on:** [2026-06-18-owned-accounts-oauth-design.md](2026-06-18-owned-accounts-oauth-design.md) (Phase 1 connect flow, merged PR #43)

## 1. Goal and boundary

Pull owner-only Meta insights for **connected** Instagram + Facebook profiles into private storage, refresh daily, and display them to the creator (`/me`) and the agency (admin). This is what makes the owner-account tier worth connecting — reach, impressions, profile views, audience demographics, and per-post reach/saves that scraping can't see. It also makes the requested OAuth scopes demonstrably "in use," which Meta App Review requires before granting Advanced Access.

**In scope**

- Daily ingest of Meta insights for active connected IG/FB profiles.
- Three private storage tables (account scalars, audience demographics, per-post insights).
- `getValidToken()` (the `tokens.ts` deferred in Phase 1) for Meta.
- A dedicated ingest cron, separate from `daily-snapshot`.
- Display on `/me` (creator) and the admin creator-detail page.

**Out of scope (follow-on specs)**

- **TikTok insights** — separate spec (user stats + `video.list`; no dimensional demographics via Login Kit).
- Any change to public surfaces. **The public leaderboard and dashboard stay scraped-only.** Owner insights never feed public numbers — that would make connected vs non-connected creators inconsistent and leak private data.

## 2. Decisions (from brainstorming)

| #   | Decision       | Choice                                                                                      |
| --- | -------------- | ------------------------------------------------------------------------------------------- |
| 1   | Platform order | Meta (IG + FB) first; TikTok follow-on                                                      |
| 2   | Metric breadth | Full: account-level + audience demographics + per-post                                      |
| 3   | Storage        | 3 new **owner-only** tables, never columns on the public-read tables                        |
| 4   | Privacy        | Owner insights are private — `/me` + admin only, never public                               |
| 5   | Ingest         | New cron `/api/cron/owned-insights`, separate from `daily-snapshot`                         |
| 6   | Token          | Reuse stored page token; on Graph 401/190 mark `expired` → reconnect (no proactive refresh) |

## 3. Existing model this builds on

- `oauth_connection` (Phase 1): per (user, platform, external account), encrypted tokens, `status`. For Meta, the stored `access_*` blob is the **Page access token** (refresh = null). `profile_id` links to the scraped `profile`.
- `profile_claim` (`owner`/`tracker`) — owner read-scope for RPCs.
- `lib/oauth/`: `crypto.ts` (`decryptToken`), `config.ts` (`META_GRAPH_VERSION`, currently `v21.0`), `meta.ts` (Graph helpers). `@d3/database` `getSupabaseAdmin()` for service-role writes; SECURITY DEFINER + `is_admin()` RPC pattern for reads.
- Cron pattern: `daily-snapshot` — `CRON_SECRET` bearer auth, per-item timeout (`withTimeout`), per-item failure isolation, `maxDuration = 300`.

## 4. Data model — 3 new tables (owner/admin-only)

**Security driver:** `profile_snapshot`/`post_snapshot` carry a `public read … to anon` RLS policy. Owner insights must never be anon-readable, so they live in separate tables with **no anon policy** — not as nullable columns on the public tables (which would expose them through the existing public policy).

```sql
-- account-level daily scalars. Platform-agnostic "headline" columns store the
-- LIVE v25.0 metrics (see §11); everything else lands in `raw`. Meta removed
-- impressions→views and the page-reach metric, so those columns do NOT exist.
create table public.owned_profile_insight (
  id                  bigserial primary key,
  profile_id          uuid not null references public.profile(id) on delete cascade,
  captured_date       date not null default current_date,
  captured_at         timestamptz not null default now(),
  platform            text not null check (platform in ('instagram','facebook')),
  reach               bigint,   -- IG: account reach;  FB: page_total_media_view_unique
  views               bigint,   -- IG: views (replaces impressions);  FB: page_media_view
  accounts_engaged    bigint,   -- IG only
  total_interactions  bigint,   -- IG only
  page_engagements    bigint,   -- FB: page_post_engagements
  follower_delta      bigint,   -- IG: follower_count (net daily change)
  follower_total      bigint,   -- current total followers (IG/FB node followers_count)
  raw                 jsonb,
  unique (profile_id, captured_date)
);

-- audience demographics, dimensional, daily
create table public.owned_audience_demographic (
  id             bigserial primary key,
  profile_id     uuid not null references public.profile(id) on delete cascade,
  captured_date  date not null default current_date,
  dimension      text not null check (dimension in ('age','gender','country','city')),
  bucket         text not null,        -- e.g. '25-34', 'F', 'MY', 'Kuala Lumpur'
  value          bigint not null,
  unique (profile_id, captured_date, dimension, bucket)
);

-- per-post owner insights (parallel to post_snapshot, NOT merged into it)
create table public.owned_post_insight (
  id               bigserial primary key,
  profile_id       uuid not null references public.profile(id) on delete cascade,
  external_post_id text not null,
  captured_date    date not null default current_date,
  captured_at      timestamptz not null default now(),
  views            bigint,   -- IG: media views (replaces impressions);  FB: post_media_view
  reach            bigint,   -- IG: media reach;  FB: null (post reach deprecated 2026-06-15)
  saves            bigint,   -- IG: saved
  interactions     bigint,   -- IG: total_interactions;  FB: post_engaged_users
  raw              jsonb,
  unique (profile_id, external_post_id, captured_date)
);

create index owned_profile_insight_profile_idx on public.owned_profile_insight (profile_id, captured_date desc);
create index owned_audience_demographic_profile_idx on public.owned_audience_demographic (profile_id, captured_date desc);
create index owned_post_insight_profile_idx on public.owned_post_insight (profile_id, captured_date desc);

alter table public.owned_profile_insight    enable row level security;
alter table public.owned_audience_demographic enable row level security;
alter table public.owned_post_insight       enable row level security;
-- No anon/authenticated policies => service-role write; reads via SECDEF RPCs only.
```

**Read RPCs** (SECURITY DEFINER, `search_path=''`, revoke public/anon + grant authenticated — mirror Phase 1):

- `get_my_owned_insights(p_profile_id uuid)` — latest + trend for a profile the caller **owns** (guard: `profile_id IN (select profile_id from profile_claim where user_id = auth.uid())`). Returns account scalars (recent N days), demographics (latest day), per-post insights joined to `post_snapshot` for captions/media.
- `get_admin_owned_insights(p_creator_id uuid)` — same data for a creator, gated by `is_admin()`.

Both return only the insight rows — no tokens.

## 5. Token handling — `lib/oauth/tokens.ts` (`getValidToken`)

Builds the helper deferred in Phase 1. For Meta:

```
getValidToken(connection) ->
  decrypt access blob (the Page token).
  Return plaintext. No proactive refresh (Page tokens from a long-lived
  user token are effectively non-expiring).
On a Graph call returning 401 or error code 190 (token invalid):
  setConnectionStatus(connection.id, 'expired')  // creator reconnects to recover
  skip this connection for the run.
```

Known limitation (documented, accepted for v1): Phase 1 stored Page tokens but not the long-lived **user** token, so we can't silently re-derive Page tokens — recovery is a reconnect. A future enhancement could persist the user token to auto-heal.

## 6. Ingest — `/api/cron/owned-insights`

New route, same shape as `daily-snapshot` (Node runtime, `CRON_SECRET` bearer via `assertAuth`, `maxDuration = 300`, per-connection `withTimeout`, per-connection failure isolation, summary JSON). New schedule entry in `vercel.json` (daily, e.g. `30 1 * * *` — offset from the snapshot cron).

Per active Meta connection:

1. `getValidToken(connection)` → Page token (or skip + mark expired on 401/190).
2. **IG** (`platform='instagram'`): account insights `metric=reach,views,accounts_engaged,total_interactions` (`period=day&metric_type=total_value`) + `follower_count` (`period=day`, no metric_type) + `followers_count` from the IG user node (current total) + `follower_demographics` (`period=lifetime&metric_type=total_value&timeframe=last_90_days&breakdown=` one call each for age/gender/country/city) + per-media `metric=views,reach,saved,total_interactions` for recent media. **Do NOT request `impressions`/`profile_views`** (dead → fail the whole call).
3. **FB** (`platform='facebook'`): Page insights `metric=page_media_view,page_post_engagements` + `page_total_media_view_unique` (reach) + `followers_count` from the Page node (current total) + per-post `post_media_view` (**requested solo**) and `post_engaged_users,post_clicks,post_reactions_by_type_total`. **Do NOT request `page_impressions`/`page_fans`/`post_impressions`/`*_impressions_unique`** (all deprecated, see §11).
4. Upsert `owned_profile_insight` (1 row), `owned_audience_demographic` (N rows, replace-by-day), `owned_post_insight` (per post). Store the raw Graph payload in `raw` so re-parsing never needs a re-fetch.

**Graph API guardrail:** Meta deprecates insight metrics aggressively (a ~85-metric reach round landed 2026-06-15, days before this spec). Fetchers pin `META_GRAPH_VERSION=v25.0` and request **only the live metrics in §11**. Each metric is requested defensively — a per-metric error records `null` for that column and never fails the connection; the full `raw` payload is persisted so a future rename is a parser fix, not a re-ingest. Several FB metrics are medium-confidence (Meta docs render client-side) and **must be re-confirmed in Graph API Explorer against the first real connected account** before the cron is trusted.

## 7. Display

- **`/me`** — a "Your insights" block on the connected-profile view: account trend (reach / impressions / profile views over recent days), an audience-demographics breakdown (horizontal bars for age, gender, top countries), and per-post reach/saves surfaced on the existing top-content cards. Renders only for the creator's connected profiles; absent for creators with no connection.
- **Admin** creator-detail (`/admin/creators/[id]`) — the same insights, read-only, per connected profile (agency view), beside the Phase 1 connection-status section.
- Reuse existing chart/card components; the demographics bars are a new small component (`components/insights/demographic-bars.tsx`).

## 8. File map (preview — firmed in the plan)

```
supabase/migrations/<ts>_owned_insights.sql              3 tables + 2 RPCs
apps/frontend/src/lib/oauth/tokens.ts                    getValidToken (Meta)
apps/frontend/src/lib/oauth/insights-meta.ts             Graph fetchers + response→row mappers (pure, unit-tested)
libraries/database/src/owned-insights.ts                 upsert helpers (service role)
apps/frontend/src/lib/owned-insights.ts                  typed RPC readers (frontend)
apps/frontend/src/app/api/cron/owned-insights/route.ts   ingest cron
apps/frontend/src/components/insights/demographic-bars.tsx
apps/frontend/src/app/(creator)/me/connections/page.tsx (or a new insights view)  display
apps/frontend/src/app/(admin)/admin/creators/[id]/...    admin display
vercel.json                                              new cron schedule
```

## 9. Testing

- **Unit** (pure, jest): Graph response → row mappers for IG account, FB Page, demographics flattener (breakdown → rows), per-post mapper; `getValidToken` returns token, and the 401/190 → `expired` branch.
- **Integration** (tsx, live tables): upsert + RPC read for the 3 tables, including the owner read-scope guard (a non-owner gets nothing) and the admin RPC.
- **Cron** verified manually against a connected dev account once Meta dev-mode access is set up.

## 10. Security notes

- The 3 tables have **no anon RLS policy**; all reads go through owner/admin SECDEF RPCs. Owner insights never reach a public page.
- Tokens are only ever decrypted inside the cron (server) via `getValidToken`; never returned by any RPC.
- The ingest cron uses the same `CRON_SECRET` bearer + timing-safe check as `daily-snapshot`.
- Per-connection failure isolation: one expired/failing connection never aborts the run.

## 11. Verified Graph API facts (v25.0, confirmed 2026-06-19)

Researched + adversarially verified against current Meta docs. Pin `META_GRAPH_VERSION=v25.0` (Phase 1 `config.ts` has `v21.0`; deprecations are global-date-based so even v21.0 now rejects the dead metrics — bump it). Confidence noted; FB metrics flagged "verify-live" need a real connected account to confirm.

**IG account** — `GET /{ig-user-id}/insights`
- Live: `reach` (day; total_value or time_series), `views` (day; **requires** `metric_type=total_value`; replaces `impressions`), `accounts_engaged` (day; total_value), `total_interactions` (day; total_value), `follower_count` (day; **no** metric_type; net daily change). Current total followers = IG user node field `followers_count` (`GET /{ig-user-id}?fields=followers_count`).
- **Dead — never request:** `impressions`, `profile_views` (removed all versions Apr 2025; mixing one in fails the whole call).
- Gate: account must have >100 followers or metrics error/empty.

**IG demographics** — `GET /{ig-user-id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&timeframe=last_90_days&breakdown={age|city|country|gender}`
- One `breakdown` per call (not comma-combinable) → 4 calls. `timeframe` is **required**. Results at `total_value.breakdowns[].results[]` (each: `dimension_values[]` + `value`). Top-45 groups only; needs >100 followers. (No `reached_audience_demographics` — doesn't exist.)

**IG media** — `GET /{ig-media-id}/insights?metric=views,reach,saved,total_interactions`
- Live: `views` (replaces `impressions`/`plays`/`video_views`), `reach`, `saved`, `total_interactions`. `period=lifetime` (omit). **No** `metric_type` for media. Don't mix metrics across media types in one call. `impressions` dead for media created ≥2024-07-02.

**FB Page** — `GET /{page-id}/insights` (Page token + `pages_read_engagement`)
- Live: `page_media_view` (day; replaces `page_impressions`; `breakdown=is_from_ads` splits paid/organic; *verify-live* whether `metric_type=total_value` needed), `page_post_engagements` (day; *verify-live*), `page_total_media_view_unique` (reach replacement, landed 2026-06-15; *verify-live*). Current total followers = Page node field `followers_count` (`GET /{page-id}?fields=followers_count`).
- **Dead — never request:** `page_impressions` (Nov 2025), `page_fans` (Nov 2025), `page_impressions_unique` (2026-06-15).

**FB post** — `GET /{page-id}_{post-id}/insights`
- Live: `post_media_view` (replaces `post_impressions`; **request solo** — can't combine with other metrics in one call; `period=lifetime`), `post_engaged_users`, `post_clicks`, `post_reactions_by_type_total` (object keyed by reaction). `period=lifetime` for all.
- **Dead — never request:** `post_impressions` (Nov 2025), `post_impressions_unique`/reach (2026-06-15).

**Token/permissions:** Facebook-Login flow → Page access token, scopes `instagram_basic` + `instagram_manage_insights` + `pages_read_engagement`; host `graph.facebook.com`. IG account must be Business/Creator linked to the Page; `{ig-user-id}` is the numeric IG business id (Phase 1 stored it as the IG connection's `external_account_id`). Owned accounts only.
