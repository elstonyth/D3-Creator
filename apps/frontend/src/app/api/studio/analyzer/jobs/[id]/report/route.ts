/**
 * GET /api/studio/analyzer/jobs/{id}/report — `report.txt` as bytes.
 *
 * PRD 1 §8.8.7. The Download button is a link to this route, gated on
 * `status === 'done'` and nothing else; the `Content-Disposition` is set HERE
 * and on no other route, so the filename is built in exactly one place.
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

/** RFC 5987 `attr-char`. `encodeURIComponent` is NOT this encoding — it leaves
 *  `'`, `*`, `(`, `)` and `!` bare, and those are not attr-char. */
const ATTR_CHAR = /[A-Za-z0-9!#$&+\-.^_`|~]/;

function stripExtension(filename: string): string {
  return filename.replace(/\.[^./\\]*$/, '');
}

function asciiFallback(stem: string): string {
  const cleaned = stem.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned === '' ? 'report' : cleaned;
}

function rfc5987(stem: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(stem)) {
    const char = String.fromCharCode(byte);
    out +=
      byte < 0x80 && ATTR_CHAR.test(char)
        ? char
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * A header value containing any character above U+00FF makes `new Response()`
 * throw a TypeError on Node, and this repo's filenames are routinely Chinese, so
 * the naive literal 500s the route on real data. Both forms, in this order.
 */
export function contentDisposition(filename: string): string {
  const stem = stripExtension(filename);
  return `attachment; filename="${asciiFallback(stem)}-report.txt"; filename*=UTF-8''${rfc5987(stem)}-report.txt`;
}

export async function GET(
  _request: Request,
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

  let filename: string;
  try {
    const job = await getJob(auth.userId, id);
    if (job === null || job.status !== 'done') return missing();
    filename = job.filename;
  } catch (cause) {
    console.error('[studio/analyzer] report job read failed', cause);
    return missing();
  }

  try {
    const upstream = await fetch(
      `${base}/media/${encodeURIComponent(id)}/report.txt`,
      {
        headers: {
          authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
          'x-d3-user-id': auth.userId,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!upstream.ok) return missing();
    // Read to completion inside the armed signal, then write.
    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (cause) {
    console.error('[studio/analyzer] report read failed', cause);
    return missing();
  }
}
