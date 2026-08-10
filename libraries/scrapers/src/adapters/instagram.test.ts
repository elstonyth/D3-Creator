/**
 * Unit tests for the Instagram adapter timestamp fix (bug hunt 2026-06-01).
 * tikhubGet is mocked, so these run offline and cost no API credits.
 */
jest.mock('../tikhub-client', () => ({ tikhubGet: jest.fn() }));

import { tikhubGet } from '../tikhub-client';
import { instagramAdapter } from './instagram';
import { ScrapeError } from '../errors';

const mockGet = tikhubGet as unknown as jest.Mock;
const PROFILE_URL = 'https://www.instagram.com/nasa';
const healthyProfile = {
  user: {
    username: 'nasa',
    pk: '1',
    follower_count: 100,
    following_count: 1,
    media_count: 10,
  },
};

function postsWith(item: any) {
  return { data: { items: [item] } };
}

beforeEach(() => mockGet.mockReset());

test('a numeric-string taken_at is coerced to ISO instead of breaking the post write', async () => {
  // Pre-fix the raw string "1716800000" was passed straight to a timestamptz
  // column, throwing and failing the whole post batch.
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    return postsWith({
      pk: 'p1',
      code: 'abc',
      like_count: 1,
      taken_at: '1716800000',
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts).toHaveLength(1);
  expect(res.posts[0].posted_at).toBe(
    new Date(1716800000 * 1000).toISOString(),
  );
});

test('a numeric taken_at still works (no regression)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    return postsWith({
      pk: 'p2',
      code: 'def',
      like_count: 1,
      taken_at: 1716800000,
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].posted_at).toBe(
    new Date(1716800000 * 1000).toISOString(),
  );
});

test('a real ISO date string passes through unchanged', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    return postsWith({
      pk: 'p3',
      code: 'ghi',
      like_count: 1,
      taken_at: '2024-05-27T10:00:00.000Z',
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].posted_at).toBe('2024-05-27T10:00:00.000Z');
});

test('a malformed taken_at string falls back to taken_at_timestamp instead of breaking the write', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    return postsWith({
      pk: 'p4',
      code: 'jkl',
      like_count: 1,
      taken_at: 'not-a-date',
      taken_at_timestamp: 1716800000,
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].posted_at).toBe(
    new Date(1716800000 * 1000).toISOString(),
  );
});

test('a zero play_count cannot mask a real ig_play_count (first positive candidate wins)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels')) return { data: { items: [] } };
    return postsWith({
      pk: 'p6',
      code: 'pqr',
      like_count: 1,
      taken_at: 1716800000,
      play_count: 0,
      ig_play_count: 43400,
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].views).toBe(43400);
});

test('a genuinely zero-view post keeps views 0 (not null)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels')) return { data: { items: [] } };
    return postsWith({
      pk: 'p7',
      code: 'stu',
      like_count: 0,
      taken_at: 1716800000,
      play_count: 0,
      ig_play_count: 0,
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].views).toBe(0);
});

test('a malformed taken_at string with no fallback yields null (never a non-timestamp string)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    return postsWith({
      pk: 'p5',
      code: 'mno',
      like_count: 1,
      taken_at: 'not-a-date',
    });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts).toHaveLength(1);
  expect(res.posts[0].posted_at).toBeNull();
});

// --- Deep-backfill pagination (2026-06-03) ---
// The default scrape stays a single cheap page (cron cost unchanged); passing
// { maxPosts } follows the v2 pagination_token to capture deep back-catalog
// posts (e.g. an old viral reel beyond the recent-12 window).

test('deep mode (maxPosts) paginates via pagination_token across pages', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    const token = opts.query?.pagination_token;
    if (!token)
      return {
        data: {
          items: [
            { pk: 'p1', code: 'a', taken_at: 1 },
            { pk: 'p2', code: 'b', taken_at: 1 },
          ],
        },
        pagination_token: 't1',
      };
    if (token === 't1')
      return {
        data: {
          items: [
            { pk: 'p3', code: 'c', taken_at: 1 },
            { pk: 'p4', code: 'd', taken_at: 1 },
          ],
        },
        pagination_token: 't2',
      };
    if (token === 't2')
      return {
        data: { items: [{ pk: 'p5', code: 'e', taken_at: 1 }] },
        pagination_token: null,
      };
    return { data: { items: [] } };
  });

  const res = await instagramAdapter.scrape(PROFILE_URL, { maxPosts: 100 });
  expect(res.posts.map((p) => p.external_post_id)).toEqual([
    'a',
    'b',
    'c',
    'd',
    'e',
  ]);
});

test('default scrape fetches a single page and ignores pagination_token (cron stays cheap)', async () => {
  let postsCalls = 0;
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels')) return { data: { items: [] } };
    postsCalls++;
    return {
      data: { items: [{ pk: 'p1', code: 'a', taken_at: 1 }] },
      pagination_token: 't1',
    };
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(postsCalls).toBe(1);
  expect(res.posts).toHaveLength(1);
});

test('deep mode stops at maxPosts even if more pages remain', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    const n = Number(opts.query?.pagination_token ?? 0);
    return {
      data: { items: [{ pk: 'x' + n, code: 'x' + n, taken_at: 1 }] },
      pagination_token: String(n + 1),
    };
  });

  const res = await instagramAdapter.scrape(PROFILE_URL, { maxPosts: 3 });
  expect(res.posts).toHaveLength(3);
});

