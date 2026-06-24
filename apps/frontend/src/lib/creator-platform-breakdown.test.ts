/** @jest-environment node */
import { getCreatorPlatformBreakdown } from './creator-platform-breakdown';

jest.mock('./queries', () => ({ getLiveCreatorRows: jest.fn() }));
jest.mock('./metrics-windowed', () => ({
  getDashboardViewTotalsWindowed: jest.fn(),
}));
jest.mock('./owned-insights', () => ({ getMyOwnedInsights: jest.fn() }));

import { getLiveCreatorRows } from './queries';
import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import { getMyOwnedInsights } from './owned-insights';

const mockRows = getLiveCreatorRows as jest.Mock;
const mockViews = getDashboardViewTotalsWindowed as jest.Mock;
const mockOwned = getMyOwnedInsights as jest.Mock;

// Minimal cookie-client stub: client.from('profile_claim').select(...).eq(...)
// resolves to { data, error }.
function client(
  claims: Array<{ profile_id: string; profile: { platform: string } }>,
): any {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: claims, error: null }),
      }),
    }),
  };
}

beforeEach(() => jest.clearAllMocks());

test('owned IG → owned followers; TikTok stays scraped; ordered IG then TikTok', async () => {
  mockRows.mockResolvedValue([
    {
      creatorId: 'c1',
      platforms: [
        { platform: 'tiktok', handle: 'tt_h', followers: 5000 },
        { platform: 'instagram', handle: 'ig_h', followers: 1000 },
      ],
    },
  ]);
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 }, tiktok: { '30d': 9000 } } },
  });
  mockOwned.mockResolvedValue({
    profile: [{ captured_date: '2026-06-22', follower_total: 1234 }],
    demographics: [],
    posts: [],
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client: client([
      { profile_id: 'p_ig', profile: { platform: 'instagram' } },
    ]),
    creatorId: 'c1',
  });

  expect(cards).toEqual([
    {
      platform: 'instagram',
      handle: 'ig_h',
      source: 'owned',
      followers: 1234,
      views: 200,
    },
    {
      platform: 'tiktok',
      handle: 'tt_h',
      source: 'scraped',
      followers: 5000,
      views: 9000,
    },
  ]);
  expect(mockOwned).toHaveBeenCalledWith(expect.anything(), 'p_ig', 1);
});

test('owner-claimed but no owned rows yet → scraped + syncing', async () => {
  mockRows.mockResolvedValue([
    {
      creatorId: 'c1',
      platforms: [{ platform: 'instagram', handle: 'ig_h', followers: 1000 }],
    },
  ]);
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 } } },
  });
  mockOwned.mockResolvedValue({ profile: [], demographics: [], posts: [] });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client: client([
      { profile_id: 'p_ig', profile: { platform: 'instagram' } },
    ]),
    creatorId: 'c1',
  });

  expect(cards).toEqual([
    {
      platform: 'instagram',
      handle: 'ig_h',
      source: 'scraped',
      followers: 1000,
      views: 200,
      syncing: true,
    },
  ]);
});

test('no claims → all scraped; slot without a handle is skipped', async () => {
  mockRows.mockResolvedValue([
    {
      creatorId: 'c1',
      platforms: [
        { platform: 'instagram', handle: null, followers: 1000 },
        { platform: 'douyin', handle: 'dy_h', followers: 7000 },
      ],
    },
  ]);
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { douyin: { '30d': 7700000 } } },
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client: client([]),
    creatorId: 'c1',
  });

  expect(cards).toEqual([
    {
      platform: 'douyin',
      handle: 'dy_h',
      source: 'scraped',
      followers: 7000,
      views: 7700000,
    },
  ]);
  expect(mockOwned).not.toHaveBeenCalled();
});
