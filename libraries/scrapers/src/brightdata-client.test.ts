/**
 * Unit tests for the Bright Data budget/deadline path and status mapping.
 * global.fetch is mocked, so these run offline and cost no API credits.
 *
 * Why this exists: brightdata-client.ts owns the timeout/deadline logic that
 * decides whether a Facebook scrape (Bright Data, ~20x TikHub's per-call
 * cost) produces a stored snapshot or a `failed` status. Its history is a
 * list of budget bugs that were only ever verified by running against
 * production: a flat 120s cap once falsely failed every Facebook scrape
 * (PR #38/#39); a cleared-too-early per-request timer once let a slow
 * response body defeat the timeout; an 18+ age-gated page once hung the
 * collector to the full budget. This suite pins the trigger -> poll -> fetch
 * flow, the message-based status mapping, and the budget-exhaustion /
 * deadline-scope behavior, so the next change to this logic fails a test
 * instead of a production cron tick.
 */
import { runDataset } from './brightdata-client';
import { ProfileNotFoundError, ScrapeError } from './errors';

const OPTS = {
  datasetId: 'gd_test',
  inputs: [{ url: 'https://www.facebook.com/example' }],
  platform: 'facebook',
  profileUrl: 'https://www.facebook.com/example',
  pollIntervalMs: 1,
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
  process.env.BRIGHTDATA_API_KEY = 'test-key';
});

afterEach(() => {
  // No-op when a test never switched to fake timers; restores real timers
  // for the tests in this file that did (see the budget-path section below).
  jest.useRealTimers();
});

// --- Happy path and status mapping ----------------------------------------

test('ready on the first poll returns the snapshot rows', async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'ready' }))
    .mockResolvedValueOnce(httpResponse(200, [{ a: 1 }]));

  await expect(runDataset(OPTS)).resolves.toEqual([{ a: 1 }]);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});

test('polls through running/collecting/building states before ready', async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'running' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'collecting' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'building' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'ready' }))
    .mockResolvedValueOnce(httpResponse(200, [{ a: 1 }]));

  await expect(runDataset(OPTS)).resolves.toEqual([{ a: 1 }]);
  expect(mockFetch).toHaveBeenCalledTimes(6);
});

test("failed with a private-sounding message maps to ScrapeError('private')", async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(
      httpResponse(200, { status: 'failed', message: 'Page is private' }),
    );

  const err = (await runDataset(OPTS).catch((e) => e)) as ScrapeError;
  expect(err).toBeInstanceOf(ScrapeError);
  expect(err.status).toBe('private');
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test('failed with a not-found message maps to ProfileNotFoundError', async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(
      httpResponse(200, {
        status: 'failed',
        message: 'Profile does not exist',
      }),
    );

  await expect(runDataset(OPTS)).rejects.toBeInstanceOf(ProfileNotFoundError);
});

test("failed with an unclassified message maps to ScrapeError('failed')", async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(
      httpResponse(200, { status: 'failed', message: 'collector crashed' }),
    );

  const err = (await runDataset(OPTS).catch((e) => e)) as ScrapeError;
  expect(err).toBeInstanceOf(ScrapeError);
  expect(err.status).toBe('failed');
});

test("a missing failure message defaults to 'collector failed'", async () => {
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'failed' }));

  await expect(runDataset(OPTS)).rejects.toThrow(/collector failed/);
});

test('missing BRIGHTDATA_API_KEY throws before any fetch', async () => {
  delete process.env.BRIGHTDATA_API_KEY;

  await expect(runDataset(OPTS)).rejects.toThrow(/BRIGHTDATA_API_KEY/);
  expect(mockFetch).toHaveBeenCalledTimes(0);
});

// --- The budget path -------------------------------------------------------
//
// Fake timers so no test here actually waits out a real budget. Modern fake
// timers also fake Date.now(), which pollProgress's `while (Date.now() <
// deadline)` loop depends on.

