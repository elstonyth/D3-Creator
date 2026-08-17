/**
 * getCreatorPlatformBreakdown must read the latest snapshot PER PROFILE with a
 * bounded query per profile — not one unbounded `.in()` over full snapshot
 * history. PostgREST caps any single response at ~1000 rows, and because the
 * old query ordered by captured_at across ALL of the creator's profiles, a few
 * actively-scraped profiles would fill the page and the stalest profile's
 * newest row fell off the end — rendering null followers on /me for exactly the
 * profile most likely to need attention.
 *
 * Mirrors queries.latest-snapshots.test.ts, which covers the same fix in
 * lib/queries.ts.
 */
jest.mock('./metrics-windowed', () => ({
  getDashboardViewTotalsWindowed: jest.fn(),
}));

import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import { getCreatorPlatformBreakdown } from './creator-platform-breakdown';

const mockViews = getDashboardViewTotalsWindowed as unknown as jest.Mock;

type Result = { data: unknown[] | null; error: { message: string } | null };
type Profile = { id: string; platform: string; handle: string | null };

/**
 * Fake PostgREST client routed by table.
 *   profile          → select→eq→neq                    resolves the profile list
 *   profile_snapshot → select→eq→order→order→limit      resolves PER profile id
 *
 * `snapshotIds` records which profile ids the snapshot table was queried with —
 * that is what proves the query is per-profile rather than one shared page.
 */
function fakeClient(profiles: Profile[], byProfile: Record<string, Result>) {
  const snapshotIds: string[] = [];
  const limits: number[] = [];
  const from = jest.fn((table: string) => {
    if (table === 'profile') {
      const q = {
        select: jest.fn(() => q),
        eq: jest.fn(() => q),
        neq: jest.fn(() => Promise.resolve({ data: profiles, error: null })),
      };
      return q;
    }
    if (table === 'profile_snapshot') {
      const q = {
        _id: '',
        select: jest.fn(() => q),
        eq: jest.fn((_col: string, id: string) => {
          q._id = id;
          snapshotIds.push(id);
          return q;
        }),
        order: jest.fn(() => q),
        limit: jest.fn((n: number) => {
          limits.push(n);
          return Promise.resolve(byProfile[q._id] ?? { data: [], error: null });
        }),
      };
      return q;
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from } as never, from, snapshotIds, limits };
}

const snap = (profileId: string, followers: number, capturedAt: string) => ({
  profile_id: profileId,
  followers,
  captured_at: capturedAt,
});

beforeEach(() => {
  mockViews.mockReset();
  mockViews.mockResolvedValue({
    byCreator: {
      c1: {
        instagram: { '1m': 500 },
        tiktok: { '1m': 9000 },
      },
    },
  });
});

test('returns a card per tracked platform, in ORDER, with followers and views', async () => {
  const { client } = fakeClient(
    [
      { id: 'p-tt', platform: 'tiktok', handle: 'tt_handle' },
      { id: 'p-ig', platform: 'instagram', handle: 'ig_handle' },
    ],
    {
      'p-ig': {
        data: [snap('p-ig', 100, '2026-08-17T00:00:00Z')],
        error: null,
      },
      'p-tt': {
        data: [snap('p-tt', 200, '2026-08-17T00:00:00Z')],
        error: null,
      },
    },
  );

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
    creatorId: 'c1',
  });

  // ORDER is instagram, facebook, tiktok, douyin — not insertion order.
  expect(cards.map((c) => c.platform)).toEqual(['instagram', 'tiktok']);
  expect(cards[0]).toMatchObject({
    handle: 'ig_handle',
    followers: 100,
    views: 500,
  });
  expect(cards[1]).toMatchObject({
    handle: 'tt_handle',
    followers: 200,
    views: 9000,
  });
});

test('uses one bounded limit(1) query per profile — no unbounded history scan', async () => {
  const { client, snapshotIds, limits } = fakeClient(
    [
      { id: 'p-ig', platform: 'instagram', handle: 'ig_handle' },
      { id: 'p-tt', platform: 'tiktok', handle: 'tt_handle' },
    ],
    {
      'p-ig': {
        data: [snap('p-ig', 100, '2026-08-17T00:00:00Z')],
        error: null,
      },
      'p-tt': {
        data: [snap('p-tt', 200, '2026-08-17T00:00:00Z')],
        error: null,
      },
    },
  );

  await getCreatorPlatformBreakdown('30d', { client, creatorId: 'c1' });

  // Each profile is queried by its OWN id — the shape that cannot be truncated.
  expect(snapshotIds.sort()).toEqual(['p-ig', 'p-tt']);
  expect(limits).toEqual([1, 1]);
});

test('a stale profile still reports followers (the regression this fixes)', async () => {
  // p-ig scraped today, p-tt last captured 70 days ago. Under the old shared
  // `.in()` page ordered by captured_at desc, p-tt's row sorted behind every
  // fresh p-ig row and fell off the ~1000-row cap → null followers.
  const { client, snapshotIds } = fakeClient(
    [
      { id: 'p-ig', platform: 'instagram', handle: 'ig_handle' },
      { id: 'p-tt', platform: 'tiktok', handle: 'tt_handle' },
    ],
    {
      'p-ig': {
        data: [snap('p-ig', 100, '2026-08-17T00:00:00Z')],
        error: null,
      },
      'p-tt': {
        data: [snap('p-tt', 4321, '2026-06-08T04:00:20Z')],
        error: null,
      },
    },
  );

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
    creatorId: 'c1',
  });

  const tiktok = cards.find((c) => c.platform === 'tiktok');
  expect(tiktok?.followers).toBe(4321);
  expect(snapshotIds).toContain('p-tt');
});

test('one profile erroring does not blank the others', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { client } = fakeClient(
      [
        { id: 'p-ig', platform: 'instagram', handle: 'ig_handle' },
        { id: 'p-tt', platform: 'tiktok', handle: 'tt_handle' },
      ],
      {
        'p-ig': { data: null, error: { message: 'boom' } },
        'p-tt': {
          data: [snap('p-tt', 200, '2026-08-17T00:00:00Z')],
          error: null,
        },
      },
    );

    const cards = await getCreatorPlatformBreakdown('30d', {
      client,
      creatorId: 'c1',
    });

    expect(cards.find((c) => c.platform === 'instagram')?.followers).toBeNull();
    expect(cards.find((c) => c.platform === 'tiktok')?.followers).toBe(200);
    expect(err).toHaveBeenCalled();
  } finally {
    err.mockRestore();
  }
});

test('a profile with no handle produces no card', async () => {
  const { client } = fakeClient(
    [
      { id: 'p-ig', platform: 'instagram', handle: null },
      { id: 'p-tt', platform: 'tiktok', handle: 'tt_handle' },
    ],
    {
      'p-ig': {
        data: [snap('p-ig', 100, '2026-08-17T00:00:00Z')],
        error: null,
      },
      'p-tt': {
        data: [snap('p-tt', 200, '2026-08-17T00:00:00Z')],
        error: null,
      },
    },
  );

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
    creatorId: 'c1',
  });

  expect(cards.map((c) => c.platform)).toEqual(['tiktok']);
});

test('a creator with no profiles returns [] and issues no snapshot query', async () => {
  const { client, snapshotIds } = fakeClient([], {});

  const cards = await getCreatorPlatformBreakdown('30d', {
    client,
    creatorId: 'c1',
  });

  expect(cards).toEqual([]);
  expect(snapshotIds).toEqual([]);
});
