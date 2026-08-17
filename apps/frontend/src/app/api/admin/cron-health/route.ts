/**
 * Cron health endpoint. Returns the last N archive_run rows (the
 * /api/cron/archive-and-purge Vercel cron's log).
 *
 * pg_cron history is NOT exposed here — cron.job_run_details lives in the
 * cron schema and PostgREST does not surface it. Query it directly in the
 * Supabase SQL editor:
 *
 *   -- For pg_cron history query via Supabase SQL editor:
 *   select * from cron.job_run_details order by start_time desc limit 20;
 *
 * Auth: Bearer ${CRON_SECRET}. Same secret as the cron handlers themselves
 * — gates this admin endpoint behind a value only the operator should know.
 *
 * Curl:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/admin/cron-health?limit=10
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@d3/database';
import { fetchAllRows } from '@gitroom/frontend/lib/queries';
import {
  STALE_AFTER_HOURS,
  dataAgeHours,
  needsAttention,
} from '@gitroom/frontend/lib/scrape-staleness';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function assertAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
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
  if (
    auth.length !== expectedFull.length ||
    !timingSafeEqual(
      Buffer.from(auth, 'utf8'),
      Buffer.from(expectedFull, 'utf8'),
    )
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

function clampLimit(raw: string | null): number {
  const n = raw ? Number(raw) : 10;
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(n, 100);
}

export async function GET(request: Request): Promise<Response> {
  const authFail = assertAuth(request);
  if (authFail) return authFail;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const sb = getSupabaseAdmin();

  // archive_run rows — most recent first.
  // For pg_cron history query via Supabase SQL editor:
  //   select * from cron.job_run_details order by start_time desc limit 20
  const archiveRuns = await sb
    .from('archive_run')
    .select(
      'id, started_at, finished_at, status, profile_snapshots_archived, post_snapshots_archived, profile_snapshots_deleted, post_snapshots_deleted, error_message',
    )
    .order('started_at', { ascending: false })
    .limit(limit);

  const stale = await staleProfiles(sb);

  return NextResponse.json({
    archive_runs: archiveRuns.data ?? [],
    archive_runs_error: archiveRuns.error?.message ?? null,
    stale_profiles: stale.rows,
    stale_profiles_error: stale.error,
    stale_after_hours: STALE_AFTER_HOURS,
    limit,
  });
}

/**
 * Profiles whose newest SUCCESSFUL capture is older than STALE_AFTER_HOURS (or
 * which have none at all), most stale first.
 *
 * This is the surface that was missing: before it, the only scrape signal here
 * was archive_run, so a profile could fail every day for ten weeks — as one
 * did, to 70 days — with nothing to look at. Note it keys on
 * profile_snapshot.captured_at (last SUCCESS), not profile.last_scraped_at
 * (last ATTEMPT); the failing profile's attempt timestamp stays fresh forever
 * precisely because the cron keeps retrying it.
 *
 * Two bounded queries, not one per profile: the roster is ~120 rows and the
 * snapshot read is capped by fetchAllRows' paging.
 */
async function staleProfiles(sb: SupabaseClient): Promise<{
  rows: Array<{
    profile_id: string;
    platform: string;
    handle: string | null;
    scrape_status: string;
    last_scraped_at: string | null;
    newest_captured_at: string | null;
    data_age_hours: number | null;
  }>;
  error: string | null;
}> {
  const nowMs = Date.now();

  // Explicitly bounded — matches admin-creators.ts's .limit(500) house style.
  // The roster is ~120, but an endpoint whose job is detecting silent truncation
  // shouldn't itself rely on PostgREST's implicit 1000-row cap.
  const profilesRes = await sb
    .from('profile')
    .select('id, platform, handle, scrape_status, last_scraped_at')
    .limit(500);
  if (profilesRes.error) {
    return { rows: [], error: profilesRes.error.message };
  }
  const profiles = (profilesRes.data ?? []) as Array<{
    id: string;
    platform: string;
    handle: string | null;
    scrape_status: string;
    last_scraped_at: string | null;
  }>;
  if (profiles.length === 0) return { rows: [], error: null };

  // Newest capture per profile. Paged so PostgREST's ~1000-row response cap
  // can't silently truncate the tail — the stalest profiles sort LAST under
  // captured_at desc, so truncation would drop exactly what we're looking for.
  const snaps = await fetchAllRows<{ profile_id: string; captured_at: string }>(
    (from, to) =>
      sb
        .from('profile_snapshot')
        .select('profile_id, captured_at')
        .order('captured_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
  );
  if (snaps.error) return { rows: [], error: snaps.error.message };

  const newestByProfile = new Map<string, string>();
  for (const s of snaps.rows) {
    if (!newestByProfile.has(s.profile_id)) {
      newestByProfile.set(s.profile_id, s.captured_at);
    }
  }

  return {
    rows: profiles
      .map((p) => {
        const newest = newestByProfile.get(p.id) ?? null;
        return {
          profile_id: p.id,
          platform: p.platform,
          handle: p.handle,
          scrape_status: p.scrape_status,
          last_scraped_at: p.last_scraped_at,
          newest_captured_at: newest,
          data_age_hours: dataAgeHours(newest, nowMs),
        };
      })
      // Retired (`private`) profiles are excluded: they're gated out of the
      // roster on purpose, so their data age grows forever and would sit at the
      // top of this list permanently. Three RedNote profiles are already in that
      // state, and retiring a dead profile to `private` is the recommended
      // remedy — so without this filter, every correct fix adds a false positive.
      .filter((r) =>
        needsAttention(r.scrape_status, r.newest_captured_at, nowMs),
      )
      // Most stale first; never-captured (null age) sorts to the very top.
      .sort(
        (a, b) =>
          (b.data_age_hours ?? Infinity) - (a.data_age_hours ?? Infinity),
      ),
    error: null,
  };
}
