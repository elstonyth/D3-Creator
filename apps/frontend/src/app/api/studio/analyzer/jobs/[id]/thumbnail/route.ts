/**
 * GET /api/studio/analyzer/jobs/{id}/thumbnail — the poster frame.
 *
 * PRD 1 §8.8.7, phase 2. A 302 to a short-lived signed Storage URL, like the
 * video route; `img-src` already allows the bucket host. The poster exists
 * from the end of the compressing step, so a running job may have one.
 *
 * Unknown, not yours, or no poster: a bare, empty-body 404 — the
 * <ImageWithFallback> tile handles that and nothing else.
 */

import { NextResponse } from 'next/server';

import { readJob, signedUrl } from '../../../../../../../lib/analyzer-store';
import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../../lib/auth';
import { isUuid } from '../../../../../../../lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEDIA_URL_SECONDS = 3600;

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

const missing = () => new Response(null, { status: 404 });

export async function GET(
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

  try {
    const row = await readJob(id);
    if (
      row === null ||
      row.user_id !== auth.userId ||
      row.thumbnail_path === null
    ) {
      return missing();
    }
    const url = await signedUrl(row.thumbnail_path, MEDIA_URL_SECONDS);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (cause) {
    console.error('[studio/analyzer] thumbnail read failed', cause);
    return missing();
  }
}
