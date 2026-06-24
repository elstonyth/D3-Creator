// apps/frontend/src/lib/creator-platform-breakdown.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricWindow } from './metrics-windowed';
import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import { getLiveCreatorRows } from './queries';
import { getMyOwnedInsights } from './owned-insights';
import type { PlatformKey } from '@gitroom/frontend/components/ui/platform-icons';

export interface PlatformCard {
  platform: PlatformKey;
  handle: string;
  source: 'owned' | 'scraped';
  followers: number | null;
  views: number | null;
  syncing?: boolean;
}

// Platforms whose owned (OAuth) followers we prefer when connected.
const OWNED_CAPABLE = new Set<string>(['instagram', 'facebook']);
// Owned-capable first; RedNote is already excluded upstream.
const ORDER: PlatformKey[] = ['instagram', 'facebook', 'tiktok', 'douyin'];

export async function getCreatorPlatformBreakdown(
  window: MetricWindow,
  opts: { client: SupabaseClient; creatorId: string },
): Promise<PlatformCard[]> {
  const { client, creatorId } = opts;

  // Scraped per-platform handle + followers (RedNote already excluded).
  const rows = await getLiveCreatorRows();
  const slots = rows?.find((r) => r.creatorId === creatorId)?.platforms ?? [];

  // Scraped window views, scoped to this creator.
  const totals = await getDashboardViewTotalsWindowed({
    client,
    creatorIds: [creatorId],
  });
  const viewsByPlatform = totals.byCreator[creatorId] ?? {};

  // Which owned-capable platforms are OAuth-connected (owner claims).
  const { data: claims } = await client
    .from('profile_claim')
    .select('profile_id, profile:profile_id(platform)')
    .eq('claim_kind', 'owner');
  const ownedProfileByPlatform = new Map<string, string>();
  for (const c of claims ?? []) {
    const prof = (Array.isArray(c.profile) ? c.profile[0] : c.profile) as
      | { platform: string | null }
      | null
      | undefined;
    if (prof?.platform && OWNED_CAPABLE.has(prof.platform)) {
      ownedProfileByPlatform.set(prof.platform, c.profile_id as string);
    }
  }

  const cards: PlatformCard[] = [];
  for (const platform of ORDER) {
    const slot = slots.find((s) => s.platform === platform);
    if (!slot || !slot.handle) continue; // not tracked / no handle → skip
    const handle = slot.handle;
    const views = viewsByPlatform[platform]?.[window] ?? null;
    const scrapedFollowers = slot.followers ?? null;

    const ownedProfileId = ownedProfileByPlatform.get(platform);
    if (ownedProfileId) {
      const owned = await getMyOwnedInsights(client, ownedProfileId, 1);
      const latest = owned?.profile[owned.profile.length - 1];
      if (latest && latest.follower_total != null) {
        cards.push({
          platform,
          handle,
          source: 'owned',
          followers: latest.follower_total,
          views,
        });
        continue;
      }
      // Connected, but the cron has not ingested owned rows yet.
      cards.push({
        platform,
        handle,
        source: 'scraped',
        followers: scrapedFollowers,
        views,
        syncing: true,
      });
      continue;
    }

    cards.push({
      platform,
      handle,
      source: 'scraped',
      followers: scrapedFollowers,
      views,
    });
  }
  return cards;
}
