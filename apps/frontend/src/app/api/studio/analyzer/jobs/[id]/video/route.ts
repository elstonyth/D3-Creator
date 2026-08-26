/**
 * GET /api/studio/analyzer/jobs/{id}/video — the compressed MP4, same-origin
 * and Range-capable.
 *
 * PRD 1 §8.8.7. The incoming `Range` header is forwarded to the worker and
 * `206`, `Content-Range` and `Accept-Ranges` come straight back: clicking a
 * transcript line to seek the video does not work without it.
 *
 * Every job-related failure — unknown, not yours, or a job that never reached
 * `done` — and every worker failure is the same bare, empty-body 404. A JSON
 * envelope delivered into a <video> element is not a failure any client handles.
 */

import { NextResponse } from 'next/server';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../../lib/auth';
import { getJob } from '../../../../../../../lib/analyzer';
import { isUuid } from '../../../../../../../lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

const missing = () => new Response(null, { status: 404 });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const base = (process.env.ANALYZER_SERVICE_URL ?? '').replace(/\/+$/, '');
  if (base === '') return jsonError(503, 'analyzer not configured');

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

  try {
    const job = await getJob(auth.userId, id);
    if (job === null || job.status !== 'done') return missing();
  } catch (cause) {
    console.error('[studio/analyzer] video job read failed', cause);
    return missing();
  }

  // 10 s to reach the worker and receive headers, then DISARMED. A signal that
  // is still armed also aborts the response body in undici, which truncates any
  // Range read slower than ten seconds and stops the player mid-seek.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let upstream: Response;
  try {
    const range = request.headers.get('range');
    upstream = await fetch(
      `${base}/media/${encodeURIComponent(id)}/compressed.mp4`,
      {
        headers: {
          authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
          'x-d3-user-id': auth.userId,
          ...(range === null ? {} : { range }),
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );
  } catch (cause) {
    console.error('[studio/analyzer] video fetch failed', cause);
    return missing();
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) return missing();

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  });
  const contentRange = upstream.headers.get('content-range');
  if (contentRange !== null) headers.set('Content-Range', contentRange);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength !== null) headers.set('Content-Length', contentLength);

  return new Response(upstream.body, { status: upstream.status, headers });
}
