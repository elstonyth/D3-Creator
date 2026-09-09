/**
 * apps/frontend/src/lib/analyzer.ts — server-only.
 *
 * The two Server-Component reads and the URL rewrite. PRD 1 §8.8.13 owns the
 * wire contract; PRD 3 §5.9.3 owns what the pages do with it. This file exports
 * exactly three functions and no more.
 *
 * Phase 2 (PRD 1 §8.2): both reads come from `public.analyzer_job` through
 * lib/analyzer-store.ts. There is no worker process and no ANALYZER_SERVICE_URL
 * any more — the pipeline runs inside this app (lib/analyzer-run.ts).
 *
 * `listJobs` THROWS on any failure and returns [] only when the table genuinely
 * holds no rows for the user. Returning [] from a failure path is a defect, not
 * a fallback: it renders "No reports yet", which tells a user their reports are
 * gone.
 */

import type { AnalyzerJob, AnalyzerJobSummary } from '@d3/analyzer';

import {
  listRows,
  readJob,
  toPublicJob,
  toPublicSummary,
} from './analyzer-store';

const HISTORY_LIMIT = 50;

/**
 * §C1.2.5 / PRD 3 §5.9.3. Pins the three URL fields to same-origin Next paths;
 * null stays null. The store already emits these paths, so this is a no-op on
 * a store row — it is kept as the ONE place the browser-facing shape is
 * asserted, and so a value from anywhere else can never reach a page.
 */
export function toBrowserJob<T extends AnalyzerJob | AnalyzerJobSummary>(
  job: T,
): T {
  const base = `/api/studio/analyzer/jobs/${job.id}`;
  return {
    ...job,
    video_url: job.video_url === null ? null : `${base}/video`,
    thumbnail_url: job.thumbnail_url === null ? null : `${base}/thumbnail`,
    report_url: job.report_url === null ? null : `${base}/report`,
  };
}

/** Newest-first, at most 50. THROWS on any failure. */
export async function listJobs(userId: string): Promise<AnalyzerJobSummary[]> {
  const rows = await listRows(userId, HISTORY_LIMIT);
  return rows.map((row) => toBrowserJob(toPublicSummary(row)));
}

/**
 * The one job, or null when it does not exist, is not this user's (§8.8.5 —
 * never a 403, which confirms the id exists), or is still waiting for its
 * bytes. THROWS on every other failure.
 *
 * It does NOT validate the id: `isUuid(id)` is checked by the caller before the
 * call, so a malformed id is a 400 or a notFound() rather than a silent null
 * that looks like "not yours".
 */
export async function getJob(
  userId: string,
  jobId: string,
): Promise<AnalyzerJob | null> {
  const row = await readJob(jobId);
  if (row === null || row.user_id !== userId) return null;
  if (row.status === 'awaiting_upload') return null;
  return toBrowserJob(toPublicJob(row));
}
