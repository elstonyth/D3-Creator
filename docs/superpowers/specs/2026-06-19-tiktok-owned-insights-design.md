# TikTok Owned-Insights — Ingest + Display

**Date:** 2026-06-19
**Status:** Approved design, pre-implementation
**Builds on:** [2026-06-19-meta-owned-insights-design.md](2026-06-19-meta-owned-insights-design.md) (Meta insights, merged PR #44) and the Phase 1 connect flow (PR #43).

## 1. Goal and boundary

Pull owner-only TikTok metrics for **connected** TikTok profiles into the **same** private tables, on the **same** daily cron, displayed by the **same** `InsightsPanel`. This completes the owned-accounts insight set so the TikTok review video shows the requested scopes (`user.info.stats`, `video.list`) demonstrably in use.

**In scope**

- Daily ingest of TikTok account stats + recent-video stats for active connected TikTok profiles.
- Reuse the 3 Meta-era owned tables (one-line migration to allow `platform='tiktok'`).
- Build the real lazy token refresh in `getValidToken` (TikTok access tokens expire ~24h — Meta page tokens didn't, so this was deferred).
- Display via the existing `InsightsPanel` (one tiny tweak).

**Out of scope**

- **Audience demographics** — TikTok Login Kit does not expose them (would need TikTok Business/Research API). No `owned_audience_demographic` rows for TikTok.
- Any public-surface change. Owner insights stay private (`/me` + admin only).

## 2. Decisions (from brainstorming)

| #   | Decision        | Choice                                                                                     |
| --- | --------------- | ------------------------------------------------------------------------------------------ |
| 1   | Storage         | Reuse the 3 owned tables; widen `owned_profile_insight.platform` CHECK to add `'tiktok'`   |
| 2   | Account "views" | Sum of recent videos' `view_count` (TikTok has no account-level views metric)              |
| 3   | Token refresh   | `getValidToken` becomes async + platform-aware; TikTok refreshes + persists rotated tokens |
| 4   | Ingest          | Extend `/api/cron/owned-insights` (add `'tiktok'` + a tiktok branch), not a new cron       |
| 5   | Demographics    | None for TikTok                                                                            |
| 6   | Display         | Reuse `InsightsPanel`; one-line "Engaged" tile falls back to `total_interactions`          |

## 3. Existing model this builds on (all merged)

- `oauth_connection` (Phase 1): for TikTok, the stored `access_*` blob is the user access token, **with** a `refresh_*` blob (refresh token) and `access_expires_at` / `refresh_expires_at`. `external_account_id` = TikTok `open_id`. `profile_id` → scraped `profile`.
- `owned_profile_insight` / `owned_post_insight` (Meta spec, merged PR #44): platform-agnostic except the `owned_profile_insight.platform` CHECK (`instagram`,`facebook`). `owned_post_insight` has no platform column.
- RPCs `get_my_owned_insights` / `get_admin_owned_insights` (jsonb, owner/admin-gated): query by `profile_id` → already work for TikTok profiles.
- `lib/oauth/tiktok.ts`: `refresh()`, `exchangeCode`, `fetchUserInfo` (basic), `TikTokToken` type — all present.
- `lib/oauth/tokens.ts` `getValidToken(conn)`: currently **sync**, Meta-only (decrypt page token).
- `lib/oauth/crypto.ts` `encryptToken`/`decryptToken`; `@d3/database` `getSupabaseAdmin`, `upsertProfileInsight`, `upsertPostInsight`, `setConnectionStatus`.
- `/api/cron/owned-insights`: `CRON_SECRET` auth, concurrency pool (`MAX_CONCURRENCY=3`) + elapsed guard, per-connection `expired`/`failed` handling, one `capturedDate` threaded into upserts.
- `InsightsPanel` (`components/insights/`): account stat tiles + per-post; demographics block auto-hides when empty.

## 4. Data model

One-line migration:

```sql
alter table public.owned_profile_insight drop constraint owned_profile_insight_platform_check;
alter table public.owned_profile_insight add constraint owned_profile_insight_platform_check
  check (platform in ('instagram','facebook','tiktok'));
```

No other schema change. `owned_post_insight` + both RPCs already work for TikTok profiles.

## 5. Metric mapping (TikTok → existing columns)

**Account** — `GET /v2/user/info/?fields=open_id,follower_count,following_count,likes_count,video_count` (scope `user.info.stats`):

- `follower_count` → `follower_total`
- `likes_count` → `total_interactions` (total likes received)
- `views` → **sum of recent videos' `view_count`** (computed in the cron from the video list)
- `following_count`, `video_count` → `raw`
- `reach`, `accounts_engaged`, `page_engagements`, `follower_delta` → null

**Per-video** — `POST /v2/video/list/` body `{ fields: ["id","view_count","like_count","comment_count","share_count","title","create_time"], max_count: 20 }` (scope `video.list`), paginated by `cursor`:

- `view_count` → `views`
- `like_count + comment_count + share_count` → `interactions`
- `reach`, `saves` → null
- full video object → `raw`
- `external_post_id` = video `id`

(Exact field names confirmed against TikTok Display API docs at build — the Display API is stable; no Meta-style deprecation churn expected.)

## 6. Token handling — `getValidToken` becomes async + platform-aware

```
getValidToken(conn) ->                         // now async, returns Promise<string>
  if conn.platform in {instagram, facebook}:
    return decrypt(access blob)                 // unchanged behaviour (Meta page token, no refresh)
  if conn.platform == 'tiktok':
    if access_expires_at within REFRESH_SKEW (≈5 min) or past:
      tok = tiktok.refresh({clientKey, clientSecret, refreshToken: decrypt(refresh blob)})
      updateConnectionTokens(conn.id, {                 // new @d3/database helper, service role
        access: encrypt(tok.access_token),
        refresh: encrypt(tok.refresh_token),            // TikTok ROTATES the refresh token
        access_expires_at, refresh_expires_at, last_refreshed_at })
      return tok.access_token
    return decrypt(access blob)
  on refresh failure -> throw (cron marks the connection 'expired')
```

New `@d3/database` helper `updateConnectionTokens(connection_id, blobs+expiries)`. `getValidToken` needs the connection's `refresh_*` blobs + `access_expires_at` in its input type (the cron already selects token columns; extend the select + the `OAuthConnectionRow` type). The Meta cron call site changes from `getValidToken(conn)` → `await getValidToken(conn)`.

## 7. Ingest — extend `/api/cron/owned-insights`

- Connection filter: `platform IN ('instagram','facebook','tiktok')`.
- A `tiktok` branch in `ingestConnection`: `await getValidToken(conn)` → `fetchUserStats(openId, token)` + `fetchVideoList(token)` → `upsertProfileInsight` (account row, `views` = Σ video views) + `upsertPostInsight` per video. No demographics call.
- New `lib/oauth/insights-tiktok.ts`: `fetchUserStats`, `fetchVideoList`, pure mappers `mapTikTokAccount`, `mapTikTokVideos` (+ `sumVideoViews`). Same defensive style (per-call try/catch → null).
- Reuses the existing concurrency pool, timeout, and `expired`/`failed` handling.

## 8. Display — one tweak

`InsightsPanel` already renders for any owned profile (TikTok demographics block auto-hides). One line: the "Engaged" tile value becomes `accounts_engaged ?? page_engagements ?? total_interactions` so TikTok's likes surface. Optionally relabel per platform later — out of scope here.

## 9. Testing

- **Unit** (jest, pure): `mapTikTokAccount` (stats → row), `mapTikTokVideos` (list → rows), `sumVideoViews`; `getValidToken` TikTok branch — refresh-when-near-expiry calls refresh + persists, not-near-expiry returns decrypted without refresh (mock `tiktok.refresh` + `updateConnectionTokens`).
- **Integration** (tsx, live tables): tiktok `upsertProfileInsight`/`upsertPostInsight` path against the (now `tiktok`-allowed) `owned_profile_insight`; `updateConnectionTokens` round-trip.
- **Cron** verified against TikTok Sandbox at build.

## 10. Security notes

- Reuses the merged owner-only RLS (no anon) + SECDEF RPCs. No new exposure.
- TikTok refresh tokens are rotated and re-encrypted on every refresh; only ever decrypted inside `getValidToken` (server).
- `updateConnectionTokens` is service-role only; never returns token material.
