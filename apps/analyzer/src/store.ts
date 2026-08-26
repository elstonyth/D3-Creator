/**
 * The job store — PRD 1 §8.1 and §8.7.9. One JSON document per job at
 * `var/jobs/<id>/job.json`. No database in phase 1.
 *
 * `job.json` and `worker.json` are each written to a `.tmp` sibling and renamed,
 * so a poll landing mid-write never reads half a file. A `.tmp` left behind by a
 * crash is never read by anything and is overwritten by the next write of its
 * own file; nothing sweeps it.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { JOBS_DIR, MEDIA_BASE_URL } from './config';
import type { AnalyzerJob, AnalyzerJobSummary, JobStatus } from './contract';

/**
 * §C1.2.4. The stored document is `AnalyzerJob` plus the ONE field the worker
 * adds. Scratch state lives in `worker.json` beside it, never here.
 */
export type StoredJob = AnalyzerJob & {
  user_id: string;
  /**
   * Amendment 1 Part D. The already-rendered §10A.6 profile block, or null.
   * Lives HERE and not in `contract.ts`: the profile is an input, and PRD 1
   * §8.7.9 declares the result type, which does not change.
   */
  business_profile?: string | null;
};

/** §8.1. The worker's private scratch record. Never merged, never in a response. */
export interface WorkerRecord {
  has_audio: boolean;
  source_ext: string;
}

export function newJobId(): string {
  return randomUUID();
}

export function jobDir(id: string): string {
  return path.join(JOBS_DIR, id);
}

export function jobPath(id: string, name: string): string {
  return path.join(JOBS_DIR, id, name);
}

/** §C1.2.5. Built from the worker's own two variables, never ANALYZER_SERVICE_URL. */
export function mediaUrl(id: string, filename: string): string {
  return `${MEDIA_BASE_URL}/media/${id}/${filename}`;
}

async function writeAtomic(target: string, body: string): Promise<void> {
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, target);
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

export async function writeJob(job: StoredJob): Promise<void> {
  await writeAtomic(jobPath(job.id, 'job.json'), JSON.stringify(job, null, 2));
}

export async function readJob(id: string): Promise<StoredJob | null> {
  let raw: string;
  try {
    raw = await fs.readFile(jobPath(id, 'job.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as StoredJob;
  } catch {
    return null;
  }
}

/**
 * Read-modify-write. Every caller in the pipeline patches through here so a
 * write is always against the document currently on disk, never against a
 * stale in-memory copy (§8.5, "Timeout is an abort").
 */
export async function patchJob(
  id: string,
  patch: Partial<StoredJob>,
): Promise<StoredJob | null> {
  const current = await readJob(id);
  if (current === null) return null;
  const next: StoredJob = { ...current, ...patch };
  await writeJob(next);
  return next;
}

export async function writeWorkerRecord(
  id: string,
  record: WorkerRecord,
): Promise<void> {
  await writeAtomic(
    jobPath(id, 'worker.json'),
    JSON.stringify(record, null, 2),
  );
}

export async function readWorkerRecord(
  id: string,
): Promise<WorkerRecord | null> {
  let raw: string;
  try {
    raw = await fs.readFile(jobPath(id, 'worker.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<WorkerRecord>;
    if (
      typeof record.has_audio !== 'boolean' ||
      typeof record.source_ext !== 'string'
    ) {
      return null;
    }
    return { has_audio: record.has_audio, source_ext: record.source_ext };
  } catch {
    return null;
  }
}

async function allJobIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(JOBS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Every stored job, in no particular order. Callers scope and sort. */
export async function readAllJobs(): Promise<StoredJob[]> {
  const ids = await allJobIds();
  const jobs = await Promise.all(ids.map((id) => readJob(id)));
  return jobs.filter((job): job is StoredJob => job !== null);
}

/**
 * §8.4. The number of jobs whose STORED status is `queued`, across ALL users —
 * an operator number, never scoped to a caller. Read from disk, never from an
 * in-memory counter: after a restart the surviving `queued` jobs are exactly
 * what an operator is checking for, and a counter reports 0.
 */
export async function countQueued(): Promise<number> {
  const jobs = await readAllJobs();
  return jobs.filter((job) => job.status === 'queued').length;
}

/** FIFO — oldest `created_at` first (§8.5). */
export async function nextQueuedJob(): Promise<StoredJob | null> {
  const queued = (await readAllJobs()).filter((job) => job.status === 'queued');
  queued.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return queued[0] ?? null;
}

/** §8.5. Any job in a non-terminal, non-`queued` state when the worker starts. */
export async function interruptedJobs(): Promise<StoredJob[]> {
  const terminal: JobStatus[] = ['done', 'failed'];
  return (await readAllJobs()).filter(
    (job) => job.status !== 'queued' && !terminal.includes(job.status),
  );
}

// ───────────────────────── wire projections ─────────────────────────

/**
 * §8.8.4. A WHITELIST of exactly §8.7.9's declared fields, in that order — never
 * a blacklist, so a future internal field cannot leak because nobody remembered
 * to strip it. In practice it drops the single stored field `user_id`.
 */
export function toPublicJob(job: StoredJob): AnalyzerJob {
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    error: job.error,
    report_language: job.report_language,
    filename: job.filename,
    duration_seconds: job.duration_seconds,
    source_bytes: job.source_bytes,
    compressed_bytes: job.compressed_bytes,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    video_url: job.video_url,
    thumbnail_url: job.thumbnail_url,
    report_url: job.report_url,
    result: job.result,
  };
}

/**
 * The same whitelist against `AnalyzerJobSummary`: no `result` key at all — not
 * `result: null` — plus the hoisted `overall_score` the history table's Result
 * column reads.
 */
export function toPublicSummary(job: StoredJob): AnalyzerJobSummary {
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    error: job.error,
    report_language: job.report_language,
    filename: job.filename,
    duration_seconds: job.duration_seconds,
    source_bytes: job.source_bytes,
    compressed_bytes: job.compressed_bytes,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    video_url: job.video_url,
    thumbnail_url: job.thumbnail_url,
    report_url: job.report_url,
    overall_score: job.result?.overall_score ?? null,
  };
}

/**
 * §8.8.13's `limit`: an integer 1..50. Absent, unparseable, non-integer
 * (`25.5`, `25abc`), 0, negative or over 50 → 50. The declared domain is an
 * integer, so a numeric string that is not one falls to 50; it is never
 * truncated to 25.
 */
export const MAX_HISTORY_LIMIT = 50;

export function parseHistoryLimit(raw: unknown): number {
  if (typeof raw !== 'string') return MAX_HISTORY_LIMIT;
  if (!/^-?\d+$/.test(raw.trim())) return MAX_HISTORY_LIMIT;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > MAX_HISTORY_LIMIT) {
    return MAX_HISTORY_LIMIT;
  }
  return value;
}

/** Newest `created_at` first, scoped to one owner, capped at `limit`. */
export async function listSummaries(
  userId: string,
  limit: number,
): Promise<AnalyzerJobSummary[]> {
  const jobs = (await readAllJobs()).filter((job) => job.user_id === userId);
  jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return jobs.slice(0, limit).map(toPublicSummary);
}