test("exhausting the budget throws ScrapeError('failed') with the budget in the message", async () => {
  jest.useFakeTimers({ doNotFake: ['performance'] });

  const timeoutMs = 20;
  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValue(httpResponse(200, { status: 'running' }));

  const resultPromise = runDataset({ ...OPTS, timeoutMs, pollIntervalMs: 5 });
  // Avoid an unhandled-rejection warning while timers advance below, ahead
  // of the real assertion against the same promise.
  resultPromise.catch(() => {});

  await jest.advanceTimersByTimeAsync(timeoutMs + 100);

  const err = (await resultPromise.catch((e) => e)) as ScrapeError;
  expect(err).toBeInstanceOf(ScrapeError);
  expect(err.status).toBe('failed');
  expect(err.message).toMatch(/did not become ready within the \d+ms budget/);
});

test('characterization: the budget bounds trigger+poll only — the snapshot fetch is not deadline-aware', async () => {
  // This pins CURRENT behavior; it is not an endorsement. A naive version of
  // this test — advance fake timers past the deadline, then resolve a held
  // json() promise with no wiring to the abort signal — would pass even
  // against a REALISTIC deadline-aware rewrite: this file's own
  // PER_REQUEST_TIMEOUT_MS pattern shows the natural fix is to arm the
  // snapshot fetch's AbortController off the REMAINING budget
  // (deadline - Date.now()) rather than a flat 30s, and an abort that fires
  // with nothing listening for it is silently swallowed by a bare
  // `json: () => heldPromise` mock — proving nothing (verified against a
  // throwaway mutated copy of this client during development: that shape
  // resolved fine even with the mutation in place).
  //
  // To actually discriminate, the mock must mirror how a real Response ties
  // its body read to the abort signal (documented in this file's
  // brightdataFetchJson comment): it captures the signal passed to fetch()
  // and rejects json() if that signal aborts before the body is supplied.
  // timeoutMs is kept well under the fixed 30s PER_REQUEST_TIMEOUT_MS so
  // advancing past the deadline here does NOT also trip that unrelated
  // timer — isolating the assertion to deadline behavior specifically. Only
  // in this shape does a deadline-aware fetchSnapshot fail this test, which
  // is exactly the alarm it exists to be. If fetchSnapshot is deliberately
  // made deadline-aware, rewrite this test; do not delete it.
  jest.useFakeTimers({ doNotFake: ['performance'] });

  const timeoutMs = 5_000;
  let resolveSnapshotJson!: (rows: unknown) => void;

  mockFetch
    .mockResolvedValueOnce(httpResponse(200, { snapshot_id: 's_1' }))
    .mockResolvedValueOnce(httpResponse(200, { status: 'ready' }))
    .mockImplementationOnce(
      (_url: string, init?: { signal?: AbortSignal }) => {
        const signal = init?.signal;
        const json = new Promise((resolve, reject) => {
          resolveSnapshotJson = resolve;
          signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
        return Promise.resolve({ ok: true, status: 200, json: () => json });
      },
    );

  const resultPromise = runDataset({ ...OPTS, timeoutMs });

  // pollProgress already returned after the first ('ready') poll, so nothing
  // but the held snapshot body stands between here and runDataset resolving.
  // Advance well past the deadline (5s) but well under the fixed 30s
  // PER_REQUEST_TIMEOUT_MS, then supply the body.
  await jest.advanceTimersByTimeAsync(timeoutMs + 10_000);

  // The discriminating moment: the deadline computed at the start of
  // runDataset has already elapsed by the time the snapshot body arrives,
  // and current code's per-request abort (flat 30s) has NOT fired yet.
  resolveSnapshotJson([{ a: 1 }]);

  await expect(resultPromise).resolves.toEqual([{ a: 1 }]);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});

test('a non-JSON 2xx trigger body maps to ScrapeError, not a raw SyntaxError', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  } as unknown as Response);

  await expect(runDataset(OPTS)).rejects.toBeInstanceOf(ScrapeError);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('a trigger response with no snapshot_id throws ScrapeError', async () => {
  mockFetch.mockResolvedValueOnce(httpResponse(200, {}));

  await expect(runDataset(OPTS)).rejects.toBeInstanceOf(ScrapeError);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
