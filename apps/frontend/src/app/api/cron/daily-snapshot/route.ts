/**
 * Snapshot cron — runs hourly via Vercel Cron (requires the Pro plan;
 * Hobby rejects sub-daily schedules at deploy validation).
 *
 * Schedule lives in vercel.json ("0 * * * *"). Each tick processes the
 * PROFILES_PER_RUN least-recently-scraped profiles; setProfileStatus stamps
 * last_scraped_at on every attempt, so a scraped profile sorts to the back
 * and the next tick advances to the next batch. Profiles already attempted
 * today (UTC) are skipped, so hourly ticks drain the roster (~81 profiles)
 * within a day and then no-op for the rest of the day — one scrape per profile
 * per day, no re-scraping. Was daily (02:00 UTC) but 5/day starved the tail.
 *
 * Auth model:
 *   Production: Vercel Cron requests carry x-vercel-cron-signature; we ALSO
 *   require Authorization: Bearer ${CRON_SECRET}. Set CRON_SECRET in Vercel
 *   project env, then add it as the cron's header in vercel.json. Local
 *   manual runs just use curl with the same bearer.
 *
 * Failure semantics:
 *   Sequential per profile. One profile's failure does NOT abort the loop.
 *   Each profile's status is updated to the appropriate scrape_status code
 *   so the UI can surface badges (Task 5 step 2).
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { runScraper, ScrapeError } from '@d3/scrapers';
import {
  listScrapeableProfiles,
  persistMediaForPosts,
  POST_MEDIA_DEADLINE_MS,
  setProfileStatus,
  upsertPostSnapshots,
  upsertProfileSnapshot,
} from '@d3/database';

// Cap dev/manual invocations to a reasonable budget. Vercel Functions
// default 300s timeout; spec says max 5 parallel concurrent Apify runs.
// We run SEQUENTIAL in v1 — at ~50s per IG scrape, that's ~6 profiles max
// per cron invocation before the function times out. Acceptable for MVP.
export const maxDuration = 300;

// Server-only — never prerender at build time.
export const dynamic = 'force-dynamic';

// Per-run capacity cap. Sequential scrapes run ~50s each; 5 × 50s = 250s
// leaves a 50s safety margin under the 300s function timeout. Profiles
// beyond this cap are deferred to the next cron tick — we sort by
// last_scraped_at NULLS FIRST so the least-recently-scraped go first.
//
// TODO: For real scale, migrate to Vercel Queues so each profile gets its
// own invocation budget instead of sharing one 300s window.
// See https://vercel.com/docs/queues
const PROFILES_PER_RUN = 5;

// Wall-clock reserved at the end of the budget for the snapshot upsert +
// status write that must run even when media persistence is skipped.
const WRAPUP_RESERVE_MS = 15_000;

interface ProfileResult {
  profile_id: string;
  platform: string;
  handle: string | null;
  status: 'ok' | 'failed' | 'private' | 'not_found' | 'throttled' | 'handle_changed';
  posts_written?: number;
  error?: string;
}

function assertAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Be loud — never let a misconfigured prod silently accept anonymous traffic.
    console.error('[cron] CRON_SECRET not set — cron auth will fail');
    return NextResponse.json(
      {
        error:
          'CRON_SECRET not configured on the server — add it to Vercel project env vars',
      },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization') || '';
  const expectedFull = `Bearer ${expected}`;
  // Length check first so timingSafeEqual doesn't throw on mismatched buffers.
  // The length-mismatch path leaks only "wrong length", not which character —
  // an acceptable oracle for a high-entropy random secret.
  if (
    auth.length !== expectedFull.length ||
    !timingSafeEqual(Buffer.from(auth, 'utf8'), Buffer.from(expectedFull, 'utf8'))
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const authFail = assertAuth(request);
  if (authFail) return authFail;

  const startedAt = new Date();
  let allProfiles;
  try {
    allProfiles = await listScrapeableProfiles();
  } catch (err) {
    return NextResponse.json(
      { error: 'listScrapeableProfiles failed', detail: (err as Error).message },
      { status: 500 },
    );
  }

  // Sort by last_scraped_at NULLS FIRST (never-scraped profiles win priority,
  // then oldest first). DB-side ORDER BY would be cleaner — the database lib
  // currently sorts by created_at; sorting here keeps the change surgical.
  const ordered = [...allProfiles].sort((a, b) => {
    if (a.last_scraped_at === null && b.last_scraped_at === null) return 0;
    if (a.last_scraped_at === null) return -1;
    if (b.last_scraped_at === null) return 1;
    return a.last_scraped_at.localeCompare(b.last_scraped_at);
  });

  // Drop profiles already attempted today (UTC) so the hourly cadence stays one
  // scrape per profile per day: once the roster is drained, later ticks find
  // nothing due and no-op instead of looping back to re-scrape the day's
  // earliest profiles — which would burn paid upstream calls (Facebook ~20x
  // TikHub). last_scraped_at is stamped on every attempt and shares the UTC day
  // boundary with the snapshot dedup key (captured_date = CURRENT_DATE).
  // PostgREST returns timestamptz as UTC ISO, so the leading YYYY-MM-DD is the
  // UTC date — compare by prefix (no Date parsing, can't throw on a bad value).
  const todayUtc = startedAt.toISOString().slice(0, 10);
  const due = ordered.filter(
    (p) => (p.last_scraped_at ?? '').slice(0, 10) !== todayUtc,
  );

  const totalEligible = due.length;
  const profiles = due.slice(0, PROFILES_PER_RUN);
  const skipped = Math.max(0, totalEligible - profiles.length);

  if (totalEligible > PROFILES_PER_RUN) {
    console.warn('[daily-snapshot] capacity reached', {
      total: totalEligible,
      processed: PROFILES_PER_RUN,
      skipped,
    });
  }

  const results: ProfileResult[] = [];

  for (const profile of profiles) {
    try {
      const { profile: snap, posts } = await runScraper(
        profile.platform,
        profile.profile_url,
      );

      await upsertProfileSnapshot(profile.id, snap);
      // Copy post cover images into Storage while their signed CDN URLs are
      // still valid, so thumbnails survive signature expiry (best-effort).
      // Cap the persist step by the function's REMAINING wall-clock budget
      // (minus a reserve for the upsert + status write), so several profiles'
      // persist steps can't compound past maxDuration. When the budget is
      // exhausted the deadline is 0 → persist is skipped and the snapshot
      // (with original CDN URLs) is still written; the backfill heals later.
      const elapsedMs = Date.now() - startedAt.getTime();
      const remainingMs = maxDuration * 1000 - elapsedMs - WRAPUP_RESERVE_MS;
      const mediaDeadlineMs = Math.max(
        0,
        Math.min(POST_MEDIA_DEADLINE_MS, remainingMs),
      );
      const persistedPosts = await persistMediaForPosts(
        profile.id,
        posts,
        mediaDeadlineMs,
      );
      const { written } = await upsertPostSnapshots(profile.id, persistedPosts);
      await setProfileStatus(profile.id, 'ok');

      results.push({
        profile_id: profile.id,
        platform: profile.platform,
        handle: profile.handle,
        status: 'ok',
        posts_written: written,
      });
    } catch (err) {
      const status = err instanceof ScrapeError ? err.status : 'failed';
      const message = err instanceof Error ? err.message : String(err);
      // Surface the failure in Vercel logs. Without this the per-profile error
      // is only visible in the JSON response, so a whole-platform outage (e.g.
      // BrightData "Customer is not active" taking down every Facebook scrape)
      // stays invisible until someone reads a cron response by hand.
      console.error('[daily-snapshot] scrape failed', {
        profile_id: profile.id,
        platform: profile.platform,
        handle: profile.handle,
        status,
        error: message,
      });
      try {
        await setProfileStatus(profile.id, status);
      } catch {
        // Status update itself failed — swallow so the loop continues.
      }
      results.push({
        profile_id: profile.id,
        platform: profile.platform,
        handle: profile.handle,
        status,
        error: message,
      });
    }
  }

  const finishedAt = new Date();
  const summary = {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    elapsed_ms: finishedAt.getTime() - startedAt.getTime(),
    total_eligible: totalEligible,
    processed: profiles.length,
    skipped,
    capacity_per_run: PROFILES_PER_RUN,
    by_status: results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
    results,
  };

  return NextResponse.json(summary, { status: 200 });
}
