/**
 * POST /api/studio/analyzer/jobs — create a job.
 *
 * PRD 1 §8.8.3, phase 2 (§8.2, §8.8.10). Two JSON bodies:
 *
 *   { url, report_language?, business_profile? }
 *     The link path. Resolves the post, downloads the bytes into the function's
 *     scratch dir, probes them, writes a `queued` row and answers 202 with the
 *     job. The pipeline then runs in this same invocation, after the response.
 *
 *   { upload: { filename, size_bytes }, report_language?, business_profile? }
 *     The upload path. Writes an `awaiting_upload` row and answers 200 with a
 *     signed Storage target. THE FILE NEVER PASSES THROUGH THIS FUNCTION — a
 *     Vercel request body is capped at 4.5 MB — the browser puts it straight
 *     into the bucket, then calls POST /jobs/{id}/start.
 *
 * Every failure is `{ ok:false, error }` with the machine string the client
 * switches on (lib/analyzer-contract.ts); the string is never rendered.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse, after } from 'next/server';

import {
  ALLOWED_EXTENSIONS,
  MAX_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  type ReportLanguage,
} from '@d3/analyzer';
import { FFPROBE_TIMEOUT_MS, INGEST_BUDGET_MS } from '@d3/analyzer/config';
import { probeVideo } from '@d3/analyzer/ffmpeg';
import {
  IngestError,
  downloadToFile,
  resolveLink,
  type IngestFailure,
} from '@d3/analyzer/ingest';
import { parseBusinessProfile } from '@d3/analyzer/prompt';

import { toBrowserJob } from '../../../../../lib/analyzer';
import {
  ffmpegBinary,
  runJob,
  workDirFor,
} from '../../../../../lib/analyzer-run';
import {
  createUploadTarget,
  insertJob,
  sourcePath,
  toPublicJob,
} from '../../../../../lib/analyzer-store';
import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../lib/auth';
import { checkRateLimit } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // auth-dependent, never cached
/**
 * The link path resolves + downloads (up to INGEST_BUDGET_MS) before the 202,
 * and the pipeline runs after it (RUN_BUDGET_MS). Vercel Pro with Fluid
 * compute allows 800; lib/analyzer-store.ts's budgets are derived from it.
 */
export const maxDuration = 800;

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

/** The worker's status table for a link that failed before a job existed. */
const INGEST_STATUS: Record<IngestFailure, [number, string]> = {
  unsupported_link: [400, 'unsupported link'],
  facebook_unsupported: [400, 'facebook links are not supported'],
  rednote_needs_token: [400, 'rednote link needs a share token'],
  not_a_video: [400, 'that link is not a video'],
  resolve_failed: [502, 'could not read that link'],
  download_failed: [502, 'could not download that video'],
  too_large: [413, 'file is over the 2 GB limit'],
};

/** Chinese unless asked otherwise (owner decision 2026-09-09) — the page sends
 *  the user's choice explicitly; this is the fallback for a bare API call. */
function parseReportLanguage(raw: unknown): ReportLanguage {
  return raw === 'en' || raw === 'ms' ? raw : 'zh';
}

export async function POST(request: Request): Promise<Response> {
  let auth: AuthContext | null;
  try {
    auth = await getAuthContext();
  } catch {
    return jsonError(500, 'internal error'); // getAuthContext() re-throws by design
  }
  if (!auth) return jsonError(401, 'unauthorized');
  if (!isStudioMember(auth)) return jsonError(403, 'forbidden');

  // §8.8.5: 10 per hour per user and per IP, fail-open without Upstash.
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  for (const [prefix, key] of [
    ['analyzer-upload-user', auth.userId],
    ['analyzer-upload-ip', ip],
  ] as const) {
    const limit = await checkRateLimit({
      prefix,
      key,
      tokens: 10,
      window: '1 h',
    });
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: 'too many uploads' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    }
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonError(400, 'no video file');
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null) throw new Error('shape');
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError(400, 'no video link');
  }

  const reportLanguage = parseReportLanguage(body.report_language);
  const businessProfile = parseBusinessProfile(body.business_profile);

  if (typeof body.url === 'string') {
    return startLink(auth, body.url.trim(), reportLanguage, businessProfile);
  }
  if (typeof body.upload === 'object' && body.upload !== null) {
    return openUpload(
      auth,
      body.upload as Record<string, unknown>,
      reportLanguage,
      businessProfile,
    );
  }
  return jsonError(400, 'no video link');
}

