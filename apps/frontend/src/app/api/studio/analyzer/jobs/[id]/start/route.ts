/**
 * POST /api/studio/analyzer/jobs/{id}/start — the bytes are in the bucket.
 *
 * PRD 1 §8.8.10, the upload path's third leg. Probes the object through a
 * signed URL (ffmpeg reads https directly — nothing is downloaded into the
 * function), applies §8.5's upload-time validation, flips the row from
 * `awaiting_upload` to `queued`, and runs the pipeline after the 202.
 *
 * A validation failure is a TERMINAL ROW, not a bare 400: the row already
 * exists, the user is looking at the progress panel, and §6.3's copy for
 * `too_long` / `no_video_stream` is better than "the upload did not go
 * through". The source object is deleted either way.
 */

import { NextResponse, after } from 'next/server';

import { MAX_DURATION_SECONDS } from '@d3/analyzer';
import { FFPROBE_TIMEOUT_MS } from '@d3/analyzer/config';
import { probeVideo } from '@d3/analyzer/ffmpeg';

import { toBrowserJob } from '../../../../../../../lib/analyzer';
import { ffmpegBinary, runJob } from '../../../../../../../lib/analyzer-run';
import {
  patchJob,
  readJob,
  removeObjects,
  signedUrl,
  sourcePath,
  toPublicJob,
  type JobRow,
} from '../../../../../../../lib/analyzer-store';
import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../../lib/auth';
import { isUuid } from '../../../../../../../lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** The pipeline runs after the response, inside this invocation. */
export const maxDuration = 800;

/** Long enough for the probe now and both ffmpeg passes inside RUN_BUDGET_MS. */
const SOURCE_URL_SECONDS = 3600;

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function accepted(row: JobRow): Response {
  return NextResponse.json(
    { ok: true, job: toBrowserJob(toPublicJob(row)) },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let auth: AuthContext | null;
  try {
    auth = await getAuthContext();
  } catch {
    return jsonError(500, 'internal error');
  }
  if (!auth) return jsonError(401, 'unauthorized');
  if (!isStudioMember(auth)) return jsonError(403, 'forbidden');

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(400, 'invalid job id');

  let row: JobRow | null;
  try {
    row = await readJob(id);
  } catch (cause) {
    console.error('[studio/analyzer] start read failed', cause);
    return jsonError(500, 'internal error');
  }
  // 404 on a mismatch — never 403, which confirms the id exists (§8.8.5).
  if (row === null || row.user_id !== auth.userId) {
    return jsonError(404, 'job not found');
  }
  // A second click on a job already under way just re-attaches the client.
  if (row.status !== 'awaiting_upload') return accepted(row);
  if (row.source_ext === null) return jsonError(500, 'internal error');

  const object = sourcePath(id, row.source_ext);
  let source: string;
  try {
    source = await signedUrl(object, SOURCE_URL_SECONDS);
  } catch (cause) {
    console.error('[studio/analyzer] source url failed', cause);
    return jsonError(500, 'internal error');
  }

  const probe = await probeVideo(
    await ffmpegBinary(),
    source,
    FFPROBE_TIMEOUT_MS,
  );
  const rejection =
    probe === null
      ? {
          code: 'no_video_stream' as const,
          message: 'the upload had no readable video stream',
        }
      : probe.durationRaw > MAX_DURATION_SECONDS
        ? {
            code: 'too_long' as const,
            message: `${probe.durationRaw} s is over the 300 s limit`,
          }
        : null;

  try {
    if (rejection !== null) {
      await removeObjects([object]);
      const failed = await patchJob(id, {
        status: 'failed',
        step: null,
        error: rejection,
        finished_at: new Date().toISOString(),
      });
      return failed === null
        ? jsonError(404, 'job not found')
        : accepted(failed);
    }
    const queued = await patchJob(id, {
      status: 'queued',
      duration_seconds: Math.round(probe!.durationRaw * 10) / 10,
      has_audio: probe!.hasAudio,
    });
    if (queued === null) return jsonError(404, 'job not found');
    after(() => runJob(id, { source, sourceObject: object }));
    return accepted(queued);
  } catch (cause) {
    console.error('[studio/analyzer] start write failed', cause);
    return jsonError(500, 'internal error');
  }
}
