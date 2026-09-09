/**
 * GET /api/studio/analyzer/jobs/{id} — poll one job.
 *
 * PRD 1 §8.8.3 step 2. The client island polls this every 3 s; the report page
 * does not (§8.8.6). Phase 2: the row is read straight from the store.
 */

import { NextResponse } from 'next/server';

import { getJob } from '../../../../../../lib/analyzer';
import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../lib/auth';
import { isUuid } from '../../../../../../lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // The single order for every handler: gate → isUuid(id) → read. An anonymous
  // caller with a malformed id gets 401, never 400.
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
    if (job === null) return jsonError(404, 'job not found');
    return NextResponse.json(
      { ok: true, job },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (cause) {
    console.error('[studio/analyzer] poll read failed', cause);
    return jsonError(500, 'internal error');
  }
}
