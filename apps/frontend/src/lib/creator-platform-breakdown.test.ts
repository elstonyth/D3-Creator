/** @jest-environment node */
import { getCreatorPlatformBreakdown } from './creator-platform-breakdown';

jest.mock('./metrics-windowed', () => ({
  getDashboardViewTotalsWindowed: jest.fn(),
}));
jest.mock('./owned-insights', () => ({ getMyOwnedInsights: jest.fn() }));

import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import { getMyOwnedInsights } from './owned-insights';

const mockViews = getDashboardViewTotalsWindowed as jest.Mock;
const mockOwned = getMyOwnedInsights as jest.Mock;

// Cookie-client stub routed by table:
//   profile          → select().eq().neq()              → { data: profiles }
//   profile_snapshot → select().in().order().order()    → { data: snapshots }
//   profile_claim    → select().eq()                    → { data: claims }
function makeClient(opts: {
  profiles: Array<{ id: string; platform: string; handle: string | null }>;
  snapshots?: Array<{
    profile_id: string;
    followers: number | null;
    captured_at: string;
  }>;
  claims: Array<{ profile_id: string }>;
}): any {
  const { profiles, snapshots = [], claims } = opts;
  return {
    from: (table: string) => {
      if (table === 'profile') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => Promise.resolve({ data: profiles, error: null }),
            }),
          }),
        };
      }
      if (table === 'profile_snapshot') {
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                order: () => Promise.resolve({ data: snapshots, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'profile_claim') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: claims, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => jest.clearAllMocks());

test('owned IG → owned followers; TikTok stays scraped; ordered IG then TikTok', async () => {
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 }, tiktok: { '30d': 9000 } } },
  });
  mockOwned.mockResolvedValue({
    profile: [{ captured_date: '2026-06-22', follower_total: 1234 }],
    demographics: [],
    posts: [],
  });

  const client = makeClient({
    profiles: [
      { id: 'p_tt', platform: 'tiktok', handle: 'tt_h' },
      { id: 'p_ig', platform: 'instagram', handle: 'ig_h' },
    ],
    snapshots: [
      { profile_id: 'p_ig', followers: 1000, captured_at: '2026-06-22' },
      { profile_id: 'p_tt', followers: 5000, captured_at: '2026-06-22' },
    ],
    claims: [{ profile_id: 'p_ig' }],
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
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
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 } } },
  });
  mockOwned.mockResolvedValue({ profile: [], demographics: [], posts: [] });

  const client = makeClient({
    profiles: [{ id: 'p_ig', platform: 'instagram', handle: 'ig_h' }],
    snapshots: [
      { profile_id: 'p_ig', followers: 1000, captured_at: '2026-06-22' },
    ],
    claims: [{ profile_id: 'p_ig' }],
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
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
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { douyin: { '30d': 7700000 } } },
  });

  const client = makeClient({
    profiles: [
      { id: 'p_ig', platform: 'instagram', handle: null },
      { id: 'p_dy', platform: 'douyin', handle: 'dy_h' },
    ],
    snapshots: [
      { profile_id: 'p_dy', followers: 7000, captured_at: '2026-06-22' },
    ],
    claims: [],
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
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

test('a claim on a profile not belonging to this creator is ignored', async () => {
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 } } },
  });

  const client = makeClient({
    profiles: [{ id: 'p_ig', platform: 'instagram', handle: 'ig_h' }],
    snapshots: [
      { profile_id: 'p_ig', followers: 1000, captured_at: '2026-06-22' },
    ],
    claims: [{ profile_id: 'p_other_creators_ig' }], // not in this creator's slots
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
    creatorId: 'c1',
  });

  expect(cards).toEqual([
    {
      platform: 'instagram',
      handle: 'ig_h',
      source: 'scraped',
      followers: 1000,
      views: 200,
    },
  ]);
  expect(mockOwned).not.toHaveBeenCalled();
});

test('a transient owned-RPC failure degrades to the scraped/syncing card', async () => {
  mockViews.mockResolvedValue({
    byPlatform: {},
    byCreator: { c1: { instagram: { '30d': 200 } } },
  });
  mockOwned.mockRejectedValue(new Error('rpc boom'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const client = makeClient({
    profiles: [{ id: 'p_ig', platform: 'instagram', handle: 'ig_h' }],
    snapshots: [
      { profile_id: 'p_ig', followers: 1000, captured_at: '2026-06-22' },
    ],
    claims: [{ profile_id: 'p_ig' }],
  });

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
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
