/**
 * GET /api/studio/analyzer/jobs/{id}/thumbnail — the poster frame, same-origin.
 *
 * PRD 1 §8.8.7's media-route rules: a bare, EMPTY-BODY 404 covers unknown, not
 * yours, no poster frame, AND a worker that is down, slow or past the 10 s read
 * timeout. A broken tile is the right user experience; a 502 inside an <img> is
 * not. 400 / 401 / 403 / 503 still use the JSON envelope.
 */

import { NextResponse } from 'next/server';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../../lib/auth';
import { isUuid } from '../../../../../../../lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

const missing = () => new Response(null, { status: 404 });

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

  try {
    const upstream = await fetch(
      `${base}/media/${encodeURIComponent(id)}/thumbnail.jpg`,
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
    // The body is read to completion INSIDE the armed signal and only then
    // written to the response. Never `new Response(upstream.body, …)`, which
    // lets undici truncate a JPEG under a 200.
    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (cause) {
    console.error('[studio/analyzer] thumbnail read failed', cause);
    return missing();
  }
}
