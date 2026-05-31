/**
 * Media backfill — copy still-valid social-CDN post images into the public
 * post-media Storage bucket and rewrite post_snapshot.media_url to the
 * permanent Supabase URL.
 *
 * Re-runnable and idempotent: rows already pointing at supabase.co are
 * excluded, and expired CDN URLs simply fail the fetch and are skipped (they
 * need a fresh scrape to recover). Pairs with the best-effort inline
 * persistence in the scrape path — this heals anything the inline step's
 * per-profile deadline skipped, plus any media scraped before this fix shipped.
 *
 *   GET /api/admin/backfill-media           -> performs the backfill
 *   GET /api/admin/backfill-media?dryRun=1  -> reports candidate counts only
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (same gate as the crons).
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getSupabaseAdmin, persistPostMedia } from '@d3/database';

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
  external_post_id: string;
  media_url: string;
  captured_date: string;
}

export async function GET(request: Request): Promise<Response> {
  const authFail = assertAuth(request);
  if (authFail) return authFail;

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const sb = getSupabaseAdmin();

  // Candidate rows: an http(s) media_url that isn't already on our Storage.
  const res = await sb
    .from('post_snapshot')
    .select('profile_id, external_post_id, media_url, captured_date')
    .like('media_url', 'http%')
    .not('media_url', 'ilike', '%supabase.co%');
  if (res.error) {
    return NextResponse.json(
      { error: 'candidate query failed', detail: res.error.message },
      { status: 500 },
    );
  }
  const rows = (res.data ?? []) as CandidateRow[];

  // Dedupe to the latest snapshot per (profile, post) — that's the row the
  // read path displays. We heal all rows for the post in one UPDATE below.
  const latest = new Map<string, CandidateRow>();
  for (const r of rows) {
    const key = `${r.profile_id}::${r.external_post_id}`;
    const cur = latest.get(key);
    if (!cur || r.captured_date > cur.captured_date) latest.set(key, r);
  }
  const candidates = [...latest.values()];

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      candidate_posts: candidates.length,
      candidate_rows: rows.length,
    });
  }

  let persisted = 0;
  let failed = 0;
  let rowsUpdated = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < candidates.length) {
      const c = candidates[next++];
      const permanent = await persistPostMedia(
        c.profile_id,
        c.external_post_id,
        c.media_url,
      );
      if (!permanent || permanent === c.media_url) {
        failed++;
        continue;
      }
      persisted++;
      // Heal every snapshot row for this post (historical rows share the image).
      const upd = await sb
        .from('post_snapshot')
        .update({ media_url: permanent })
        .eq('profile_id', c.profile_id)
        .eq('external_post_id', c.external_post_id)
        .like('media_url', 'http%')
        .not('media_url', 'ilike', '%supabase.co%')
        .select('id');
      if (!upd.error) rowsUpdated += upd.data?.length ?? 0;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return NextResponse.json({
    dryRun: false,
    candidate_posts: candidates.length,
    persisted,
    failed,
    rows_updated: rowsUpdated,
  });
}
