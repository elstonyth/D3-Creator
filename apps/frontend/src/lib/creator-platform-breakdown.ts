// apps/frontend/src/lib/creator-platform-breakdown.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricWindow } from './metrics-windowed';
import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import type { PlatformKey } from '@gitroom/frontend/components/ui/platform-icons';

export interface PlatformCard {
  platform: PlatformKey;
  handle: string;
  followers: number | null;
  views: number | null;
}

// RedNote is excluded from the scoped profile read below.
const ORDER: PlatformKey[] = ['instagram', 'facebook', 'tiktok', 'douyin'];

// The dashboard_view_totals_windowed RPC keys windows by the dashboard-pill
// vocabulary ('1w'/'1m'/'3m'/…), not MetricWindow ('7d'/'30d'/'90d').
const WINDOW_TO_VIEW_PERIOD: Record<MetricWindow, string> = {
  '7d': '1w',
  '30d': '1m',
  '90d': '3m',
  lifetime: 'lifetime',
};

/**
 * Per-platform summary cards for the creator's own `/me` dashboard. Followers and
 * views are scraped for every platform, scoped to `creatorId` (no full-table scan).
 */
export async function getCreatorPlatformBreakdown(
  window: MetricWindow,
  opts: { client: SupabaseClient; creatorId: string },
): Promise<PlatformCard[]> {
  const { client, creatorId } = opts;

  // Scraped per-platform slots for THIS creator only (scoped — no full scan).
  const { data: profs } = await client
    .from('profile')
    .select('id, platform, handle')
    .eq('creator_id', creatorId)
    .neq('platform', 'rednote'); // xiaohongshu archived
  const profileIds = (profs ?? []).map((p) => p.id as string);

  // Latest scraped follower count per profile (newest snapshot wins).
  //
  // One `.limit(1)` query per profile (a creator has <=4 here, RedNote excluded)
  // — NOT a single unbounded `.in()` over full history. PostgREST caps a response
  // at ~1000 rows, and because the rows are ordered by captured_at across ALL of
  // the creator's profiles, a few actively-scraped profiles fill the page and the
  // stalest profile's newest row falls off the end — rendering null followers for
  // exactly the profile most likely to need attention. Same reasoning (and same
  // fix) as latestSnapshotsForProfiles in lib/queries.ts.
  const followersByProfile = new Map<string, number | null>();
  if (profileIds.length > 0) {
    const uniqueIds = Array.from(new Set(profileIds));
    const results = await Promise.all(
      uniqueIds.map((pid) =>
        client
          .from('profile_snapshot')
          .select('profile_id, followers, captured_at')
          .eq('profile_id', pid)
          .order('captured_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1),
      ),
    );
    for (const res of results) {
      // Log and skip a per-profile failure so one bad profile can't blank the
      // others (the previous `const { data }` destructure dropped errors
      // silently, making a failed query look like "no snapshots").
      if (res.error) {
        console.error(
          '[creator-platform-breakdown] latest snapshot',
          res.error,
        );
        continue;
      }
      const row = res.data?.[0];
      if (row && !followersByProfile.has(row.profile_id as string)) {
        followersByProfile.set(
          row.profile_id as string,
          (row.followers as number | null) ?? null,
        );
      }
    }
  }

  const slots = (profs ?? []).map((p) => ({
    profileId: p.id as string,
    platform: p.platform as PlatformKey,
    handle: (p.handle as string | null) ?? null,
    followers: followersByProfile.get(p.id as string) ?? null,
  }));

  // Scraped window views, scoped to this creator.
  const totals = await getDashboardViewTotalsWindowed({
    client,
    creatorIds: [creatorId],
  });
  const viewsByPlatform = totals.byCreator[creatorId] ?? {};

  const cards: PlatformCard[] = [];
  for (const platform of ORDER) {
    const slot = slots.find((s) => s.platform === platform);
    if (!slot || !slot.handle) continue; // not tracked / no handle → skip
    cards.push({
      platform,
      handle: slot.handle,
      followers: slot.followers,
      views: viewsByPlatform[platform]?.[WINDOW_TO_VIEW_PERIOD[window]] ?? null,
    });
  }
  return cards;
}
