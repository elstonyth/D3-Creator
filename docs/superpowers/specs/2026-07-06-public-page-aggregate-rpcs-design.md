# Public-page aggregate RPCs — design (#59 follow-up)

**Date:** 2026-07-06
**Status:** design, awaiting approval → implementation
**Scope chosen:** Creators + content RPCs. Pages stay `force-dynamic` (no caching layer). Must NOT change displayed numbers.

## Problem

`/`, `/dashboard`, `/leaderboard` are `force-dynamic` + uncached, so on **every request** they run two full-history scans and aggregate in JS:

1. `getLiveCreatorRows()` — pages the ENTIRE `profile_snapshot` + `post_snapshot` history (tens of thousands of rows, growing ~1.2k/day) via `fetchAllRows`, then rolls up per creator.
2. `loadContentRows()` (feeds `getTopContentRankingsWindowed`) — pages the ENTIRE `post_snapshot` history again.

Cost is O(all snapshot history) and grows unbounded. Goal: push the aggregation into Postgres so the app fetches bounded rows (~81 profiles / ~1–2k posts).

## Exact semantics to preserve (do not change the numbers)

From the current JS (`queries.ts`):

**Creators (`getLiveCreatorRows`)**

- Profiles: all `profile` rows EXCEPT `platform = 'rednote'`.
- Followers per profile = **newest** `profile_snapshot` (max `captured_at`, tie-break `id desc`); null → 0.
- Per post:
  - views contribution = **`MAX(views)` across ALL snapshots** of that `(profile_id, external_post_id)` (monotonic-views guard — see `maxViewsPerPost`); null → 0.
  - engagement contribution = `(likes+comments+shares)` from the **newest** snapshot of that post; nulls → 0.
  - `post_count` = number of distinct posts.
- Per-creator = Σ over its profiles; also emit a per-`(creator×platform)` slot. Primary platform = highest-follower profile.

**Content (`loadContentRows` → `getTopContentRankingsWindowed`)**

- One `TopContentRow` per distinct `(profile_id, external_post_id)` (rednote excluded).
- `currentViews` = **`MAX(views)`** across the post's snapshots (NOT the latest snapshot — this differs from the existing `top_content_windowed` RPC, which uses latest; do NOT reuse it).
- `likes/comments/shares/caption_excerpt/media_url/posted_at/duration_seconds` = from the **newest** snapshot of the post.
- Windowing (per `ViewPeriod` by `posted_at`), cross-platform dedup (`collapseByContent`), sort, and top-N stay in JS unchanged.

## Design

### RPC 1: `public_creator_rows()`

Returns one row per profile with: `profile_id, creator_id, platform, handle, followers, total_views, total_engagement, post_count`. SQL:

- `latest_followers` = `distinct on (profile_id) ... order by profile_id, captured_at desc, id desc`.
- `post_maxviews` = `select profile_id, external_post_id, coalesce(max(views),0) v from post_snapshot group by 1,2` (all-null views → 0, matching the JS `views ?? 0`).
- `post_latest` = `distinct on (profile_id, external_post_id) ... likes,comments,shares order by ..., captured_at desc, id desc`.
- Join per post → per profile: `sum(v)`, `sum(likes+comments+shares)`, `count(*)`.
- **LEFT JOIN the post aggregates onto `scope_profile`** — a profile with zero posts MUST still return a row (followers, zeros). In the current JS, followers come from `profile_snapshot` independently of posts; an inner join would drop zero-post profiles and silently shrink the creator's follower total.
- Filter `platform <> 'rednote'` in a `scope_profile` CTE (mirror the windowed RPCs).
  `getLiveCreatorRows` becomes: fetch `creator` (names/avatars) + call this RPC, then do the SAME per-creator rollup + per-platform slots in JS (unchanged logic, just fed bounded rows).

### RPC 2: `public_content_rows()`

Returns one row per `(profile_id, external_post_id)`: `profile_id, creator_id, creator_name, platform, handle, external_post_id, current_views (=MAX views), likes, comments, shares, caption_excerpt, media_url, posted_at, duration_seconds`. (`profile_id` is required — `TopContentRow.profileId` feeds the `contentKey` dedup fallback `u:<profileId>|<externalPostId>`.) Same `MAX(views)` + newest-row join as RPC 1, plus the newest-row descriptive fields. `loadContentRows` becomes: call this RPC, map to `TopContentRow` (route `media_url` through `resolveMediaUrl` as today). `getTopContentRankingsWindowed` unchanged.

### What does NOT change

- Return types (`LiveCreatorRow`, `TopContentRow`), all rollup/window/dedup/sort JS, the pages (stay `force-dynamic`), `resolveMediaUrl`. No caching layer (deferred; queries become cheap enough).
- `getSupabaseRead` (anon) must have EXECUTE on both RPCs. Functions are **security invoker** (the default — matching `creator_metrics_windowed` / `top_content_windowed`; anon already has SELECT on these tables, it reads them directly today) with `set search_path = ''`, `stable`, and REVOKE-from-public + GRANT-to-anon per the migration `20260606000000` hardening pattern. Do NOT use `security definer` — needless privilege escalation.

## Verification (before switching reads)

1. Apply the RPCs to a Supabase **branch** (or prod after approval) and diff RPC output vs the current JS output on the SAME prod data — assert per-creator `followers/total_views/total_engagement/post_count` match exactly for all creators, and spot-check `public_content_rows` `current_views` against `maxViewsPerPost` for a sample.
2. Only after parity is confirmed, switch `getLiveCreatorRows`/`loadContentRows` to the RPCs in one PR.
3. Keep the old JS path in git history for quick revert.

## Rollout / gates

- Two migrations (`create function ...`) — **prod migration needs explicit approval** at apply time (per project rule + Supabase MCP apply gate). Prefer verifying on a branch first.
- No data migration, no schema change to tables — additive functions only.

## Non-goals / follow-ups

- Caching (unstable_cache / static ISR): deferred — unnecessary once queries are cheap; revisit if traffic grows.
- `creator_metrics_windowed` / `top_content_windowed` (the `/me` + windowed paths) are unrelated and untouched.
- Longer term: a materialized/rollup table refreshed by the cron would make even the RPCs O(profiles) instead of O(posts×snapshots), but the group-by RPCs are sufficient at current scale.

## Test / check

- A parity script (`scripts/verify-public-rpcs.ts`) that runs both the old JS path and the new RPC path against prod and asserts equality per creator/post. This is the one runnable check that fails if the SQL drifts from the JS semantics.