// ───────────────────────────── the link path ─────────────────────────────

async function startLink(
  auth: AuthContext,
  url: string,
  reportLanguage: ReportLanguage,
  businessProfile: string | null,
): Promise<Response> {
  if (url === '') return jsonError(400, 'no video link');

  // The job id is minted here so the download can land in the job's own
  // scratch dir, which the runner deletes when it is done.
  const id = randomUUID();
  const workDir = workDirFor(id);
  const discard = () =>
    fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);

  let source: string;
  let filename: string;
  let bytes: number;
  try {
    // The whole ingest shares one deadline: resolve plus download.
    const signal = AbortSignal.timeout(INGEST_BUDGET_MS);
    const resolved = await resolveLink(url, signal);
    await fs.mkdir(workDir, { recursive: true });
    source = path.join(
      workDir,
      `source${path.extname(resolved.filename) || '.mp4'}`,
    );
    bytes = await downloadToFile(
      resolved.downloadUrl,
      source,
      MAX_UPLOAD_BYTES,
      signal,
    );
    filename = resolved.filename;
  } catch (cause) {
    await discard();
    if (cause instanceof IngestError) {
      console.error(
        `[studio/analyzer] ingest ${cause.failure}: ${cause.message}`,
      );
      const [status, message] = INGEST_STATUS[cause.failure];
      return jsonError(status, message);
    }
    console.error('[studio/analyzer] ingest failed', cause);
    return jsonError(500, 'internal error');
  }

  // ONE probe answers all three of §8.5's questions inside one 20 s kill.
  const probe = await probeVideo(
    await ffmpegBinary(),
    source,
    FFPROBE_TIMEOUT_MS,
  );
  if (probe === null) {
    await discard();
    return jsonError(400, 'unreadable video');
  }
  if (probe.durationRaw > MAX_DURATION_SECONDS) {
    await discard();
    return jsonError(400, 'video is longer than 5 minutes');
  }

  let row;
  try {
    row = await insertJob({
      id,
      user_id: auth.userId,
      status: 'queued',
      report_language: reportLanguage,
      filename,
      source_bytes: bytes,
      source_ext: '.mp4',
      duration_seconds: Math.round(probe.durationRaw * 10) / 10,
      has_audio: probe.hasAudio,
      business_profile: businessProfile,
    });
  } catch (cause) {
    await discard();
    console.error('[studio/analyzer] job insert failed', cause);
    return jsonError(500, 'internal error');
  }

  after(() => runJob(id, { source, sourceObject: null }));
  return NextResponse.json(
    { ok: true, job: toBrowserJob(toPublicJob(row)) },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ──────────────────────────── the upload path ────────────────────────────

async function openUpload(
  auth: AuthContext,
  upload: Record<string, unknown>,
  reportLanguage: ReportLanguage,
  businessProfile: string | null,
): Promise<Response> {
  const filename =
    typeof upload.filename === 'string' ? upload.filename.trim() : '';
  if (filename === '' || filename.length > 512) {
    return jsonError(400, 'no video file');
  }
  // Extension, not MIME, and BEFORE the size check: an oversize file with a
  // bad extension is 415, never 413 (§8.5).
  const ext = path.extname(filename).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return jsonError(415, 'unsupported format');
  }
  const size = upload.size_bytes;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    return jsonError(400, 'no video file');
  }
  if (size > MAX_UPLOAD_BYTES) {
    return jsonError(413, 'file is over the 2 GB limit');
  }

  const id = randomUUID();
  try {
    await insertJob({
      id,
      user_id: auth.userId,
      status: 'awaiting_upload',
      report_language: reportLanguage,
      filename,
      source_bytes: size,
      source_ext: ext,
      duration_seconds: null,
      has_audio: null,
      business_profile: businessProfile,
    });
    const target = await createUploadTarget(sourcePath(id, ext));
    return NextResponse.json(
      { ok: true, job_id: id, upload: target },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (cause) {
    console.error('[studio/analyzer] upload open failed', cause);
    return jsonError(500, 'internal error');
  }
}