// --- Reels feed merge (2026-06-12) ---
// The v2 grid feed (fetch_user_posts) misses reels the creator hid from the
// profile grid (e.g. the 937K "13岁大肚子" reel, posted 2026-02-23, absent from
// 266 captured posts). The adapter now also pulls one page of the v2 reels
// feed (fetch_user_reels — same envelope) and merges by external id.

test('a reels-only post hidden from the grid feed is captured via the reels feed', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels'))
      return {
        data: {
          items: [
            {
              pk: 'g1',
              code: 'shared',
              like_count: 2,
              play_count: 99,
              taken_at: 2,
            },
            {
              pk: 'r1',
              code: 'hidden',
              like_count: 5,
              play_count: 937223,
              taken_at: 1,
            },
          ],
        },
      };
    return postsWith({ pk: 'g1', code: 'shared', like_count: 1, taken_at: 2 });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  const ids = res.posts.map((p) => p.external_post_id);
  expect(ids).toEqual(['shared', 'hidden']);
  // Grid version wins for posts present in both feeds (existing behavior).
  expect(res.posts[0].likes).toBe(1);
  expect(res.posts[1].views).toBe(937223);
});

test('default scrape fetches a single reels page (cron cost bounded)', async () => {
  let reelsCalls = 0;
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels')) {
      reelsCalls++;
      return {
        data: { items: [{ pk: 'r1', code: 'r1', taken_at: 1 }] },
        pagination_token: 'rt1',
      };
    }
    return { data: { items: [] } };
  });

  await instagramAdapter.scrape(PROFILE_URL);
  expect(reelsCalls).toBe(1);
});

test('a reels feed failure degrades to grid-only instead of sinking the scrape', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels'))
      throw new Error('reels tab broke');
    return postsWith({ pk: 'g1', code: 'a', like_count: 1, taken_at: 1 });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['a']);
});

test('deep mode (maxPosts) paginates the reels feed too', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return healthyProfile;
    if (opts.path.includes('fetch_user_reels')) {
      const token = opts.query?.pagination_token;
      if (!token)
        return {
          data: { items: [{ pk: 'r1', code: 'r1', taken_at: 1 }] },
          pagination_token: 'rt1',
        };
      if (token === 'rt1')
        return {
          data: { items: [{ pk: 'r2', code: 'r2', taken_at: 1 }] },
          pagination_token: null,
        };
      return { data: { items: [] } };
    }
    return { data: { items: [{ pk: 'g1', code: 'g1', taken_at: 1 }] } };
  });

  const res = await instagramAdapter.scrape(PROFILE_URL, { maxPosts: 100 });
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['g1', 'r1', 'r2']);
});

// --- Profile endpoint swap (2026-06-03): v3/fetch_user_info_by_username started 400ing on
// TikHub; v1/fetch_user_info_by_username is healthy. Its user sits under
// data.user and reports counts via edge_* (no flat *_count fields). ---

test('resolves profile via v1 fetch_user_info_by_username (user under data.user, edge_* counts)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return {
        data: {
          user: {
            username: 'nasa',
            id: '9',
            edge_followed_by: { count: 4200 },
            edge_follow: { count: 7 },
            edge_owner_to_timeline_media: { count: 88 },
          },
        },
      };
    return { data: { items: [] } };
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.profile.followers).toBe(4200);
  expect(res.profile.following).toBe(7);
  expect(res.profile.total_posts).toBe(88);
});

test('a v1 200 carrying "This account does not exist" falls back to v3', async () => {
  // v1 went partially bad 2026-08-10: HTTP 200 with a user-less error body for
  // 8 of 31 live handles. Without the fallback those get stamped not_found.
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('fetch_user_info_by_username'))
      return { status: false, errorMessage: 'This account does not exist.' };
    if (opts.path.includes('v3/get_user_profile'))
      return { username: 'nasa', pk: '1', follower_count: 42, media_count: 7 };
    return postsWith({ pk: 'p9', code: 'xyz', like_count: 1, taken_at: 1716800000 });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.profile.followers).toBe(42);
});

test('both profile endpoints failing still reports not_found', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('user_info_by_username') || opts.path.includes('get_user_profile'))
      return { status: false, errorMessage: 'This account does not exist.' };
    return postsWith({ pk: 'p10', code: 'zzz', like_count: 1, taken_at: 1716800000 });
  });

  await expect(instagramAdapter.scrape(PROFILE_URL)).rejects.toMatchObject({
    status: 'not_found',
  });
});

test('a not-found verdict beats a transient failure from the other endpoint', async () => {
  // failed is retried daily; not_found backs off 7 days. A handle that is dead
  // on one endpoint and merely 400s on the other must land on not_found.
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('user_info_by_username'))
      return { status: false, errorMessage: 'This account does not exist.' };
    if (opts.path.includes('get_user_profile'))
      throw new ScrapeError('failed', 'TikHub returned HTTP 400', 'instagram', PROFILE_URL, true);
    return postsWith({ pk: 'p11', code: 'qqq', like_count: 1, taken_at: 1716800000 });
  });

  await expect(instagramAdapter.scrape(PROFILE_URL)).rejects.toMatchObject({
    status: 'not_found',
  });
});
