/**
 * Unit tests for the Douyin adapter — deep-backfill pagination (2026-06-03).
 * tikhubGet is mocked, so these run offline and cost no API credits.
 *
 * Douyin's feed reports play_count=0, so the adapter backfills real views from
 * the app/v3 fetch_multi_video_statistics endpoint. The mocks below stub that
 * endpoint too so the deep window's views resolve.
 */
jest.mock('../tikhub-client', () => ({ tikhubGet: jest.fn() }));

import { tikhubGet } from '../tikhub-client';
import { ProfileNotFoundError, ScrapeError } from '../errors';
import { douyinAdapter } from './douyin';

const mockGet = tikhubGet as unknown as jest.Mock;
const PROFILE_URL = 'https://www.douyin.com/user/SEC_ABC';

const healthyProfile = {
  user: {
    uid: '1',
    sec_uid: 'SEC_ABC',
    follower_count: 500,
    following_count: 5,
    aweme_count: 40,
    total_favorited: 12345,
  },
};

const aweme = (id: string) => ({
  aweme_id: id,
  create_time: 1716800000,
  // feed always reports play_count=0 on Douyin; real views come from stats.
  statistics: {
    play_count: 0,
    digg_count: 1,
    comment_count: 1,
    share_count: 0,
  },
});

/** Stub fetch_multi_video_statistics: echo a fixed play_count for each id. */
function statsFor(opts: any) {
  const ids = String(opts.query?.aweme_ids ?? '')
    .split(',')
    .filter(Boolean);
  return {
    statistics_list: ids.map((id) => ({
      aweme_id: id,
      play_count: 1000,
      digg_count: 10,
      share_count: 1,
    })),
  };
}

beforeEach(() => mockGet.mockReset());

test('deep mode (maxPosts) paginates via max_cursor across pages', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    if (opts.path.includes('fetch_multi_video_statistics'))
      return statsFor(opts);
    const cursor = Number(opts.query?.max_cursor ?? 0);
    if (cursor === 0)
      return {
        aweme_list: [aweme('d1'), aweme('d2')],
        has_more: 1,
        max_cursor: 100,
      };
    if (cursor === 100)
      return { aweme_list: [aweme('d3')], has_more: 0, max_cursor: 200 };
    return { aweme_list: [], has_more: 0 };
  });

  const res = await douyinAdapter.scrape(PROFILE_URL, { maxPosts: 100 });
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['d1', 'd2', 'd3']);
  // Stats backfill must run across the full deep window, not just page one.
  expect(res.posts.every((p) => p.views === 1000)).toBe(true);
});

test('default scrape fetches a single posts page (cron stays cheap)', async () => {
  let postsCalls = 0;
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    if (opts.path.includes('fetch_multi_video_statistics'))
      return statsFor(opts);
    postsCalls++;
    return { aweme_list: [aweme('d1')], has_more: 1, max_cursor: 100 };
  });

  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(postsCalls).toBe(1);
  expect(res.posts).toHaveLength(1);
});

test("a failed stats backfill degrades views to null — never the feed's bogus 0", async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    mockGet.mockImplementation(async (opts: any) => {
      if (opts.path.includes('handler_user_profile')) return healthyProfile;
      if (opts.path.includes('fetch_multi_video_statistics')) {
        throw new Error('TikHub 500');
      }
      return { aweme_list: [aweme('d1'), aweme('d2')], has_more: 0 };
    });

    const res = await douyinAdapter.scrape(PROFILE_URL);

    // The feed always reports play_count=0 (Douyin hides views there), so
    // falling back to it would WRITE "0 views" for posts with possibly
    // millions — a wrong real value that poisons the snapshot time series.
    // Views must be null (unknown), and the profile window total too.
    expect(res.posts.map((p) => p.views)).toEqual([null, null]);
    expect(res.profile.total_views).toBeNull();
    // Engagement counts the feed DOES report truthfully still flow through.
    expect(res.posts[0].likes).toBe(1);
    expect(res.posts[0].comments).toBe(1);
  } finally {
    warn.mockRestore();
  }
});

test('deep mode stops at maxPosts even if more pages remain', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    if (opts.path.includes('fetch_multi_video_statistics'))
      return statsFor(opts);
    const n = Number(opts.query?.max_cursor ?? 0);
    return { aweme_list: [aweme('x' + n)], has_more: 1, max_cursor: n + 1 };
  });

  const res = await douyinAdapter.scrape(PROFILE_URL, { maxPosts: 3 });
  expect(res.posts).toHaveLength(3);
});

const APP = '/api/v1/douyin/app/v3/fetch_user_post_videos';
const WEB = '/api/v1/douyin/web/fetch_user_post_videos';
const http = (code: number) =>
  new ScrapeError('failed', `TikHub returned HTTP ${code}`, 'douyin', PROFILE_URL, true);

/**
 * Answers each posts feed from `feeds` (a list, or a throw), records which
 * feed was asked with which cursor, and serves the profile and stats.
 */
function route(
  feeds: Record<'app' | 'web', (cursor: number) => unknown>,
  profile: unknown = healthyProfile,
) {
  const asked: string[] = [];
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return profile;
    if (opts.path.includes('fetch_multi_video_statistics'))
      return statsFor(opts);
    const cursor = Number(opts.query?.max_cursor ?? 0);
    const feed = opts.path === APP ? 'app' : 'web';
    asked.push(`${feed}@${cursor}`);
    const answer = feeds[feed](cursor);
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return asked;
}

