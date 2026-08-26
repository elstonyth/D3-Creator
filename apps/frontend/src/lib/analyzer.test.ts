/**
 * PRD 3 §5.9.3 and PRD 1 §8.8.13. The rules under test are the ones a builder
 * is most likely to "helpfully" soften: a failed read is a THROW, never an empty
 * array; an unrecognised body is a failed read, never zero rows; and the three
 * URL fields are same-origin before anything leaves the server.
 */

import type { AnalyzerJob, AnalyzerJobSummary } from '@d3/analyzer';

import { getJob, listJobs, toBrowserJob } from './analyzer';

const USER = '11111111-2222-4333-8444-555555555555';
const JOB_A = '3f2b6c40-9c7e-4a2f-8f1d-5b0a7c9e1d22';
const JOB_B = '8f6c1f0e-3a4b-4d21-9c77-2b5a0e91d4c3';

function summary(
  id: string,
  overrides: Partial<AnalyzerJobSummary> = {},
): AnalyzerJobSummary {
  return {
    id,
    status: 'done',
    step: null,
    error: null,
    report_language: 'en',
    filename: 'hook-test-3.mp4',
    duration_seconds: 47,
    source_bytes: 184320115,
    compressed_bytes: 12204388,
    created_at: '2026-08-19T02:30:00.000Z',
    started_at: '2026-08-19T02:30:04.000Z',
    finished_at: '2026-08-19T02:33:11.000Z',
    video_url: `http://127.0.0.1:4310/media/${id}/compressed.mp4`,
    thumbnail_url: `http://127.0.0.1:4310/media/${id}/thumbnail.jpg`,
    report_url: `http://127.0.0.1:4310/media/${id}/report.txt`,
    overall_score: 7.8,
    ...overrides,
  };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.ANALYZER_SERVICE_URL = 'http://127.0.0.1:4310';
  process.env.ANALYZER_SERVICE_TOKEN = '';
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function reply(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('toBrowserJob', () => {
  it('rewrites all three URL fields to same-origin Next paths', () => {
    const row = toBrowserJob(summary(JOB_A));
    expect(row.video_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/video`);
    expect(row.thumbnail_url).toBe(
      `/api/studio/analyzer/jobs/${JOB_A}/thumbnail`,
    );
    expect(row.report_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/report`);
  });

  it('null stays null — a running job earns its URLs one at a time', () => {
    const row = toBrowserJob(
      summary(JOB_A, {
        status: 'running',
        thumbnail_url: null,
        report_url: null,
        overall_score: null,
      }),
    );
    expect(row.video_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/video`);
    expect(row.thumbnail_url).toBeNull();
    expect(row.report_url).toBeNull();
  });

  it('changes nothing else', () => {
    const before = summary(JOB_A);
    const after = toBrowserJob(before);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect({
      ...after,
      video_url: before.video_url,
      thumbnail_url: before.thumbnail_url,
      report_url: before.report_url,
    }).toEqual(before);
  });
});

describe('listJobs (§8.8.13)', () => {
  it('sends both headers, no-store, and the limit=50 query', async () => {
    fetchMock.mockImplementation(() => reply([]));
    await listJobs(USER);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4310/api/results?limit=50');
    expect(init.headers).toEqual({
      authorization: 'Bearer ',
      'x-d3-user-id': USER,
    });
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('strips trailing slashes from the base URL', async () => {
    process.env.ANALYZER_SERVICE_URL = 'http://127.0.0.1:4310///';
    fetchMock.mockImplementation(() => reply([]));
    await listJobs(USER);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:4310/api/results?limit=50',
    );
  });

  it('THROWS when ANALYZER_SERVICE_URL is unset — that branch must stay reachable', async () => {
    delete process.env.ANALYZER_SERVICE_URL;
    await expect(listJobs(USER)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('THROWS on any non-2xx — never an empty array', async () => {
    for (const status of [401, 404, 500, 503]) {
      fetchMock.mockImplementation(() => reply({ ok: false }, status));
      await expect(listJobs(USER)).rejects.toThrow();
    }
  });

  it('THROWS on a body that does not parse', async () => {
    fetchMock.mockImplementation(() => reply('<html>nope</html>'));
    await expect(listJobs(USER)).rejects.toThrow();
  });

  it('THROWS when the parsed body is not an array — never zero rows', async () => {
    fetchMock.mockImplementation(() => reply({ jobs: [summary(JOB_A)] }));
    await expect(listJobs(USER)).rejects.toThrow();
  });

  it('resolves [] only when the worker genuinely returned an empty array', async () => {
    fetchMock.mockImplementation(() => reply([]));
    await expect(listJobs(USER)).resolves.toEqual([]);
  });

  it('drops a malformed element without failing the whole read', async () => {
    fetchMock.mockImplementation(() =>
      reply([
        summary(JOB_A),
        { id: 'not-a-uuid', status: 'done' },
        null,
        { ...summary(JOB_B), status: 'timed_out' },
        { ...summary(JOB_B), overall_score: 'high' },
      ]),
    );
    const rows = await listJobs(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(JOB_A);
  });

  it('re-sorts newest-first locally rather than trusting upstream order', async () => {
    fetchMock.mockImplementation(() =>
      reply([
        summary(JOB_A, { created_at: '2026-08-01T00:00:00.000Z' }),
        summary(JOB_B, { created_at: '2026-08-19T00:00:00.000Z' }),
      ]),
    );
    const rows = await listJobs(USER);
    expect(rows.map((r) => r.id)).toEqual([JOB_B, JOB_A]);
  });

  it('caps at 50 rows', async () => {
    fetchMock.mockImplementation(() =>
      reply(
        Array.from({ length: 80 }, (_v, i) =>
          summary(JOB_A, {
            created_at: `2026-08-19T00:${String(i).padStart(2, '0')}:00.000Z`,
          }),
        ),
      ),
    );
    await expect(listJobs(USER)).resolves.toHaveLength(50);
  });

  it('returns rows whose URL fields are already same-origin', async () => {
    fetchMock.mockImplementation(() => reply([summary(JOB_A)]));
    const [row] = await listJobs(USER);
    expect(row.video_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/video`);
    expect(row.thumbnail_url?.startsWith('/api/')).toBe(true);
  });

  it('accepts no camelCase alias', async () => {
    fetchMock.mockImplementation(() =>
      reply([
        {
          ...summary(JOB_A),
          created_at: undefined,
          createdAt: '2026-08-19T02:30:00.000Z',
        },
      ]),
    );
    await expect(listJobs(USER)).resolves.toEqual([]);
  });
});

describe('getJob (§8.8.13)', () => {
  function job(overrides: Partial<AnalyzerJob> = {}): AnalyzerJob {
    const { overall_score: _dropped, ...base } = summary(JOB_A);
    return { ...base, result: null, ...overrides } as AnalyzerJob;
  }

  it('resolves null on a 404 so the [id] page can call notFound()', async () => {
    fetchMock.mockImplementation(() =>
      reply({ ok: false, error: 'job not found' }, 404),
    );
    await expect(getJob(USER, JOB_A)).resolves.toBeNull();
  });

  it('THROWS on every other failure', async () => {
    for (const status of [400, 401, 500, 504]) {
      fetchMock.mockImplementation(() => reply({ ok: false }, status));
      await expect(getJob(USER, JOB_A)).rejects.toThrow();
    }
  });

  it('returns the document with its three URL fields rewritten', async () => {
    fetchMock.mockImplementation(() => reply(job()));
    const result = await getJob(USER, JOB_A);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://127.0.0.1:4310/api/result/${JOB_A}`,
    );
    expect(result?.report_url).toBe(
      `/api/studio/analyzer/jobs/${JOB_A}/report`,
    );
    expect(result?.result).toBeNull();
  });

  it('does not validate the id — the caller does, before the call', async () => {
    fetchMock.mockImplementation(() =>
      reply({ ok: false, error: 'invalid job id' }, 400),
    );
    await expect(getJob(USER, 'not-a-uuid')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalled();
  });
});
