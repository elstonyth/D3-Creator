/**
 * Unit tests for tikhubGet's transient-failure retry (added 2026-07-06).
 * global.fetch is mocked, so these run offline and cost no API credits.
 *
 * Why this exists: TikHub calls have no per-request retry, so one flaky
 * 400/5xx failed a profile's whole scrape, and the cron's one-attempt-per-
 * UTC-day rule then froze it stale for the rest of the day.
 */
import { tikhubGet } from './tikhub-client';
import { ProfileNotFoundError, ScrapeError } from './errors';

const OPTS = {
  path: '/api/v1/instagram/v1/fetch_user_info_by_username',
  query: { username: 'nasa' },
  platform: 'instagram',
  profileUrl: 'https://www.instagram.com/nasa',
};

function httpResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.TIKHUB_API_KEY = 'test-key';
});

test('retries a transient 500 and returns the payload from the second attempt', async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(500))
    .mockResolvedValueOnce(httpResponse(200, { code: 200, data: { user: 1 } }));

  await expect(tikhubGet(OPTS)).resolves.toEqual({ user: 1 });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test('retries the TikHub generic 400 flake', async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(400))
    .mockResolvedValueOnce(
      httpResponse(200, { code: 200, data: { ok: true } }),
    );

  await expect(tikhubGet(OPTS)).resolves.toEqual({ ok: true });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test('does NOT retry a 404 — not_found must surface on the first attempt', async () => {
  mockFetch.mockResolvedValue(httpResponse(404));

  await expect(tikhubGet(OPTS)).rejects.toBeInstanceOf(ProfileNotFoundError);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('does NOT retry auth rejection', async () => {
  mockFetch.mockResolvedValue(httpResponse(401));

  await expect(tikhubGet(OPTS)).rejects.toThrow(/auth rejected/);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('gives up after 3 attempts on a persistent failure', async () => {
  mockFetch.mockResolvedValue(httpResponse(502));

  const err = await tikhubGet(OPTS).catch((e) => e);
  expect(err).toBeInstanceOf(ScrapeError);
  expect((err as ScrapeError).status).toBe('failed');
  expect(mockFetch).toHaveBeenCalledTimes(3);
});