test('asks the app feed first: the one that lists every account', async () => {
  const asked = route({
    app: () => ({ aweme_list: [aweme('a1'), aweme('a2')], has_more: 0 }),
    web: () => http(400),
  });
  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0']);
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['a1', 'a2']);
  expect(res.posts[0].views).toBe(1000);
});

test('falls back to the web feed when the app feed fails (TikHub 400)', async () => {
  const asked = route({
    app: () => http(400),
    web: () => ({ aweme_list: [aweme('w1')], has_more: 0 }),
  });
  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0', 'web@0']);
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['w1']);
});

test("asks the web feed once when the app feed hides an account's posts", async () => {
  // HTTP 200 and an empty list, while the profile counts 40 posts: what the
  // web feed once answered for a brand-new account.
  const asked = route({
    app: () => ({ aweme_list: [], has_more: 0 }),
    web: () => ({ aweme_list: [aweme('w1'), aweme('w2')], has_more: 0 }),
  });
  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0', 'web@0']);
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['w1', 'w2']);
});

test('an empty feed for a profile with no posts costs no extra call', async () => {
  const asked = route(
    {
      app: () => ({ aweme_list: [], has_more: 0 }),
      web: () => ({ aweme_list: [aweme('w1')], has_more: 0 }),
    },
    { user: { ...healthyProfile.user, aweme_count: 0 } },
  );
  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0']);
  expect(res.posts).toEqual([]);
});

test('an empty web feed that stood in for a failed app feed is not asked twice', async () => {
  const asked = route({
    app: () => http(400),
    web: () => ({ aweme_list: [], has_more: 0 }),
  });
  await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0', 'web@0']);
});

test('a failed web call after an empty app feed still keeps the profile snapshot', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    route({
      app: () => ({ aweme_list: [], has_more: 0 }),
      web: () => http(500),
    });
    // Before the web feed was asked, this scrape succeeded with no posts; a
    // failure there must not turn it into a failed scrape.
    const res = await douyinAdapter.scrape(PROFILE_URL);
    expect(res.posts).toEqual([]);
    expect(res.profile.followers).toBe(500);
  } finally {
    warn.mockRestore();
  }
});

test('a private posts tab asks no other feed, and keeps the profile', async () => {
  const asked = route({
    app: () => new ScrapeError('private', 'private', 'douyin', PROFILE_URL),
    web: () => ({ aweme_list: [aweme('w1')], has_more: 0 }),
  });
  const res = await douyinAdapter.scrape(PROFILE_URL);
  expect(asked).toEqual(['app@0']);
  expect(res.posts).toEqual([]);
  expect(res.profile.followers).toBe(500);
});

test('both feeds failing fails the scrape', async () => {
  route({ app: () => http(400), web: () => http(400) });
  await expect(douyinAdapter.scrape(PROFILE_URL)).rejects.toBeInstanceOf(
    ScrapeError,
  );
});

test('deep pages keep asking the feed that served page one (its cursors)', async () => {
  const page = (id: string, more: number, cursor: number) => ({
    aweme_list: [aweme(id)],
    has_more: more,
    max_cursor: cursor,
  });
  // The app feed failed, so the web feed served page one: pages two and
  // three come from the web feed too, never an app page for a web cursor.
  const viaWeb = route({
    app: () => http(400),
    web: (c) => (c === 0 ? page('w1', 1, 100) : c === 100 ? page('w2', 1, 200) : page('w3', 0, 300)),
  });
  const res = await douyinAdapter.scrape(PROFILE_URL, { maxPosts: 10 });
  expect(viaWeb).toEqual(['app@0', 'web@0', 'web@100', 'web@200']);
  expect(res.posts.map((p) => p.external_post_id)).toEqual(['w1', 'w2', 'w3']);

  // The app feed hid the posts and the web feed listed them: the same.
  const rescued = route({
    app: () => ({ aweme_list: [], has_more: 0 }),
    web: (c) => (c === 0 ? page('w1', 1, 100) : page('w2', 0, 200)),
  });
  await douyinAdapter.scrape(PROFILE_URL, { maxPosts: 10 });
  expect(rescued).toEqual(['app@0', 'web@0', 'web@100']);

  // Page one from the app feed: its deeper pages from the app feed.
  const viaApp = route({
    app: (c) => (c === 0 ? page('a1', 1, 100) : page('a2', 0, 200)),
    web: () => http(400),
  });
  await douyinAdapter.scrape(PROFILE_URL, { maxPosts: 10 });
  expect(viaApp).toEqual(['app@0', 'app@100']);
});

test('reports an account its owner deleted as not found', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile'))
      // What Douyin answers for a closed account: an id, and a flag.
      return {
        user: {
          uid: '7657897842565481529',
          user_deleted: true,
          special_state_info: { special_state: 1, title: '账号已经注销' },
        },
      };
    return { aweme_list: [], has_more: 0 };
  });

  await expect(douyinAdapter.scrape(PROFILE_URL)).rejects.toBeInstanceOf(
    ProfileNotFoundError,
  );
});
