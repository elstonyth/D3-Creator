/**
 * Unit tests for the TikTok adapter error-handling fixes (bug hunt 2026-06-01).
 * tikhubGet is mocked, so these run offline and cost no API credits.
 */
import { ProfileNotFoundError, ScrapeError } from '../errors';

jest.mock('../tikhub-client', () => ({ tikhubGet: jest.fn() }));

import { tikhubGet } from '../tikhub-client';
import { tiktokAdapter } from './tiktok';

const mockGet = tikhubGet as unknown as jest.Mock;
const PROFILE_URL = 'https://www.tiktok.com/@khaby.lame';

const healthyProfile = {
  user: {
    uid: '123',
    sec_uid: 'SEC123',
    unique_id: 'khaby.lame',
    follower_count: 1000,
    following_count: 10,
    aweme_count: 50,
    total_favorited: 99999,
  },
};

beforeEach(() => mockGet.mockReset());

test('a not_found error from the posts endpoint does NOT sink a healthy profile', async () => {
  // Profile call is healthy; both the primary posts call and the sec_uid
  // fallback throw not_found. Pre-fix this re-threw and marked the live
  // profile not_found (then permanently excluded by the cron).
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    throw new ProfileNotFoundError('tiktok', PROFILE_URL);
  });

  const res = await tiktokAdapter.scrape(PROFILE_URL);
  expect(res.profile.followers).toBe(1000);
  expect(res.posts).toEqual([]);
});

test('a throttled error on the sec_uid fallback does NOT discard the profile snapshot', async () => {
  // Primary unique_id posts call returns empty -> triggers the sec_uid
  // fallback, which throttles. Pre-fix this re-threw and threw away the good
  // follower data already fetched.
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    if (opts.query?.sec_user_id) {
      throw new ScrapeError('throttled', 'rate limited', 'tiktok', PROFILE_URL);
    }
    return { aweme_list: [] };
  });

  const res = await tiktokAdapter.scrape(PROFILE_URL);
  expect(res.profile.followers).toBe(1000);
  expect(res.posts).toEqual([]);
});

test('a null entry in a cover url_list does not crash the scrape', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    return {
      aweme_list: [
        {
          aweme_id: 'a1',
          desc: 'hi',
          create_time: 1716800000,
          statistics: { play_count: 5, digg_count: 2, comment_count: 1, share_count: 0 },
          video: { cover: { url_list: [null, 'https://v.tiktokcdn.com/cover.jpeg'] } },
        },
      ],
    };
  });

  const res = await tiktokAdapter.scrape(PROFILE_URL);
  expect(res.posts).toHaveLength(1);
  expect(res.posts[0].media_url).toBe('https://v.tiktokcdn.com/cover.jpeg');
});

test('sanity: a healthy profile with posts still maps correctly', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('handler_user_profile')) return healthyProfile;
    return {
      aweme_list: [
        {
          aweme_id: 'a1',
          create_time: 1716800000,
          statistics: { play_count: 100 },
          video: { cover: { url_list: ['https://v.tiktokcdn.com/a.jpeg'] } },
        },
      ],
    };
  });

  const res = await tiktokAdapter.scrape(PROFILE_URL);
  expect(res.profile.followers).toBe(1000);
  expect(res.posts).toHaveLength(1);
  expect(res.posts[0].external_post_id).toBe('a1');
});
