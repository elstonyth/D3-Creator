/**
 * apps/frontend/src/lib/analyzer-store.ts — server-only.
 *
 * The Video Analyzer's job store, phase 2 (PRD 1 §8.2): one row per job in
 * `public.analyzer_job`, media in the private `analyzer` Storage bucket. The
 * phase-1 worker kept `job.json` on a laptop disk; Vercel has no disk that
 * outlives a request, so the row IS the document and every read and write goes
 * through the service-role client. No role but service_role can touch either.
 *
 * This file owns the table name, the bucket name, the object paths and the two
 * wire projections. Nothing else spells any of them.
 */

import { getSupabaseAdmin } from '@d3/database';
import type {
  AnalysisResult,
  AnalyzerJob,
  AnalyzerJobSummary,
  JobError,
  JobStatus,
  JobStep,
  ReportLanguage,
} from '@d3/analyzer';

const TABLE = 'analyzer_job';
export const ANALYZER_BUCKET = 'analyzer';

/**
 * The whole-job clock, inside the function that runs it. 600 s, not PRD 1
 * §8.5's 900: the routes declare `maxDuration = 800` and the link path spends
 * up to INGEST_BUDGET_MS (180 s) resolving and downloading BEFORE the job
 * starts, so this is what is left with a margin. Vercel kills the function at
 * 800 s regardless; STALE_AFTER_MS is what a killed job is measured against.
 */
export const RUN_BUDGET_MS = 600_000;
/** A `queued`/`running` row untouched this long was killed before its terminal write. */
export const STALE_AFTER_MS = RUN_BUDGET_MS + 120_000;

/**
 * PRD 1 §8.8.10's one extra id: the row exists, the bytes are still in the
 * browser. DB-only — never serialised, never polled, never listed.
 */
export type StoredStatus = JobStatus | 'awaiting_upload';

export interface JobRow {
  id: string;
  user_id: string;
  status: StoredStatus;
  step: JobStep | null;
  error: JobError | null;
  report_language: ReportLanguage;
  filename: string;
  duration_seconds: number | null;
  source_bytes: number;
  compressed_bytes: number | null;
  source_ext: string | null;
  has_audio: boolean | null;
  business_profile: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  report_path: string | null;
  result: AnalysisResult | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

/** What a caller supplies; the database fills the rest. */
export type NewJobRow = Pick<
  JobRow,
  | 'id'
  | 'user_id'
  | 'status'
  | 'report_language'
  | 'filename'
  | 'source_bytes'
  | 'source_ext'
  | 'duration_seconds'
  | 'has_audio'
  | 'business_profile'
>;

export type JobPatch = Partial<
  Omit<JobRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

// ───────────────────────────── rows ─────────────────────────────

export async function insertJob(row: NewJobRow): Promise<JobRow> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data as JobRow;
}

/**
 * Every pipeline write goes through here, against the row as it is NOW: the
 * database is the one copy, so there is no stale in-memory document to patch
 * against (the phase-1 read-modify-write rule, discharged by construction).
 */
export async function patchJob(
  id: string,
  patch: JobPatch,
): Promise<JobRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

export async function readJob(id: string): Promise<JobRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

/** One owner's rows, newest first, `awaiting_upload` excluded. THROWS on failure. */
export async function listRows(
  userId: string,
  limit: number,
): Promise<JobRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'awaiting_upload')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as JobRow[];
}

// ───────────────────────── wire projections ─────────────────────────

/** PostgREST hands back `+00:00`; the contract says `Z` (§8.7.9). */
function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** `numeric` and `bigint` may arrive as strings; the contract says number. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A `queued`/`running` row that nothing has touched for STALE_AFTER_MS was
 * killed mid-job (a Vercel function has a hard ceiling) and can never finish.
 * Projected as failed rather than patched: reads never write.
 */
function liveStatus(
  row: JobRow,
): Pick<AnalyzerJob, 'status' | 'step' | 'error'> {
  if (
    (row.status === 'queued' || row.status === 'running') &&
    Date.now() - new Date(row.updated_at).getTime() > STALE_AFTER_MS
  ) {
    return {
      status: 'failed',
      step: null,
      error: {
        code: 'interrupted',
        message:
          'the function was stopped before the job wrote a terminal status',
      },
    };
  }
  // `awaiting_upload` never reaches a client (the list excludes it, the poll
  // 404s it); if one ever did, "queued" is the least wrong word.
  return {
    status: row.status === 'awaiting_upload' ? 'queued' : row.status,
    step: row.step,
    error: row.error,
  };
}

/**
 * §8.8.4's whitelist of exactly §8.7.9's fields. The three URL fields are
 * already the same-origin Next paths — the browser has nowhere else to fetch
 * from, and `toBrowserJob` (lib/analyzer.ts) is a no-op on them.
 */
export function toPublicJob(row: JobRow): AnalyzerJob {
  const base = `/api/studio/analyzer/jobs/${row.id}`;
  return {
    id: row.id,
    ...liveStatus(row),
    report_language: row.report_language,
    filename: row.filename,
    duration_seconds: num(row.duration_seconds),
    source_bytes: num(row.source_bytes) ?? 0,
    compressed_bytes: num(row.compressed_bytes),
    created_at: iso(row.created_at) ?? row.created_at,
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
    video_url: row.video_path === null ? null : `${base}/video`,
    thumbnail_url: row.thumbnail_path === null ? null : `${base}/thumbnail`,
    report_url: row.report_path === null ? null : `${base}/report`,
    result: row.result,
  };
}

/** The same whitelist, no `result` key, plus the hoisted `overall_score`. */
export function toPublicSummary(row: JobRow): AnalyzerJobSummary {
  const { result, ...rest } = toPublicJob(row);
  return { ...rest, overall_score: result?.overall_score ?? null };
}

// ───────────────────────────── objects ─────────────────────────────

export type MediaName = 'compressed.mp4' | 'thumbnail.jpg' | 'report.txt';

/** The user's full-quality upload. Deleted the moment the job is terminal. */
export function sourcePath(id: string, ext: string): string {
  return `${id}/source${ext}`;
}

export function mediaPath(id: string, name: MediaName): string {
  return `${id}/${name}`;
}

/**
 * A one-shot target the browser PUTs the file into directly. The signed token
 * authorises exactly this path and nothing else; the bucket has no policies.
 */
export async function createUploadTarget(
  path: string,
): Promise<{ bucket: string; path: string; token: string }> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ANALYZER_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return { bucket: ANALYZER_BUCKET, path: data.path, token: data.token };
}

export async function signedUrl(
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ANALYZER_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadObject(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .storage.from(ANALYZER_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
}

/** The object as UTF-8 text, or null when it is not there. */
export async function downloadText(path: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ANALYZER_BUCKET)
    .download(path);
  if (error || !data) return null;
  return data.text();
}

/** Best effort, never throws — a leftover object is a cost, not a failure. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getSupabaseAdmin()
    .storage.from(ANALYZER_BUCKET)
    .remove(paths);
  if (error) console.error('[studio/analyzer] object removal failed', error);
}
