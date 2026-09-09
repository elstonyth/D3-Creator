/**
 * lib/analyzer.ts — the two reads and the URL rewrite (PRD 1 §8.8.13), phase 2.
 * The store is mocked at its module boundary; the projections are the real
 * ones, so the browser-facing shape is asserted end to end.
 */

import type { AnalyzerJob } from '@d3/analyzer';

jest.mock('./analyzer-store', () => {
  const actual = jest.requireActual('./analyzer-store');
  return { ...actual, listRows: jest.fn(), readJob: jest.fn() };
});

import { getJob, listJobs, toBrowserJob } from './analyzer';
import {
  STALE_AFTER_MS,
  listRows,
  readJob,
  toPublicJob,
  type JobRow,
} from './analyzer-store';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const JOB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function row(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: JOB_A,
    user_id: USER,
    status: 'done',
    step: null,
    error: null,
    report_language: 'en',
    filename: 'clip.mp4',
    duration_seconds: 12.3,
    source_bytes: 1000,
    compressed_bytes: 500,
    source_ext: '.mp4',
    has_audio: true,
    business_profile: null,
    video_path: `${JOB_A}/compressed.mp4`,
    thumbnail_path: `${JOB_A}/thumbnail.jpg`,
    report_path: `${JOB_A}/report.txt`,
    result: null,
    // PostgREST's spelling, not the contract's.
    created_at: '2026-09-09 08:00:00.123456+00',
    started_at: null,
    finished_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const listRowsMock = listRows as jest.Mock;
const readJobMock = readJob as jest.Mock;

beforeEach(() => {
  listRowsMock.mockReset();
  readJobMock.mockReset();
});

describe('toBrowserJob', () => {
  const job = toPublicJob(row());

  it('pins all three URL fields to same-origin Next paths', () => {
    const out = toBrowserJob({
      ...job,
      video_url: 'https://elsewhere.example/v.mp4',
      thumbnail_url: 'https://elsewhere.example/t.jpg',
      report_url: 'https://elsewhere.example/r.txt',
    });
    expect(out.video_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/video`);
    expect(out.thumbnail_url).toBe(
      `/api/studio/analyzer/jobs/${JOB_A}/thumbnail`,
    );
    expect(out.report_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/report`);
  });

  it('null stays null — a running job earns its URLs one at a time', () => {
    const out = toBrowserJob({
      ...job,
      video_url: null,
      thumbnail_url: null,
      report_url: null,
    });
    expect(out.video_url).toBeNull();
    expect(out.thumbnail_url).toBeNull();
    expect(out.report_url).toBeNull();
  });
});

describe('toPublicJob (the store projection)', () => {
  it('emits the same-origin paths and the contract’s ISO-Z timestamps', () => {
    const job = toPublicJob(row());
    expect(job.created_at).toBe('2026-09-09T08:00:00.123Z');
    expect(job.video_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/video`);
    expect(job).not.toHaveProperty('user_id');
    expect(job).not.toHaveProperty('video_path');
  });

  it('a running row nobody has touched since the budget is failed/interrupted', () => {
    const stale = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    const job = toPublicJob(
      row({ status: 'running', step: 'analyzing', updated_at: stale }),
    );
    expect(job.status).toBe('failed');
    expect(job.step).toBeNull();
    expect(job.error?.code).toBe('interrupted');
  });

  it('a running row inside the budget is still running', () => {
    const job = toPublicJob(row({ status: 'running', step: 'analyzing' }));
    expect(job.status).toBe('running');
    expect(job.step).toBe('analyzing');
  });
});

describe('listJobs', () => {
  it('THROWS when the store read fails — never an empty array', async () => {
    listRowsMock.mockRejectedValue(new Error('canceling statement'));
    await expect(listJobs(USER)).rejects.toThrow('canceling statement');
  });

  it('resolves [] only when the table genuinely has no rows', async () => {
    listRowsMock.mockResolvedValue([]);
    await expect(listJobs(USER)).resolves.toEqual([]);
  });

  it('returns summaries with overall_score hoisted and no result key', async () => {
    listRowsMock.mockResolvedValue([
      row({
        id: JOB_B,
        result: { overall_score: 7.5 } as unknown as AnalyzerJob['result'],
      }),
      row({ status: 'failed', error: { code: 'timeout', message: 'x' } }),
    ]);
    const out = await listJobs(USER);
    expect(listRowsMock).toHaveBeenCalledWith(USER, 50);
    expect(out.map((j) => j.id)).toEqual([JOB_B, JOB_A]);
    expect(out[0].overall_score).toBe(7.5);
    expect(out[1].overall_score).toBeNull();
    expect(out[0]).not.toHaveProperty('result');
    expect(out[0].video_url).toBe(`/api/studio/analyzer/jobs/${JOB_B}/video`);
  });
});

describe('getJob (§8.8.5)', () => {
  it('resolves null when there is no such row', async () => {
    readJobMock.mockResolvedValue(null);
    await expect(getJob(USER, JOB_A)).resolves.toBeNull();
  });

  it('resolves null for another user’s row — never a 403 shape', async () => {
    readJobMock.mockResolvedValue(row({ user_id: OTHER }));
    await expect(getJob(USER, JOB_A)).resolves.toBeNull();
  });

  it('resolves null while the bytes are still in the browser', async () => {
    readJobMock.mockResolvedValue(row({ status: 'awaiting_upload' }));
    await expect(getJob(USER, JOB_A)).resolves.toBeNull();
  });

  it('resolves the owner’s job with same-origin URLs', async () => {
    readJobMock.mockResolvedValue(row());
    const job = await getJob(USER, JOB_A);
    expect(job?.id).toBe(JOB_A);
    expect(job?.report_url).toBe(`/api/studio/analyzer/jobs/${JOB_A}/report`);
  });
});
