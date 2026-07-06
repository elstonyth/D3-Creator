/**
 * Parity check: the public-page aggregate RPCs must produce EXACTLY the same
 * numbers as the JS aggregation they replace (queries.ts before the rewrite).
 * Reimplements the old JS semantics here (raw table reads + JS rollup) and
 * diffs against public_creator_rows() / public_content_rows().
 *
 * Run (bash, repo root):
 *   set -a; . ./.env; set +a; npx tsx supabase/tests/public-rpcs-parity.mts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY must be set');
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE = 1000;
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    if (res.error) throw new Error(res.error.message);
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// ---------- OLD JS semantics (reference) ----------
interface RefProfileAgg {
  followers: number;
  totalViews: number;
  totalEng: number;
  count: number;
}

async function referenceAggregates() {
  const profiles = await fetchAll<{
    id: string;
    creator_id: string;
    platform: string;
    handle: string | null;
  }>((f, t) =>
    sb
      .from('profile')
      .select('id, creator_id, platform, handle')
      .neq('platform', 'rednote')
      .order('id')
      .range(f, t),
  );
  const snaps = await fetchAll<{
    profile_id: string;
    followers: number | null;
  }>((f, t) =>
    sb
      .from('profile_snapshot')
      .select('profile_id, captured_at, followers')
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(f, t),
  );
  const latestFollowers = new Map<string, number>();
  for (const s of snaps)
    if (!latestFollowers.has(s.profile_id))
      latestFollowers.set(s.profile_id, s.followers ?? 0);

  const posts = await fetchAll<{
    profile_id: string;
    external_post_id: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }>((f, t) =>
    sb
      .from('post_snapshot')
      .select(
        'profile_id, external_post_id, captured_at, likes, comments, shares, views',
      )
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(f, t),
  );

  const maxViews = new Map<string, number>();
  for (const p of posts) {
    const k = `${p.profile_id}:${p.external_post_id}`;
    const v = p.views ?? 0;
    if (v > (maxViews.get(k) ?? -1)) maxViews.set(k, v);
  }
  const perProfile = new Map<string, RefProfileAgg>();
  for (const p of profiles)
    perProfile.set(p.id, {
      followers: latestFollowers.get(p.id) ?? 0,
      totalViews: 0,
      totalEng: 0,
      count: 0,
    });
  const seen = new Set<string>();
  for (const p of posts) {
    const agg = perProfile.get(p.profile_id);
    if (!agg) continue; // rednote / unknown
    const k = `${p.profile_id}:${p.external_post_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    agg.totalViews += maxViews.get(k) ?? 0;
    agg.totalEng += (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
    agg.count += 1;
  }
  return { perProfile, maxViews };
}

// ---------- RPC side ----------
// bigint columns may arrive as strings through PostgREST — every comparison
// below coerces via Number(...), and the types say so (mirrors rpcNum in
// queries.ts).
interface CreatorRpcRow {
  profile_id: string;
  followers: number | string;
  total_views: number | string;
  total_engagement: number | string;
  post_count: number | string;
}
interface ContentRpcRow {
  profile_id: string;
  external_post_id: string;
  current_views: number | string;
  likes: number | string;
  comments: number | string;
  shares: number | string;
}

async function main() {
  // Reference reads and RPC reads run concurrently against the LIVE database —
  // a write landing mid-run (e.g. the hourly scrape) can produce a spurious
  // one-off diff that is not a real parity break. Run against a quiescent DB,
  // or simply re-run on failure and only trust a REPRODUCIBLE diff.
  const [{ perProfile, maxViews }, creatorRows, contentRows] =
    await Promise.all([
      referenceAggregates(),
      fetchAll<CreatorRpcRow>((f, t) =>
        sb.rpc('public_creator_rows').range(f, t),
      ),
      fetchAll<ContentRpcRow>((f, t) =>
        sb.rpc('public_content_rows').range(f, t),
      ),
    ]);

  const diffs: string[] = [];

  // 1. Same profile set.
  const rpcProfiles = new Set(creatorRows.map((r) => r.profile_id));
  for (const id of perProfile.keys())
    if (!rpcProfiles.has(id)) diffs.push(`RPC missing profile ${id}`);
  for (const id of rpcProfiles)
    if (!perProfile.has(id)) diffs.push(`RPC extra profile ${id}`);

  // 2. Per-profile aggregates match exactly.
  for (const r of creatorRows) {
    const ref = perProfile.get(r.profile_id);
    if (!ref) continue;
    if (Number(r.followers) !== ref.followers)
      diffs.push(
        `${r.profile_id} followers rpc=${r.followers} ref=${ref.followers}`,
      );
    if (Number(r.total_views) !== ref.totalViews)
      diffs.push(
        `${r.profile_id} views rpc=${r.total_views} ref=${ref.totalViews}`,
      );
    if (Number(r.total_engagement) !== ref.totalEng)
      diffs.push(
        `${r.profile_id} eng rpc=${r.total_engagement} ref=${ref.totalEng}`,
      );
    if (Number(r.post_count) !== ref.count)
      diffs.push(`${r.profile_id} count rpc=${r.post_count} ref=${ref.count}`);
  }

  // 3. Content rows: every post's current_views == MAX(views), and the row set
  //    covers exactly the reference post set.
  const refPosts = new Set(
    [...maxViews.keys()].filter((k) => perProfile.has(k.split(':')[0])),
  );
  const rpcPosts = new Set(
    contentRows.map((r) => `${r.profile_id}:${r.external_post_id}`),
  );
  for (const k of refPosts)
    if (!rpcPosts.has(k)) diffs.push(`content RPC missing post ${k}`);
  for (const k of rpcPosts)
    if (!refPosts.has(k)) diffs.push(`content RPC extra post ${k}`);
  for (const r of contentRows) {
    const k = `${r.profile_id}:${r.external_post_id}`;
    const ref = maxViews.get(k);
    if (ref !== undefined && Number(r.current_views) !== ref)
      diffs.push(`${k} current_views rpc=${r.current_views} ref=${ref}`);
  }

  if (diffs.length) {
    console.error(`PARITY FAILED — ${diffs.length} diffs:`);
    for (const d of diffs.slice(0, 50)) console.error('  ' + d);
    process.exit(1);
  }
  console.log(
    `PARITY OK — ${creatorRows.length} profiles, ${contentRows.length} posts match exactly.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
