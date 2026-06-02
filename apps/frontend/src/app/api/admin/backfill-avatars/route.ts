/**
 * Avatar backfill — copy still-valid social-CDN avatar images into the public
 * post-media Storage bucket and rewrite profile_snapshot.avatar_url to the
 * permanent Supabase URL.
 *
 * Re-runnable and idempotent: rows already pointing at supabase.co are
 * excluded, and expired CDN URLs simply fail the fetch and are skipped (they
 * need a fresh scrape to recover). Pairs with the best-effort inline avatar
 * persistence in upsertProfileSnapshot — this heals anything scraped before the
 * avatar-persistence change shipped, plus any profile whose inline copy failed.
 *
 *   GET /api/admin/backfill-avatars           -> performs the backfill
 *   GET /api/admin/backfill-avatars?dryRun=1  -> reports candidate counts only
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (same gate as the crons).
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getSupabaseAdmin, persistAvatar } from '@d3/database';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CONCURRENCY = 8;

function assertAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on the server' },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization') || '';
  const expectedFull = `Bearer ${expected}`;
  if (
    auth.length !== expectedFull.length ||
    !timingSafeEqual(Buffer.from(auth, 'utf8'), Buffer.from(expectedFull, 'utf8'))
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

interface CandidateRow {
  profile_id: string;
  avatar_url: string;
  captured_date: string;
}

export async function GET(request: Request): Promise<Response> {
  const authFail = assertAuth(request);
  if (authFail) return authFail;

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const sb = getSupabaseAdmin();

  // Candidate rows: an http(s) avatar_url that isn't already on our Storage.
  const PAGE = 1000;
  const rows: CandidateRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await sb
      .from('profile_snapshot')
      .select('profile_id, avatar_url, captured_date')
      .like('avatar_url', 'http%')
      .not('avatar_url', 'ilike', '%supabase.co%')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (res.error) {
      return NextResponse.json(
        { error: 'candidate query failed', detail: res.error.message },
        { status: 500 },
      );
    }
    const page = (res.data ?? []) as CandidateRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // Dedupe to the latest snapshot per profile — that's the avatar the read path
  // displays. We heal every CDN-url row for the profile in one UPDATE below.
  const latest = new Map<string, CandidateRow>();
  for (const r of rows) {
    const cur = latest.get(r.profile_id);
    if (!cur || r.captured_date > cur.captured_date) latest.set(r.profile_id, r);
  }
  const candidates = [...latest.values()];

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      candidate_profiles: candidates.length,
      candidate_rows: rows.length,
    });
  }

  let persisted = 0; // avatar copied to Storage
  let failed = 0; // fetch/upload failed (kept on its CDN URL)
  let updateFailed = 0; // copied but the DB heal errored
  let rowsUpdated = 0; // snapshot rows pointed at the permanent URL
  let next = 0;

  async function worker(): Promise<void> {
    while (next < candidates.length) {
      const c = candidates[next++];
      const permanent = await persistAvatar(c.profile_id, c.avatar_url);
      if (!permanent || permanent === c.avatar_url) {
        failed++;
        continue;
      }
      persisted++;
      // Heal every CDN-url snapshot row for this profile (one Storage object per
      // profile, so they all resolve to the same permanent URL).
      const upd = await sb
        .from('profile_snapshot')
        .update({ avatar_url: permanent })
        .eq('profile_id', c.profile_id)
        .like('avatar_url', 'http%')
        .not('avatar_url', 'ilike', '%supabase.co%')
        .select('id');
      if (upd.error) {
        updateFailed++;
        console.error(
          '[backfill-avatars] row update failed',
          c.profile_id,
          upd.error.message,
        );
        continue;
      }
      rowsUpdated += upd.data?.length ?? 0;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return NextResponse.json({
    dryRun: false,
    candidate_profiles: candidates.length,
    persisted,
    failed,
    update_failed: updateFailed,
    rows_updated: rowsUpdated,
  });
}
