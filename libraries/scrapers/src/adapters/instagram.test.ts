/**
 * Unit tests for the Instagram adapter timestamp fix (bug hunt 2026-06-01).
 * tikhubGet is mocked, so these run offline and cost no API credits.
 */
jest.mock('../tikhub-client', () => ({ tikhubGet: jest.fn() }));

import { tikhubGet } from '../tikhub-client';
import { instagramAdapter } from './instagram';

const mockGet = tikhubGet as unknown as jest.Mock;
const PROFILE_URL = 'https://www.instagram.com/nasa';
const healthyProfile = {
  user: { username: 'nasa', pk: '1', follower_count: 100, following_count: 1, media_count: 10 },
};

function postsWith(item: any) {
  return { data: { items: [item] } };
}

beforeEach(() => mockGet.mockReset());

test('a numeric-string taken_at is coerced to ISO instead of breaking the post write', async () => {
  // Pre-fix the raw string "1716800000" was passed straight to a timestamptz
  // column, throwing and failing the whole post batch.
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('get_user_profile')) return healthyProfile;
    return postsWith({ pk: 'p1', code: 'abc', like_count: 1, taken_at: '1716800000' });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts).toHaveLength(1);
  expect(res.posts[0].posted_at).toBe(new Date(1716800000 * 1000).toISOString());
});

test('a numeric taken_at still works (no regression)', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('get_user_profile')) return healthyProfile;
    return postsWith({ pk: 'p2', code: 'def', like_count: 1, taken_at: 1716800000 });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].posted_at).toBe(new Date(1716800000 * 1000).toISOString());
});

test('a real ISO date string passes through unchanged', async () => {
  mockGet.mockImplementation(async (opts: any) => {
    if (opts.path.includes('get_user_profile')) return healthyProfile;
    return postsWith({ pk: 'p3', code: 'ghi', like_count: 1, taken_at: '2024-05-27T10:00:00.000Z' });
  });

  const res = await instagramAdapter.scrape(PROFILE_URL);
  expect(res.posts[0].posted_at).toBe('2024-05-27T10:00:00.000Z');
});
