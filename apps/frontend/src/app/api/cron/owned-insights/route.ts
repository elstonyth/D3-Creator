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
const MAX_CONCURRENCY = 3; // connections ingested in parallel per batch

interface ConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
  profile_id: string;
  external_account_id: string;
}

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
  capturedDate: string,
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
      captured_date: capturedDate,
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
    const demoRes = await replaceAudienceDemographics(
      conn.profile_id,
      capturedDate,
      demographics,
    );
    if (demoRes.ok !== true) {
      console.error('[owned-insights] demographics write failed', {
        profile_id: conn.profile_id,
        error: demoRes.error,
      });
    }
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
          captured_date: capturedDate,
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
      captured_date: capturedDate,
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
          captured_date: capturedDate,
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

  // One day key for the whole run, computed once (UTC) and threaded into every
  // upsert + the demographics replace, so the JS clock and the DB never disagree.
  const capturedDate = new Date().toISOString().slice(0, 10);

  async function runOne(c: ConnectionRow) {
    try {
      await withTimeout(
        ingestConnection(
          c as OAuthConnectionRow & {
            profile_id: string;
            external_account_id: string;
          },
          capturedDate,
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

  // Process in small concurrent batches and stop launching new ones once too
  // little wall-clock remains for a full batch — otherwise a large connection
  // set (each up to PER_CONNECTION_MS) could push the function past maxDuration
  // and 504 mid-write. The remainder is picked up by the next daily run.
  const startedAt = Date.now();
  const RESERVE_MS = 5_000;
  const queue = [...(conns ?? [])];
  let deferred = 0;
  while (queue.length > 0) {
    if (
      maxDuration * 1000 - (Date.now() - startedAt) <
      PER_CONNECTION_MS + RESERVE_MS
    ) {
      deferred = queue.length;
      console.warn('[owned-insights] budget low, deferring remainder', {
        deferred,
      });
      break;
    }
    const batch = queue.splice(0, MAX_CONCURRENCY);
    await Promise.all(batch.map((c) => runOne(c as ConnectionRow)));
  }

  return NextResponse.json(
    {
      processed: results.length,
      deferred,
      by_status: results.reduce<Record<string, number>>(
        (a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a),
        {},
      ),
      results,
    },
    { status: 200 },
  );
}
