import * as Sentry from '@sentry/nextjs';

import {
  listScrapeableProfiles,
  persistMediaForPosts,
  setProfileStatus,
  upsertPostSnapshots,
  upsertProfileSnapshot,
  type ProfileRow,
} from '@d3/database';
import { runScraper, ScrapeError } from '@d3/scrapers';

import { GET } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('@d3/database', () => ({
  listScrapeableProfiles: jest.fn(),
  persistMediaForPosts: jest.fn(),
  POST_MEDIA_DEADLINE_MS: 10_000,
  requeueFacebookForFreshPost: jest.fn(),
  setProfileStatus: jest.fn(),
  upsertPostSnapshots: jest.fn(),
  upsertProfileSnapshot: jest.fn(),
}));
jest.mock(
  '@d3/scrapers',
  () => ({
    ...jest.requireActual('../../../../../../../libraries/scrapers/src/errors'),
    runScraper: jest.fn(),
  }),
  { virtual: true },
);

const NOW = new Date('2026-09-08T00:00:00.000Z');
const originalCronSecret = process.env.CRON_SECRET;
let roster: ProfileRow[];

function profile(id: string, platform: ProfileRow['platform']): ProfileRow {
  return {
    id,
    creator_id: id,
    platform,
    profile_url: `https://example.com/${id}`,
    handle: id,
    display_name: null,
    nickname: null,
    scrape_status: 'ok',
    last_scraped_at: '2026-09-06T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

const scrapeResult = {
  profile: {
    followers: 10,
    following: null,
    total_posts: null,
    total_likes: null,
    total_views: null,
    raw: {},
  },
  posts: [],
};

async function tick() {
  const response = await GET(
    new Request('http://localhost/api/cron/daily-snapshot', {
      headers: { authorization: 'Bearer offline-test-secret' },
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.CRON_SECRET = 'offline-test-secret';
  roster = [];
  jest.mocked(listScrapeableProfiles).mockImplementation(async () => roster);
  jest.mocked(runScraper).mockReset().mockResolvedValue(scrapeResult);
  jest.mocked(upsertProfileSnapshot).mockResolvedValue({ written: 1 });
  jest.mocked(persistMediaForPosts).mockImplementation(async (_id, posts) => posts);
  jest.mocked(upsertPostSnapshots).mockResolvedValue({ written: 0 });
  jest.mocked(setProfileStatus).mockImplementation(async (id, status) => {
    const row = roster.find((p) => p.id === id)!;
    row.scrape_status = status;
    row.last_scraped_at = new Date().toISOString();
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

test('an outage fills no more than one attempt slot and healthy profiles advance across ticks', async () => {
  const facebook = Array.from({ length: 5 }, (_, i) => profile(`fb${i}`, 'facebook'));
  const instagram = Array.from({ length: 6 }, (_, i) => profile(`ig${i}`, 'instagram'));
  roster = [...facebook, ...instagram];
  jest.mocked(runScraper).mockImplementation(async (platform, url) => {
    if (platform === 'facebook') {
      throw new ScrapeError('failed', 'credential rejected', platform, url, false, 'platform');
    }
    return scrapeResult;
  });

  const first = await tick();

  expect(runScraper).toHaveBeenCalledTimes(5);
  expect(first.processed).toBe(5);
  expect(first.by_status).toEqual({
    platform_outage: 1,
    skipped_platform_outage: 4,
    ok: 4,
  });
  expect(first.skipped).toBe(6);
  expect(first.deferred).toBe(0);
  expect(first.platform_outages).toEqual({ facebook: '[facebook] credential rejected' });
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(Sentry.captureException).toHaveBeenCalledWith(
    expect.any(ScrapeError),
    expect.objectContaining({ level: 'fatal', fingerprint: ['scraper-platform-outage', 'facebook'] }),
  );

  jest.setSystemTime(new Date(NOW.getTime() + 60 * 60 * 1000));
  const second = await tick();

  expect(second.processed).toBe(3);
  expect(second.by_status.ok).toBe(2);
  expect(runScraper).toHaveBeenCalledTimes(8);
  expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  expect(setProfileStatus).toHaveBeenCalledTimes(6);
  expect(jest.mocked(setProfileStatus).mock.calls.map(([id]) => id)).toEqual(
    instagram.map((p) => p.id),
  );
  for (const row of facebook) {
    expect(row.scrape_status).toBe('ok');
    expect(row.last_scraped_at).toBe('2026-09-06T00:00:00.000Z');
  }
});

test('healthy profiles keep the oldest-five priority and the five-attempt cap', async () => {
  roster = [
    profile('ig0', 'instagram'),
    profile('fb0', 'facebook'),
    profile('ig1', 'instagram'),
    profile('ig2', 'instagram'),
    profile('ig3', 'instagram'),
    profile('fb1', 'facebook'),
  ];

  const summary = await tick();

  expect(jest.mocked(runScraper).mock.calls.map(([, url]) => url)).toEqual(
    ['fb0', 'ig0', 'ig1', 'ig2', 'ig3'].map((id) => `https://example.com/${id}`),
  );
  expect(summary).toMatchObject({ processed: 5, skipped: 1, deferred: 0 });
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('ordinary profile failures still consume an attempt and receive a status stamp', async () => {
  roster = Array.from({ length: 6 }, (_, i) => profile(`ig${i}`, 'instagram'));
  jest.mocked(runScraper).mockRejectedValue(
    new ScrapeError('not_found', 'profile missing', 'instagram', roster[0].profile_url),
  );

  const summary = await tick();

  expect(runScraper).toHaveBeenCalledTimes(5);
  expect(setProfileStatus).toHaveBeenCalledTimes(5);
  expect(summary).toMatchObject({ processed: 5, skipped: 1, by_status: { not_found: 5 } });
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('Facebook floor deferrals leave capacity for later healthy profiles', async () => {
  roster = [
    ...Array.from({ length: 5 }, (_, i) => profile(`fb${i}`, 'facebook')),
    profile('ig0', 'instagram'),
  ];
  jest.mocked(runScraper).mockImplementation(async () => {
    jest.setSystemTime(new Date(Date.now() + 40_000));
    return scrapeResult;
  });

  const summary = await tick();

  expect(jest.mocked(runScraper).mock.calls.map(([platform]) => platform)).toEqual([
    'facebook', 'instagram',
  ]);
  expect(summary).toMatchObject({ processed: 2, skipped: 0, deferred: 4 });
  expect(setProfileStatus).toHaveBeenCalledTimes(2);
});

test('replacement candidates stop when the remaining function budget is below the floor', async () => {
  roster = [
    ...Array.from({ length: 5 }, (_, i) => profile(`fb${i}`, 'facebook')),
    ...Array.from({ length: 6 }, (_, i) => profile(`ig${i}`, 'instagram')),
  ];
  jest.mocked(runScraper).mockImplementation(async (platform, url) => {
    if (platform === 'facebook') {
      throw new ScrapeError('failed', 'credential rejected', platform, url, false, 'platform');
    }
    jest.setSystemTime(new Date(Date.now() + 90_000));
    return scrapeResult;
  });

  const summary = await tick();

  expect(runScraper).toHaveBeenCalledTimes(3);
  expect(summary).toMatchObject({ processed: 3, skipped: 4, deferred: 4, elapsed_ms: 180_000 });
  expect(setProfileStatus).toHaveBeenCalledTimes(2);
});
