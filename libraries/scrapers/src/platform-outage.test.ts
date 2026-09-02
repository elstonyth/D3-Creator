/**
 * Whole-platform outage detection.
 *
 * Why this exists: on 2026-08-22 the Bright Data token stopped authenticating.
 * Every Facebook scrape 401'd, all 32 Facebook profiles were stamped `failed`
 * once a day, and it stayed invisible for twelve days — because from the cron
 * loop's point of view a dead credential is indistinguishable from 32 unrelated
 * broken profiles.
 *
 * `ScrapeError.scope` is what makes them distinguishable. These tests pin the
 * two properties the cron depends on:
 *
 *   1. Account-level rejections (401/403/402) are scope 'platform'.
 *   2. Everything else stays scope 'profile', so nothing becomes loud by
 *      accident and a genuinely broken profile is still stamped.
 *
 * global.fetch is mocked, so this runs offline and costs no API credits.
 */
import { runDataset } from './brightdata-client';
import { tikhubGet } from './tikhub-client';
import { ProfileNotFoundError, ScrapeError, isPlatformOutage } from './errors';

const BD_OPTS = {
  datasetId: 'gd_test',
  inputs: [{ url: 'https://www.facebook.com/example' }],
  platform: 'facebook',
  profileUrl: 'https://www.facebook.com/example',
  pollIntervalMs: 1,
};

const TH_OPTS = {
  path: '/api/v1/douyin/app/v3/handler_user_profile',
  query: { sec_user_id: 'abc' },
  platform: 'douyin',
  profileUrl: 'https://www.douyin.com/user/abc',
};

function httpResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body ?? {}),
    json: async () => body,
  } as unknown as Response;
}

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.BRIGHTDATA_API_KEY = 'test-key';
  process.env.TIKHUB_API_KEY = 'test-key';
});

// --- Bright Data (Facebook) ------------------------------------------------

describe('Bright Data account-level rejections', () => {
  // 401 is the exact failure of 2026-08-22: "Token expired".
  test.each([401, 403, 402])(
    'HTTP %i is a platform outage, not a profile failure',
    async (status) => {
      mockFetch.mockResolvedValueOnce(httpResponse(status));

      const err = await runDataset(BD_OPTS).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ScrapeError);
      expect((err as ScrapeError).scope).toBe('platform');
      expect(isPlatformOutage(err)).toBe(true);
      // Non-retryable: hammering a dead credential just bills us.
      expect((err as ScrapeError).retryable).toBe(false);
    },
  );

  test('the message names the env var an operator has to change', async () => {
    mockFetch.mockResolvedValueOnce(httpResponse(401));

    const err = (await runDataset(BD_OPTS).catch((e) => e)) as ScrapeError;

    expect(err.message).toContain('BRIGHTDATA_API_KEY');
  });
});

// --- TikHub (Instagram / TikTok / Douyin / RedNote) ------------------------

describe('TikHub account-level rejections', () => {
  // 402 is the 22-day credit exhaustion of 2026-07, which took down four
  // platforms at once.
  test.each([401, 403, 402])(
    'HTTP %i is a platform outage, not a profile failure',
    async (status) => {
      mockFetch.mockResolvedValueOnce(httpResponse(status));

      const err = await tikhubGet(TH_OPTS).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ScrapeError);
      expect((err as ScrapeError).scope).toBe('platform');
      expect(isPlatformOutage(err)).toBe(true);
    },
  );
});

// --- The other half: ordinary failures must stay quiet --------------------

describe('per-profile failures are NOT platform outages', () => {
  test('TikHub 404 is a missing profile', async () => {
    mockFetch.mockResolvedValueOnce(httpResponse(404));

    const err = await tikhubGet(TH_OPTS).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProfileNotFoundError);
    expect(isPlatformOutage(err)).toBe(false);
  });

  test('TikHub 429 is throttling, which is per-request', async () => {
    mockFetch.mockResolvedValueOnce(httpResponse(429));

    const err = (await tikhubGet(TH_OPTS).catch((e) => e)) as ScrapeError;

    expect(err.status).toBe('throttled');
    expect(isPlatformOutage(err)).toBe(false);
  });

  // 5xx is retryable, so tikhubGet burns its two backoff sleeps (250ms + 750ms)
  // before giving up. Real timers would make this the slowest test in the repo
  // for no benefit.
  test('TikHub 500 is a transient upstream failure, retried then given up on', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValue(httpResponse(500));

    const pending = tikhubGet(TH_OPTS).catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const err = await pending;

    expect(isPlatformOutage(err)).toBe(false);
    expect((err as ScrapeError).retryable).toBe(true);
    // One initial attempt plus one per backoff entry.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  test('a plain Error is never a platform outage', () => {
    expect(isPlatformOutage(new Error('socket hang up'))).toBe(false);
    expect(isPlatformOutage(null)).toBe(false);
    expect(isPlatformOutage(undefined)).toBe(false);
  });

  test('ScrapeError defaults to profile scope', () => {
    const err = new ScrapeError(
      'failed',
      'something went wrong',
      'facebook',
      'https://www.facebook.com/example',
    );

    expect(err.scope).toBe('profile');
    expect(isPlatformOutage(err)).toBe(false);
  });
});
