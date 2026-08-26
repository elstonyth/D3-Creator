/**
 * apps/frontend/src/lib/analyzer.ts — server-only.
 *
 * The two Server-Component reads and the URL rewrite. PRD 1 §8.8.13 owns the
 * wire contract; PRD 3 §5.9.3 owns what the pages do with it. This file exports
 * exactly three functions and no more.
 *
 * `listJobs` THROWS on any failure and returns [] only when the worker genuinely
 * returned an empty array. Returning [] from a failure path is a defect, not a
 * fallback: it renders "No reports yet", which tells a user their reports are
 * gone.
 */

import type { AnalyzerJob, AnalyzerJobSummary } from '@d3/analyzer';

import { isUuid } from './ids'; // the Next-side copy, never @d3/analyzer's (§8.4)

/** §8.8.3. The poll and both reads here share one 10 s ceiling. */
const READ_TIMEOUT_MS = 10_000;

/**
 * §8.8.1. NO CODE FALLBACK ANYWHERE — unset throws, and that branch must stay
 * reachable: the page turns it into the unavailable line and the Next routes
 * turn it into §8.8.7's 503.
 */
function serviceBase(): string {
  const base = (process.env.ANALYZER_SERVICE_URL ?? '').replace(/\/+$/, '');
  if (base === '') throw new Error('ANALYZER_SERVICE_URL is not set');
  return base;
}

function serviceHeaders(userId: string): Record<string, string> {
  return {
    authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
    'x-d3-user-id': userId,
  };
}

/**
 * §8.8.13's row guard. It does NOT look for a `result` key — the summary type
 * has none — and accepts no camelCase alias for anything.
 */
function isJobSummary(row: unknown): row is AnalyzerJobSummary {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    isUuid(r.id) &&
    (r.status === 'queued' ||
      r.status === 'running' ||
      r.status === 'done' ||
      r.status === 'failed') &&
    typeof r.filename === 'string' &&
    typeof r.created_at === 'string' &&
    (r.overall_score === null || typeof r.overall_score === 'number')
  );
}

/**
 * §C1.2.5 / PRD 3 §5.9.3. Replaces the worker's three URL fields with
 * same-origin Next paths; null stays null.
 *
 * The browser must never use the analyzer's own values: they are
 * `http://127.0.0.1:4310/media/…`, unreachable from a browser, and
 * `media-src 'self'` kills them silently in production while they work in
 * `next dev`. Rewriting here discharges the prohibition by construction — no
 * page and no component builds a media URL by hand.
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

/**
 * Newest-first, at most 50. THROWS on any failure; returns [] only when the
 * worker genuinely returned an empty array.
 */
export async function listJobs(userId: string): Promise<AnalyzerJobSummary[]> {
  const base = serviceBase(); // 1
  const response = await fetch(`${base}/api/results?limit=50`, {
    // 2 — the Next side never filters by user itself; it cannot, the header is
    // the scope.
    headers: serviceHeaders(userId),
    cache: 'no-store',
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!response.ok) {
    // 3
    throw new Error(`analyzer /api/results answered ${response.status}`);
  }
  const body: unknown = await response.json(); // 3 — a parse failure throws
  if (!Array.isArray(body)) {
    // 4 — an unrecognised body is a failed read, never zero rows.
    throw new Error('analyzer /api/results did not return an array');
  }
  const rows = body.filter(isJobSummary); // 5 — a malformed element is dropped
  // 6 — created_at is ISO 8601 UTC always ending Z, so localeCompare is
  // chronological. Sorted locally rather than trusting upstream order.
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows.slice(0, 50).map(toBrowserJob); // 7
}

/**
 * The one job, or null when the worker answered 404 (unknown id, or not this
 * user's — §8.8.5). THROWS on every other failure.
 *
 * It does NOT validate the id: `isUuid(id)` is checked by the caller before the
 * call, so a malformed id is a 400 or a notFound() rather than a silent null
 * that looks like "not yours".
 */
export async function getJob(
  userId: string,
  jobId: string,
): Promise<AnalyzerJob | null> {
  const base = serviceBase();
  const response = await fetch(
    `${base}/api/result/${encodeURIComponent(jobId)}`,
    {
      headers: serviceHeaders(userId),
      cache: 'no-store',
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`analyzer /api/result answered ${response.status}`);
  }
  // The §8.7.9 document as received; there is no envelope to unwrap.
  const job = (await response.json()) as AnalyzerJob;
  return toBrowserJob(job);
}
