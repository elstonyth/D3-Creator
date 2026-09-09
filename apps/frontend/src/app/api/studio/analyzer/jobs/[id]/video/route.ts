/**
 * GET /api/studio/analyzer/jobs/{id}/video — the compressed MP4.
 *
 * PRD 1 §8.8.7, phase 2. Answers a 302 to a short-lived signed Storage URL:
 * Supabase serves the bytes with `Accept-Ranges` and `206`s, which is what
 * clicking a transcript line to seek the player needs, and nothing streams
 * through a function. `media-src` in next.config.js allows the bucket host.
 *
 * Every job-related failure — unknown, not yours, or a job that never reached
 * `done` — is the same bare, empty-body 404. A JSON envelope delivered into a
 * <video> element is not a failure any client handles.
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

/** Long enough to scrub through a report; the page mints a fresh one per load. */
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
      row.status !== 'done' ||
      row.video_path === null
    ) {
      return missing();
    }
    const url = await signedUrl(row.video_path, MEDIA_URL_SECONDS);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (cause) {
    console.error('[studio/analyzer] video read failed', cause);
    return missing();
  }
}
