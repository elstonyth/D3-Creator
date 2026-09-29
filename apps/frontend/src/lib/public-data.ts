/**
 * The public pages' reads (home, dashboard, leaderboard), cached across
 * visitors for ten minutes.
 *
 * Their numbers only change when the scraper writes new snapshots (hourly
 * at most), yet every uncached render re-aggregated the whole post_snapshot
 * history: public_content_rows alone ran once per 1000-row page, about ten
 * times a render. The slow ones hit the anon role's 3 s statement timeout,
 * and the page fell back to its demo numbers. Cached, one read per key
 * every ten minutes refreshes in the background, and visitors never wait
 * on it.
 *
 * A failed or empty read throws instead of returning, so nothing is cached
 * and the page's own fallback shows, as it did before.
 */

import { unstable_cache } from 'next/cache';
import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import { getLiveCreatorRows, getTopContentRankingsWindowed } from './queries';

// ponytail: ten minutes of staleness; a tag revalidated by the scrape cron if
// fresher numbers are ever wanted.
const TEN_MINUTES = { revalidate: 600 };

export const cachedLiveCreatorRows = unstable_cache(
  async () => {
    const rows = await getLiveCreatorRows();
    if (!rows?.length) throw new Error('public data: no creator rows');
    return rows;
  },
  ['public-live-creator-rows'],
  TEN_MINUTES,
);

export const cachedTopContent = unstable_cache(
  async (limit: number) => {
    const rankings = await getTopContentRankingsWindowed(limit);
    if (Object.values(rankings).every((w) => w.byViews.length === 0))
      throw new Error('public data: no content rows');
    return rankings;
  },
  ['public-top-content'],
  TEN_MINUTES,
);

export const cachedDashboardTotals = unstable_cache(
  async () => {
    const totals = await getDashboardViewTotalsWindowed();
    if (Object.keys(totals.byPlatform).length === 0)
      throw new Error('public data: no view totals');
    return totals;
  },
  ['public-dashboard-totals'],
  TEN_MINUTES,
);
